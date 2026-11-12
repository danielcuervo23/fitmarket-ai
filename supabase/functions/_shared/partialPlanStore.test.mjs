import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PARTIAL_WEEK_CHARS,
  PARTIAL_PLAN_TTL_MS,
  generationFingerprint,
  storePartialWeek,
  takePartialWeek,
} from "./partialPlanStore.ts";

const request = {
  weeklyBudgetCop: 250_000,
  goals: ["healthy", "save"],
  stores: ["Exito", "D1"],
  restrictions: ["fish"],
  householdSize: 2,
  profile: { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" },
  cooking: { weekdayMinutes: 20, level: "basic", appliances: ["estufa", "licuadora"], batch: false },
  city: "bogota",
};
const NOW = Date.parse("2026-11-12T15:00:00Z");
const fp = (over = {}, now = NOW) => generationFingerprint({ ...request, ...over }, now);

// ---------------------------------------------------------------- fingerprint

test("fingerprint: 64 hex chars, stable, independent of list order and of allowPartial", async () => {
  const a = await fp();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await fp(), a);
  assert.equal(await fp({ goals: ["save", "healthy"], stores: ["D1", "Exito"] }), a);
  assert.equal(await fp({ cooking: { ...request.cooking, appliances: ["licuadora", "estufa"] } }), a);
  assert.equal(await fp({ allowPartial: true }), a, "the retry differs only by the flag");
});

test("fingerprint changes with every generation input", async () => {
  const a = await fp();
  const changes = [
    { weeklyBudgetCop: 260_000 },
    { goals: ["healthy"] },
    { stores: ["Exito"] },
    { restrictions: [] },
    { householdSize: 1 },
    { profile: { ...request.profile, weightKg: 66 } },
    { profile: { ...request.profile, sex: null } },
    { cooking: { ...request.cooking, batch: true } },
    { cooking: { ...request.cooking, weekdayMinutes: 30 } },
    { health: ["diabetes"] },
    { city: "medellin" },
  ];
  for (const change of changes) assert.notEqual(await fp(change), a, JSON.stringify(change));
});

test("fingerprint changes with the price date (Bogotá day) and the recipe library version", async () => {
  const a = await fp();
  assert.notEqual(await fp({}, NOW + 24 * 3_600_000), a);
  assert.equal(await fp({}, NOW + 60_000), a);
  assert.notEqual(await generationFingerprint(request, NOW, "other_library"), a);
});

// ---------------------------------------------------------------- store

function fakeClient(result = { error: null }) {
  const calls = [];
  const chain = {
    upsert(row, options) {
      calls.push({ op: "upsert", row, options });
      return { abortSignal: () => Promise.resolve(result) };
    },
    delete() {
      calls.push({ op: "delete" });
      return chain;
    },
    eq(column, value) {
      calls.push({ op: "eq", column, value });
      return chain;
    },
    gt(column, value) {
      calls.push({ op: "gt", column, value });
      return chain;
    },
    select(columns) {
      calls.push({ op: "select", columns });
      return { abortSignal: () => Promise.resolve(result) };
    },
  };
  return { calls, from: (table) => (calls.push({ op: "from", table }), chain) };
}

const WEEK = { lun: { desayuno: { name: { es: "a", en: "a" }, items: [{ id: "huevo", qty: 2 }], recipeId: "changua" } } };
const FP = "a".repeat(64);
const USER = "00000000-0000-4000-8000-000000000001";

test("store: one row per user (upsert on user_id) with the fingerprint, the week and a 30-minute expiry", async () => {
  const client = fakeClient();
  assert.equal(await storePartialWeek(client, USER, FP, { week: WEEK }, NOW), true);
  const upsert = client.calls.find((c) => c.op === "upsert");
  assert.deepEqual(upsert.row, {
    user_id: USER,
    fingerprint: FP,
    week: WEEK,
    expires_at: new Date(NOW + PARTIAL_PLAN_TTL_MS).toISOString(),
  });
  assert.deepEqual(upsert.options, { onConflict: "user_id" });
  assert.equal(PARTIAL_PLAN_TTL_MS, 30 * 60_000);
});

