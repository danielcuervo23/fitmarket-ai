// Log events for the budget_too_low and restrictions_too_strict outcomes:
// emitted once per request, never on success, codes and coarse numbers only.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { baseInput, enumModel, loadSolver, rotationModel } from "./generate.fixtures.mjs";
import { generatePlan, planFromPartial } from "./generate.ts";
import { optimizeWeek } from "./optimizer/optimize.ts";
import { budgetRatioBucket, budgetTooLowFields, restrictionsTooStrictFields } from "./outcomeEvents.ts";

before(loadSolver);

/** Runs `fn` while capturing every logEvent line as parsed JSON. */
async function captureEvents(fn) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  let result;
  try {
    result = await fn();
  } finally {
    console.log = original;
  }
  const events = lines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed && typeof parsed.event === "string" ? [parsed] : [];
    } catch {
      return [];
    }
  });
  return { result, events };
}

const named = (events, name) => events.filter((e) => e.event === name);

/** Only these keys may ever appear: codes and coarse numbers. */
const BUDGET_KEYS = new Set(["event", "step", "household", "budget_ratio"]);
const STRICT_KEYS = new Set(["event", "slots", "short_slots", "min_recipes"]);
const PERSONAL = /user|id$|budget_cop|weekly|restriction|goal|profile|age|weight|height|health|text|email|city/i;

function assertSafe(event, allowed) {
  for (const [key, value] of Object.entries(event)) {
    assert.ok(allowed.has(key), `unexpected field ${key}`);
    assert.ok(key === "event" || !PERSONAL.test(key), `personal-looking field ${key}`);
    assert.ok(["string", "number", "boolean"].includes(typeof value), `${key} is a primitive`);
  }
}

function realOptimizer(transformInput = (input) => input, transformResult = (result) => result) {
  return {
    prepare: async () => true,
    loadError: () => null,
    optimize: (input) => transformResult(optimizeWeek({ ...transformInput(input), log: () => {} })),
  };
}

// ---------------------------------------------------------------- pure helpers

test("budgetRatioBucket: quarter buckets of current/required, unknown without a reference", () => {
  assert.equal(budgetRatioBucket(10_000, 130_000), "lt_0.25");
  assert.equal(budgetRatioBucket(40_000, 130_000), "0.25_0.5");
  assert.equal(budgetRatioBucket(70_000, 130_000), "0.5_0.75");
  assert.equal(budgetRatioBucket(120_000, 130_000), "0.75_1");
  assert.equal(budgetRatioBucket(130_000, 130_000), "ge_1");
  assert.equal(budgetRatioBucket(100_000, null), "unknown");
  assert.equal(budgetRatioBucket(100_000, 0), "unknown");
});

test("budgetTooLowFields: household capped at 6, never the budget itself", () => {
  assert.deepEqual(budgetTooLowFields("floor", 9, 300_000, 1_170_000), { step: "floor", household: 6, budget_ratio: "0.25_0.5" });
  const fields = budgetTooLowFields("optimizer", 2, 251_234, 300_000);
  assert.ok(!Object.values(fields).includes(251_234));
  assert.ok(!Object.values(fields).includes(300_000));
});

test("restrictionsTooStrictFields: short slots in slot order, their count and the lowest weekday count", () => {
  assert.deepEqual(
    restrictionsTooStrictFields({ desayuno: 5, almuerzo: 0, cena: 2, snacks: 4 }),
    { slots: "almuerzo,cena", short_slots: 2, min_recipes: 0 },
  );
});

// ---------------------------------------------------------------- budget_too_low

test("floor fast path: plan_budget_too_low once, step floor, safe payload", async () => {
  const { result, events } = await captureEvents(() =>
    generatePlan({ ...baseInput, weeklyBudgetCop: 300_000, householdSize: 3 }, rotationModel()),
  );
  assert.equal(result.error.code, "budget_too_low");
  const hits = named(events, "plan_budget_too_low");
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { event: "plan_budget_too_low", step: "floor", household: 3, budget_ratio: "0.75_1" });
  assertSafe(hits[0], BUDGET_KEYS);
});

test("optimizer over_budget with a required budget: plan_budget_too_low once, step optimizer", async () => {
  const overBudget = () => ({ status: "over_budget", week: null, costCop: null, shortfalls: [], relaxations: [], requiredBudgetCop: 180_000, solves: 2, cpuMs: 1 });
  const { result, events } = await captureEvents(() =>
    generatePlan({ ...baseInput, weeklyBudgetCop: 140_000, allowPartial: true }, rotationModel(), undefined, {
      optimizer: realOptimizer(undefined, overBudget),
    }),
  );
  assert.equal(result.error.code, "budget_too_low");
  const hits = named(events, "plan_budget_too_low");
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { event: "plan_budget_too_low", step: "optimizer", household: 1, budget_ratio: "0.75_1" });
  assertSafe(hits[0], BUDGET_KEYS);
});

