/** Budgets are suggested in steps people actually use (COP 5,000). */
const BUDGET_STEP_COP = 5_000;

/** Highest weekly budget the database accepts (see migration 007). */
export const MAX_WEEKLY_BUDGET_COP = 20_000_000;

/**
 * Lowest weekly budget for one person that can buy a realistic week of food
 * (owner decision 2026-11-12). The server uses the same floor per person
 * (MIN_WEEKLY_BUDGET_PER_PERSON_COP, a test keeps them equal), so the app can
 * say so before generating.
 */
export const MIN_WEEKLY_BUDGET_COP = 130_000;

/** Most people the profile allows in a household (see src/lib/profile.ts). */
const MAX_HOUSEHOLD_SIZE = 8;

/**
 * The weekly minimum for a household: MIN_WEEKLY_BUDGET_COP for each person,
 * the same rule the server applies. An unknown or invalid size counts as one.
 */
export function minWeeklyBudgetFor(householdSize: number): number {
  const people = Number.isFinite(householdSize) && householdSize >= 1 ? Math.min(Math.floor(householdSize), MAX_HOUSEHOLD_SIZE) : 1;
  return MIN_WEEKLY_BUDGET_COP * people;
}

/** Which "too low" line to show and its amounts (one person: the plain line). */
export function budgetMinimumMessage(householdSize: number): {
  key: "budget.minimum" | "budget.minimumHousehold";
  amount: number;
  perPerson: number;
} {
  const amount = minWeeklyBudgetFor(householdSize);
  return {
    key: amount > MIN_WEEKLY_BUDGET_COP ? "budget.minimumHousehold" : "budget.minimum",
    amount,
    perPerson: MIN_WEEKLY_BUDGET_COP,
  };
}

export function roundUpToStep(amount: number, step = BUDGET_STEP_COP): number {
  return Math.ceil(amount / step) * step;
}

/**
 * The budget to offer after a "budget too low" result: what the generated
 * plan needed, rounded up, and never lower than the current budget.
 */
export function suggestBudget(
  currentBudgetCop: number,
  requiredBudgetCop: number,
): number {
  const suggested = roundUpToStep(
    Math.max(requiredBudgetCop, currentBudgetCop + BUDGET_STEP_COP),
  );

  return Math.min(suggested, MAX_WEEKLY_BUDGET_COP);
}

/** Digits-only parse of what the user typed ("180.000", "180,000", "$ 180000"). */
export function parseBudgetInput(raw: string): number {
  return Number(raw.replace(/\D/g, "")) || 0;
}

export type BudgetIssue = "too_low" | "too_high";

/** What is wrong with a typed budget, if anything (0 = nothing typed yet). */
export function budgetIssue(amount: number, householdSize = 1): BudgetIssue | null {
  if (amount <= 0) {
    return null;
  }

  if (amount < minWeeklyBudgetFor(householdSize)) {
    return "too_low";
  }

  return amount > MAX_WEEKLY_BUDGET_COP ? "too_high" : null;
}

/**
 * Someone typing "150" almost always means 150,000. Returns that amount, or
 * null when the number does not look like a forgotten "thousand".
 */
export function thousandsSuggestion(amount: number, householdSize = 1): number | null {
  const scaled = amount * 1000;

  return amount > 0 && amount < 1000 && scaled >= minWeeklyBudgetFor(householdSize)
    ? scaled
    : null;
}
