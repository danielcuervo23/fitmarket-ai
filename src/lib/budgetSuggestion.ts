/** Budgets are suggested in steps people actually use (COP 5,000). */
const BUDGET_STEP_COP = 5_000;

/** Highest weekly budget the database accepts (see migration 007). */
export const MAX_WEEKLY_BUDGET_COP = 20_000_000;

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
