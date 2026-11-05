import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGenerationInputFromDb, normalizeCooking } from "./buildGenerationInput.ts";
import { DEFAULT_COOKING } from "./recipes/types.ts";

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

// --- Cooking preferences (migration 015) ---

function fakeSupabaseNoCooking(profile, code) {
  const base = fakeSupabase(profile);
  return {
    from(table) {
      const inner = base.from(table);
      return {
        select(columns) {
          if (table === "profiles" && /\bcooking_level\b/.test(columns)) {
            const failing = { maybeSingle: () => Promise.resolve({ data: null, error: { code, message: "column does not exist" } }) };
            return { eq: () => failing };
          }
          return inner.select(columns);
        },
      };
    },
  };
}

test("cooking columns are read in their own query, never in the main profile query", async () => {
  const supabase = fakeSupabase({ ...baseProfile });
  await buildGenerationInputFromDb(supabase, "u1");
  const cookingSelects = supabase.selects.filter(([table, columns]) => table === "profiles" && /\bcooking_level\b/.test(columns));
  assert.equal(cookingSelects.length, 1);
  assert.equal(cookingSelects[0][1].replace(/\s/g, ""), "cooking_weekday_minutes,cooking_level,kitchen_appliances,batch_cooking");
});

test("missing cooking columns (old DB) give the defaults", async () => {
  for (const code of ["42703", "PGRST204"]) {
    const { data, error } = await buildGenerationInputFromDb(fakeSupabaseNoCooking({ ...baseProfile }, code), "u1");
    assert.equal(error, null, code);
    assert.deepEqual(data.cooking, DEFAULT_COOKING, code);
  }
});

test("unanswered cooking columns (NULL) give the defaults", async () => {
  const { data } = await buildGenerationInputFromDb(fakeSupabase({ ...baseProfile }), "u1");
  assert.deepEqual(data.cooking, DEFAULT_COOKING);
});

test("valid cooking answers pass through", async () => {
  const { data } = await buildGenerationInputFromDb(
    fakeSupabase({ ...baseProfile, cooking_weekday_minutes: 30, cooking_level: "enjoys", kitchen_appliances: ["microondas", "horno"], batch_cooking: true }),
    "u1",
  );
  assert.deepEqual(data.cooking, { weekdayMinutes: 30, level: "enjoys", appliances: ["microondas", "horno"], batch: true });
});

test("invalid values fall back per field", () => {
  assert.deepEqual(
    normalizeCooking({ cooking_weekday_minutes: 15, cooking_level: "chef", kitchen_appliances: ["horno", "x"], batch_cooking: "yes" }),
    { weekdayMinutes: 20, level: "basic", appliances: ["horno"], batch: false },
  );
});

test("empty appliance list falls back to estufa + licuadora", () => {
  for (const kitchen of [[], ["x", 5, null], "estufa", null, undefined]) {
    assert.deepEqual(normalizeCooking({ kitchen_appliances: kitchen }).appliances, ["estufa", "licuadora"], String(kitchen));
  }
});

test("non-object rows give the defaults", () => {
  for (const row of [null, undefined, "x", 5, []]) {
    assert.deepEqual(normalizeCooking(row), DEFAULT_COOKING, String(row));
  }
});

test("appliances are de-duplicated and capped by the allowed list", () => {
  assert.deepEqual(normalizeCooking({ kitchen_appliances: ["horno", "horno", "estufa"] }).appliances, ["horno", "estufa"]);
});

test("the default appliance list is a fresh copy, never the frozen constant", () => {
  const first = normalizeCooking(null);
  assert.notEqual(first.appliances, DEFAULT_COOKING.appliances);
  assert.equal(Object.isFrozen(first.appliances), false);
  first.appliances.push("horno");
  assert.deepEqual(normalizeCooking(null).appliances, ["estufa", "licuadora"]);
  assert.deepEqual([...DEFAULT_COOKING.appliances], ["estufa", "licuadora"]);
});
