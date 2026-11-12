import { test } from "node:test";
import assert from "node:assert/strict";
import { failureResponse } from "./generationResponse.ts";

const OLD = { appVersion: null, allowPartial: false };
const OLD_VERSIONED = { appVersion: "0.0.9", allowPartial: false };
const NEW = { appVersion: "0.1.0", allowPartial: false };

const budget = { currentBudget: 100000, requiredBudget: 130000, recommendedIncrease: 30000 };
const conflicts = [
  { rule: "protein_min", level: 2, unit: "g_per_kg", target: 1.6, achieved: 1.32 },
];
const unreachable = (extra = {}) => ({
  code: "goals_unreachable",
  message: "Así como está, tu plan no cumple todas tus metas.",
  conflicts,
  canForce: true,
  ...extra,
});

test("budget_too_low with budget answers 200 with the numbers (as today)", () => {
  const r = failureResponse({ code: "budget_too_low", message: "x", budget }, OLD);
  assert.deepEqual(r, {
    status: 200,
    payload: { error: "budget_too_low", code: "budget_too_low", ...budget },
  });
});

test("other codes keep today's status and payload", () => {
  const diagnostics = { availableFoods: 3, totalFoods: 40, reasons: ["item_count"] };
  assert.deepEqual(failureResponse({ code: "server_config", message: "m" }, NEW), {
    status: 503,
    payload: { error: "m", code: "server_config", diagnostics: undefined },
  });
  assert.equal(failureResponse({ code: "rate_limited", message: "m" }, NEW).status, 429);
  assert.deepEqual(
    failureResponse({ code: "restrictions_too_strict", message: "m", diagnostics }, OLD),
    { status: 422, payload: { error: "m", code: "restrictions_too_strict", diagnostics } },
  );
  assert.equal(failureResponse({ code: "budget_too_low", message: "m" }, OLD).status, 422);
});

test("old client + goals_unreachable with budget → budget_too_low 200 with numbers", () => {
  for (const body of [OLD, OLD_VERSIONED]) {
    assert.deepEqual(failureResponse(unreachable({ budget }), body), {
      status: 200,
      payload: { error: "budget_too_low", code: "budget_too_low", ...budget },
    });
  }
});

test("old client + goals_unreachable without budget → goal_incoherent 422", () => {
  for (const body of [OLD, OLD_VERSIONED]) {
    const r = failureResponse(unreachable(), body);
    assert.equal(r.status, 422);
    assert.equal(r.payload.code, "goal_incoherent");
    assert.equal(typeof r.payload.error, "string");
    assert.equal("conflicts" in r.payload, false, "old clients never see conflicts");
    assert.equal("canForce" in r.payload, false);
  }
});

test("new client + goals_unreachable → 200 with conflicts and canForce", () => {
  assert.deepEqual(failureResponse(unreachable({ budget }), NEW), {
    status: 200,
    payload: {
      error: "Así como está, tu plan no cumple todas tus metas.",
      code: "goals_unreachable",
      conflicts,
      canForce: true,
      budgetOption: budget,
    },
  });
});

test("new client + goals_unreachable without budget has no budgetOption", () => {
  const r = failureResponse(unreachable(), { appVersion: "2.0.0", allowPartial: true });
  assert.equal(r.status, 200);
  assert.equal("budgetOption" in r.payload, false);
  assert.deepEqual(r.payload.conflicts, conflicts);
});

test("new client + goals_unreachable without conflicts sends an empty list", () => {
  const r = failureResponse({ code: "goals_unreachable", message: "m" }, NEW);
  assert.deepEqual(r.payload.conflicts, []);
  assert.equal(r.payload.canForce, true);
});