test("store: no service client, a bad fingerprint or an oversized week stores nothing", async () => {
  assert.equal(await storePartialWeek(null, USER, FP, { week: WEEK }, NOW), false);
  const client = fakeClient();
  assert.equal(await storePartialWeek(client, USER, "nope", { week: WEEK }, NOW), false);
  const huge = { lun: { x: "y".repeat(MAX_PARTIAL_WEEK_CHARS) } };
  assert.equal(await storePartialWeek(client, USER, FP, { week: huge }, NOW), false);
  assert.equal(client.calls.length, 0);
});

test("store: a database error is logged as a code and reported as false", async () => {
  const logs = [];
  const original = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    assert.equal(await storePartialWeek(fakeClient({ error: { code: "42P01" } }), USER, FP, { week: WEEK }, NOW), false);
  } finally {
    console.log = original;
  }
  assert.deepEqual(logs, [JSON.stringify({ event: "partial_plan_store_failed", code: "42P01" })]);
});

// ---------------------------------------------------------------- take (single use)

test("take: one atomic delete of the user's unexpired row with this fingerprint, returning the week", async () => {
  const client = fakeClient({ data: [{ week: WEEK }], error: null });
  assert.deepEqual(await takePartialWeek(client, USER, FP, NOW), { week: WEEK });
  assert.deepEqual(
    client.calls.filter((c) => c.op !== "from"),
    [
      { op: "delete" },
      { op: "eq", column: "user_id", value: USER },
      { op: "eq", column: "fingerprint", value: FP },
      { op: "gt", column: "expires_at", value: new Date(NOW).toISOString() },
      { op: "select", columns: "week" },
    ],
  );
  assert.deepEqual(client.calls[0], { op: "from", table: "partial_plan_results" });
});

test("take: nothing stored, expired, an error or a bad fingerprint give null", async () => {
  assert.equal(await takePartialWeek(fakeClient({ data: [], error: null }), USER, FP, NOW), null);
  assert.equal(await takePartialWeek(fakeClient({ data: null, error: { code: "PGRST" } }), USER, FP, NOW), null);
  const untouched = fakeClient({ data: [{ week: WEEK }], error: null });
  assert.equal(await takePartialWeek(untouched, USER, "x", NOW), null);
  assert.equal(untouched.calls.length, 0);
});

// ---------------------------------------------------------------- reuse flow, end to end

import { before } from "node:test";
import { reusePartialPlan } from "./partialPlanStore.ts";
import { baseInput, loadSolver, rotationModel } from "./planner/generate.fixtures.mjs";
import { generatePlan } from "./planner/generate.ts";
import { optimizeWeek } from "./planner/optimizer/optimize.ts";

before(loadSolver);

/** An in-memory partial_plan_results table with the same semantics as the real queries. */
function memoryTable() {
  const rows = new Map();
  const client = {
    rows,
    from: () => ({
      upsert: (row) => ({ abortSignal: async () => (rows.set(row.user_id, { ...row }), { error: null }) }),
      delete: () => {
        const filters = [];
        const chain = {
          eq: (column, value) => (filters.push((r) => r[column] === value), chain),
          gt: (column, value) => (filters.push((r) => r[column] > value), chain),
          select: () => ({
            abortSignal: async () => {
              const hit = [...rows.values()].filter((r) => filters.every((f) => f(r)));
              hit.forEach((r) => rows.delete(r.user_id));
              return { data: hit.map((r) => ({ week: structuredClone(r.week) })), error: null };
            },
          }),
        };
        return chain;
      },
    }),
  };
  return client;
}

