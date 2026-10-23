import assert from "node:assert/strict";
import {
  MAX_WEEKLY_BUDGET_COP,
  parseBudgetInput,
  roundUpToStep,
  suggestBudget,
} from "./budgetSuggestion.ts";

// Rounds up to steps of 5,000.
assert.equal(roundUpToStep(212_100), 215_000);
assert.equal(roundUpToStep(215_000), 215_000);

// Suggests what the plan needed, rounded up...
assert.equal(suggestBudget(200_000, 212_100), 215_000);

// ...but always at least one step above the current budget, so "save and
// regenerate" is never a no-op.
assert.equal(suggestBudget(200_000, 199_000), 205_000);
assert.equal(suggestBudget(200_000, 200_000), 205_000);

// Never above what the database accepts.
assert.equal(suggestBudget(19_999_000, 30_000_000), MAX_WEEKLY_BUDGET_COP);

// Parses what people type in either locale.
assert.equal(parseBudgetInput("180.000"), 180_000);
assert.equal(parseBudgetInput("$ 180,000"), 180_000);
assert.equal(parseBudgetInput("abc"), 0);
assert.equal(parseBudgetInput(""), 0);

console.log("budgetSuggestion: all checks passed");