test("optimizer over_budget without a required budget: budget_ratio unknown", async () => {
  const overBudget = () => ({ status: "over_budget", week: null, costCop: null, shortfalls: [], relaxations: [], requiredBudgetCop: null, solves: 2, cpuMs: 1 });
  const { result, events } = await captureEvents(() =>
    generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(undefined, overBudget) }),
  );
  assert.equal(result.error.code, "budget_too_low");
  const hits = named(events, "plan_budget_too_low");
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { event: "plan_budget_too_low", step: "optimizer", household: 1, budget_ratio: "unknown" });
});

test("assemble guard (shopping list over budget): plan_budget_too_low once, step assemble", async () => {
  // The optimizer prices triple quantities with a huge budget, so the assembled
  // list costs far more than the user's budget and the last guard answers.
  const { result, events } = await captureEvents(() =>
    generatePlan({ ...baseInput, weeklyBudgetCop: 130_000 }, rotationModel(), undefined, {
      optimizer: realOptimizer((input) => ({ ...input, householdFactor: input.householdFactor * 3, budgetCop: 50_000_000 })),
    }),
  );
  assert.equal(result.error?.code, "budget_too_low", JSON.stringify(result.error ?? result.plan?.summary));
  assert.equal(named(events, "plan_over_budget").length, 1);
  const hits = named(events, "plan_budget_too_low");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].step, "assemble");
  assert.equal(hits[0].household, 1);
  assertSafe(hits[0], BUDGET_KEYS);
});

test("reuse below the floor, then normal generation: plan_budget_too_low at most once", async () => {
  const input = { ...baseInput, weeklyBudgetCop: 100_000, allowPartial: true };
  const { result, events } = await captureEvents(async () => {
    assert.equal(planFromPartial(input, { week: {} }), null, "reuse refuses a budget under the floor");
    return generatePlan(input, rotationModel());
  });
  assert.equal(result.error.code, "budget_too_low");
  const hits = named(events, "plan_budget_too_low");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].step, "floor");
});

// ---------------------------------------------------------------- restrictions_too_strict

test("too strict restrictions: plan_restrictions_too_strict once, safe payload, no restriction text", async () => {
  const restrictions = ["vegan", "gluten", "peanut", "nuts"];
  const { result, events } = await captureEvents(() => generatePlan({ ...baseInput, restrictions }, enumModel()));
  assert.equal(result.error.code, "restrictions_too_strict");
  const hits = named(events, "plan_restrictions_too_strict");
  assert.equal(hits.length, 1);
  const event = hits[0];
  assertSafe(event, STRICT_KEYS);
  assert.match(event.slots, /^(desayuno|almuerzo|cena|snacks)(,(desayuno|almuerzo|cena|snacks))*$/);
  assert.ok(event.slots.split(",").includes("almuerzo"));
  assert.equal(event.short_slots, event.slots.split(",").length);
  assert.equal(event.min_recipes, 0);
  for (const word of restrictions) assert.ok(!JSON.stringify(event).includes(word), `no ${word}`);
  assert.equal(named(events, "plan_budget_too_low").length, 0);
});

// ---------------------------------------------------------------- success paths

test("a successful plan emits neither event", async () => {
  const { result, events } = await captureEvents(() => generatePlan(baseInput, rotationModel()));
  assert.ok(result.plan, JSON.stringify(result.error));
  assert.equal(named(events, "plan_budget_too_low").length, 0);
  assert.equal(named(events, "plan_restrictions_too_strict").length, 0);
});

test("goals_unreachable (with a budget option) is not logged as budget_too_low", async () => {
  const relaxed = (r) =>
    r.week ? { ...r, status: "relaxed", shortfalls: [{ rule: "protein_min", level: 2, unit: "g_per_kg", target: 1.6, achieved: 1.3 }], requiredBudgetCop: 320_000 } : r;
  const { result, events } = await captureEvents(() =>
    generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(undefined, relaxed) }),
  );
  assert.equal(result.error.code, "goals_unreachable");
  assert.equal(named(events, "plan_budget_too_low").length, 0);
  assert.equal(named(events, "plan_restrictions_too_strict").length, 0);
});
