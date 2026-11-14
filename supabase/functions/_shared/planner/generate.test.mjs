// Generation pipeline: budget floor, model failures, call and time limits,
// usage and refunds. The model is a fake that answers with recipe ids.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { shouldRefund } from "../quota.ts";
import { baseInput, isDayFill, loadSolver, respond, rotationModel, rotationWeek } from "./generate.fixtures.mjs";
import { MIN_WEEKLY_BUDGET_PER_PERSON_COP, generatePlan } from "./generate.ts";

before(loadSolver);

test("an absurd budget is answered at once, without paying for an AI request", async () => {
  let calls = 0;
  const result = await generatePlan({ ...baseInput, weeklyBudgetCop: 150 }, rotationModel(() => (calls += 1)));

  assert.equal(calls, 0);
  assert.equal(result.error.code, "budget_too_low");
  // Owner decision 2026-11-12: 130 000 COP per person and week.
  assert.equal(MIN_WEEKLY_BUDGET_PER_PERSON_COP, 130_000);
  assert.equal(result.error.budget.requiredBudget, 130_000);
  assert.match(result.error.message, /130\.000/);
  const household = await generatePlan({ ...baseInput, weeklyBudgetCop: 300_000, householdSize: 3 }, rotationModel());
  assert.equal(household.error.budget.requiredBudget, 390_000, "the floor scales with the household");
  assert.equal(household.error.budget.recommendedIncrease, 90_000);
});

test("failures from the model are reported; a missing key is not retried", async () => {
  let calls = 0;
  const config = await generatePlan(baseInput, async () => {
    calls += 1;
    return { content: null, error: "x", errorCode: "server_config" };
  });
  assert.equal(config.error.code, "server_config");
  assert.equal(calls, 1);

  let flaky = 0;
  const timeout = await generatePlan(baseInput, async () => {
    flaky += 1;
    return { content: null, error: "x", errorCode: "ai_timeout" };
  });
  assert.equal(timeout.error.code, "ai_timeout");
  assert.equal(flaky, 2, "transient failures get one retry");

  const garbage = await generatePlan(baseInput, async () => ({ content: "not json", error: null, errorCode: null }));
  assert.equal(garbage.error.code, "invalid_format");
  assert.deepEqual(garbage.error.diagnostics.reasons, ["not_json", "not_json", "not_json"]);
});

/** One day per attempt and garbage for every day fill: the worst case for the number of calls. */
function oneDayThenGarbage(onCall = () => {}) {
  const full = rotationWeek();
  return async (request) => {
    onCall(request);
    if (isDayFill(request)) return { content: "not json", error: null, errorCode: null };
    return respond({ days: full.days.slice(0, 1) });
  };
}

test("the call cap bounds the cost of one request", async () => {
  let uncapped = 0;
  const before = await generatePlan(baseInput, oneDayThenGarbage(() => (uncapped += 1)), { maxModelCalls: 1000 });
  assert.ok(before.error);
  assert.equal(uncapped, 39, "3 attempts x (1 + 2 rounds x 6 days)");

  let calls = 0;
  let composeCalls = 0;
  const capped = await generatePlan(
    baseInput,
    oneDayThenGarbage((request) => {
      calls += 1;
      if (!isDayFill(request)) composeCalls += 1;
    }),
  );
  assert.ok(capped.error);
  assert.equal(calls, 9, "1 + 6 fills, then 2 retries; no partial round");
  assert.equal(composeCalls, 3, "all 3 attempts still run");
  assert.deepEqual(capped.usage, { modelCalls: 9, billableCalls: 9, refusedCalls: 0 });

  let small = 0;
  await generatePlan(baseInput, oneDayThenGarbage(() => (small += 1)), { maxModelCalls: 3 });
  assert.equal(small, 3, "the cap is configurable");
});

test("the time budget: a slow model never runs past the deadline", async () => {
  let clock = 0;
  const deadline = 120_000;
  const timeouts = [];
  const full = rotationWeek();
  const slowModel = async (request) => {
    const startedAt = clock;
    const limit = request.timeoutMs ?? Infinity;
    timeouts.push({ limit, left: deadline - startedAt });
    await null;
    clock = Math.max(clock, startedAt + Math.min(50_000, limit));
    if (limit < 50_000) return { content: null, error: "x", errorCode: "ai_timeout" };
    if (isDayFill(request)) return { content: "not json", error: null, errorCode: null };
    return respond({ days: full.days.slice(0, 1) });
  };

  const result = await generatePlan(baseInput, slowModel, { deadline, now: () => clock });

  assert.ok(result.error);
  assert.ok(timeouts.every((t) => t.limit <= t.left), "no call may outlive the deadline");
  // t=0 compose (50 s), t=50 s six day fills (50 s). At t=100 s only 20 s are
  // left: less than a full composition needs (30 s), so attempt 2 never starts.
  assert.equal(clock, 100_000);
  assert.equal(result.usage.modelCalls, 7);
});

test("refunds only when OpenAI charged nothing", async () => {
  const answers = [
    { content: null, error: "x", errorCode: "ai_empty", detail: "refusal" },
    { content: null, error: "x", errorCode: "ai_timeout" },
  ];
  const billed = await generatePlan(baseInput, async () => answers.shift());
  assert.equal(billed.error.code, "ai_timeout");
  assert.equal(billed.usage.billableCalls, 2);
  assert.equal(shouldRefund(billed.error.code, billed.usage), false);

  const outage = await generatePlan(baseInput, async () => ({ content: null, error: "x", errorCode: "ai_unavailable", detail: "http_503" }));
  assert.equal(outage.error.code, "ai_unavailable");
  assert.equal(outage.usage.billableCalls, 0);
  assert.equal(shouldRefund(outage.error.code, outage.usage), true);
});

test("goals_unreachable is never refunded: the try paid for the week kept for reuse", () => {
  assert.equal(shouldRefund("goals_unreachable", { modelCalls: 1, billableCalls: 0, refusedCalls: 0 }), false);
});

test("a solver that did not load (before any OpenAI call) gives the try back; other generation_failed do not", async () => {
  const down = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: { prepare: async () => false, loadError: () => "load_timeout", optimize: () => assert.fail("no solve") },
  });
  assert.equal(down.error.code, "generation_failed");
  assert.equal(down.refundable, true);
  assert.equal(shouldRefund(down.error.code, down.usage, down.refundable), true);

  const infeasible = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: {
      prepare: async () => true,
      loadError: () => null,
      optimize: () => ({ status: "infeasible", week: null, costCop: null, shortfalls: [], relaxations: [], requiredBudgetCop: null, solves: 1, cpuMs: 1 }),
    },
  });
  assert.equal(infeasible.error.code, "generation_failed");
  assert.equal(infeasible.refundable, undefined);
  assert.equal(shouldRefund(infeasible.error.code, infeasible.usage, infeasible.refundable), false);
  // The flag never refunds a billed call.
  assert.equal(shouldRefund("generation_failed", { modelCalls: 1, billableCalls: 1, refusedCalls: 0 }, true), false);
});