const relaxedOptimizer = {
  prepare: async () => true,
  loadError: () => null,
  optimize: (input) => {
    const r = optimizeWeek({ ...input, log: () => {} });
    return { ...r, status: "relaxed", shortfalls: [{ rule: "protein_min", level: 2, unit: "g_per_kg", target: 1.6, achieved: 1.3 }], requiredBudgetCop: null };
  },
};

async function firstAttempt(table, input) {
  const outcome = await generatePlan(input, rotationModel(), undefined, { optimizer: relaxedOptimizer });
  assert.equal(outcome.error.code, "goals_unreachable");
  const fingerprint = await generationFingerprint(input, NOW);
  assert.equal(await storePartialWeek(table, USER, fingerprint, outcome.reusable, NOW), true);
}

const flow = (table, input, allowPartial, now = NOW + 60_000) =>
  reusePartialPlan({ request: input, allowPartial, userId: USER, client: table, nowMs: now, deps: {} });

test("reuse: same inputs + allowPartial → the stored week as a partial plan, once", async () => {
  const table = memoryTable();
  const input = { ...baseInput, city: null };
  await firstAttempt(table, input);

  const plan = await flow(table, input, true);
  assert.ok(plan, "plan from the stored week");
  assert.ok(plan.summary.estimated_total_cop <= input.weeklyBudgetCop);
  assert.equal(table.rows.size, 0, "single use");
  assert.equal(await flow(table, input, true), null, "a second retry generates normally");
});

test("reuse: without allowPartial nothing is taken", async () => {
  const table = memoryTable();
  const input = { ...baseInput, city: null };
  await firstAttempt(table, input);
  assert.equal(await flow(table, input, false), null);
  assert.equal(table.rows.size, 1);
});

test("reuse: changed inputs (budget, goals, cooking) never get the stored week", async () => {
  for (const change of [{ weeklyBudgetCop: 240_000 }, { goals: ["healthy"] }, { cooking: { weekdayMinutes: 30, level: "basic", appliances: ["estufa"], batch: false } }]) {
    const table = memoryTable();
    const input = { ...baseInput, city: null };
    await firstAttempt(table, input);
    assert.equal(await flow(table, { ...input, ...change }, true), null, JSON.stringify(change));
    assert.equal(table.rows.size, 1, "the stored week stays for the original inputs");
  }
});

test("reuse: an expired week is not used", async () => {
  const table = memoryTable();
  const input = { ...baseInput, city: null };
  await firstAttempt(table, input);
  assert.equal(await flow(table, input, true, NOW + PARTIAL_PLAN_TTL_MS + 1), null);
});

test("reuse: a stored week that no longer validates is dropped and logged as a code", async () => {
  const table = memoryTable();
  const input = { ...baseInput, city: null };
  await firstAttempt(table, input);
  const row = [...table.rows.values()][0];
  row.week.lun.almuerzo.items[0].id = "no_such_food";

  const logs = [];
  const original = console.log;
  console.log = (line) => logs.push(String(line));
  let plan;
  try {
    plan = await flow(table, input, true);
  } finally {
    console.log = original;
  }
  assert.equal(plan, null);
  assert.ok(logs.includes(JSON.stringify({ event: "partial_plan_reuse_rejected" })));
});

test("handler: reuse is tried before the daily quota row, and the week is stored only for goals_unreachable", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../generate-weekly-plan/index.ts", import.meta.url), "utf8");
  const reuse = source.indexOf("await reusePartialPlan(");
  const quota = source.indexOf('.from("plan_generation_requests")');
  assert.ok(reuse > 0 && quota > reuse, "a reused plan never inserts a quota row");
  assert.match(source.slice(reuse, quota), /client: supabase as unknown as PartialPlanClient/, "taken with the user's JWT client (RLS)");
  assert.match(source, /if \(outcome\.error\.code === "goals_unreachable" && outcome\.reusable\) \{[\s\S]*?storePartialWeek\(\s*createServiceClient\(\)/);
});
