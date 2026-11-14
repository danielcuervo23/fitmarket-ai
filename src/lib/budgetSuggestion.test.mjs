import assert from "node:assert/strict";
import {
  budgetIssue,
  thousandsSuggestion,
  MAX_WEEKLY_BUDGET_COP,
  MIN_WEEKLY_BUDGET_COP,
  parseBudgetInput,
  roundUpToStep,
  suggestBudget,
} from "./budgetSuggestion.ts";
import { MIN_WEEKLY_BUDGET_PER_PERSON_COP } from "../../supabase/functions/_shared/planner/generate.ts";
import { setup } from "../i18n/messages/setup.ts";

// The minimum is per person and the copy says so (es + en).
assert.match(setup.es["budget.minimum"], /por persona/);
assert.match(setup.en["budget.minimum"], /per person/);

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

// Typed budgets: too low, too high, or a forgotten "thousand".
assert.equal(budgetIssue(0), null);
assert.equal(budgetIssue(150), "too_low");
// Owner decision 2026-11-12: 130 000 per person, the same floor as the server.
assert.equal(MIN_WEEKLY_BUDGET_COP, 130_000);
assert.equal(MIN_WEEKLY_BUDGET_COP, MIN_WEEKLY_BUDGET_PER_PERSON_COP);
assert.equal(budgetIssue(40_000), "too_low");
assert.equal(budgetIssue(129_999), "too_low");
assert.equal(budgetIssue(130_000), null);
assert.equal(budgetIssue(MAX_WEEKLY_BUDGET_COP + 1), "too_high");
assert.equal(thousandsSuggestion(150), 150_000);
assert.equal(thousandsSuggestion(130), 130_000);
assert.equal(thousandsSuggestion(40), null, "40,000 is below the minimum");
assert.equal(thousandsSuggestion(150_000), null);
assert.equal(thousandsSuggestion(0), null);

console.log("budgetSuggestion: all checks passed");

// The floor is per person: a household needs 130 000 for each member (like the server).
{
  const { minWeeklyBudgetFor, budgetMinimumMessage } = await import("./budgetSuggestion.ts");
  assert.equal(minWeeklyBudgetFor(1), 130_000);
  assert.equal(minWeeklyBudgetFor(3), 390_000);
  assert.equal(minWeeklyBudgetFor(0), 130_000, "invalid sizes count as one person");
  assert.equal(minWeeklyBudgetFor(Number.NaN), 130_000);
  assert.equal(minWeeklyBudgetFor(9), 8 * 130_000, "the profile allows at most 8 people");

  assert.equal(budgetIssue(200_000, 2), "too_low");
  assert.equal(budgetIssue(260_000, 2), null);
  assert.equal(budgetIssue(130_000), null, "one person by default");
  assert.equal(thousandsSuggestion(200, 2), null, "200 000 is below a two-person minimum");
  assert.equal(thousandsSuggestion(300, 2), 300_000);

  assert.deepEqual(budgetMinimumMessage(1), { key: "budget.minimum", amount: 130_000, perPerson: 130_000 });
  assert.deepEqual(budgetMinimumMessage(3), { key: "budget.minimumHousehold", amount: 390_000, perPerson: 130_000 });
  assert.match(setup.es["budget.minimumHousehold"], /mínimo de \{amount\} para tu hogar \(\{perPerson\} por persona a la semana\)/);
  assert.match(setup.en["budget.minimumHousehold"], /minimum of \{amount\} for your household \(\{perPerson\} per person per week\)/);
}
