import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGenerationInputFromDb } from "./buildGenerationInput.ts";

function fakeSupabase(profile) {
  const selects = [];
  const tables = {
    profiles: { maybeSingle: () => Promise.resolve({ data: profile, error: null }) },
  };
  const lists = {
    user_goals: [{ goal_type: "healthy" }],
    user_supermarkets: [{ supermarket_id: "D1" }],
  };

  return {
    selects,
    from(table) {
      return {
        select(columns) {
          selects.push([table, columns]);
          const result = {
            eq: () => (table === "profiles" ? tables.profiles : Promise.resolve({ data: lists[table], error: null })),
          };
          return result;
        },
      };
    },
  };
}

const baseProfile = {
  weekly_budget_cop: 300000,
  dietary_restrictions: [],
  age: 30,
  weight_kg: 70,
  height_cm: 170,
  activity_level: "moderate",
  sex: "male",
  household_size: 1,
};

async function cityFor(city) {
  const supabase = fakeSupabase({ ...baseProfile, city });
  const { data, error } = await buildGenerationInputFromDb(supabase, "u1");

  assert.equal(error, null);
  return { city: data.city, supabase };
}

test("a valid city passes through and is selected from profiles", async () => {
  const { city, supabase } = await cityFor("bucaramanga");

  assert.equal(city, "bucaramanga");
  assert.ok(supabase.selects.some(([table, columns]) => table === "profiles" && /\bcity\b/.test(columns)));
});

test("an invalid or missing city becomes null", async () => {
  for (const value of ["Bucaramanga; drop", "Bucaramanga", "a", "x".repeat(41), "", null, undefined, 5]) {
    assert.equal((await cityFor(value)).city, null, String(value));
  }
});

function fakeSupabasePreMigration(profile, code) {
  const base = fakeSupabase(profile);
  return {
    from(table) {
      const inner = base.from(table);
      return {
        select(columns) {
          if (table === "profiles" && /\bcity\b/.test(columns)) {
            const failing = { maybeSingle: () => Promise.resolve({ data: null, error: { code, message: 'column "city" does not exist' } }) };
            return { eq: () => failing };
          }
          return inner.select(columns);
        },
      };
    },
  };
}

test("when the city column is missing (migration 010 not applied) the input is still built with city null", async () => {
  for (const code of ["42703", "PGRST204"]) {
    const before = await buildGenerationInputFromDb(fakeSupabase({ ...baseProfile }), "u1");
    const after = await buildGenerationInputFromDb(fakeSupabasePreMigration({ ...baseProfile }, code), "u1");

    assert.equal(after.error, null, code);
    assert.equal(after.data.city, null, code);
    assert.deepEqual({ ...after.data, city: null }, { ...before.data, city: null }, code);
  }
});
