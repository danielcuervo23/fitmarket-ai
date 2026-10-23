import type { MessageKey } from "@/i18n/messages";

export interface BudgetIncreaseScenario {
  increaseCop: number;
  projectedBudgetCop: number;
  benefitKey: MessageKey;
}

const SCENARIOS: readonly { increaseCop: number; benefitKey: MessageKey }[] = [
  { increaseCop: 10_000, benefitKey: "market.benefit.10000" },
  { increaseCop: 20_000, benefitKey: "market.benefit.20000" },
  { increaseCop: 50_000, benefitKey: "market.benefit.50000" },
];

export function buildBudgetIncreaseRecommendations(
  currentBudgetCop: number | null | undefined,
): BudgetIncreaseScenario[] | null {
  if (currentBudgetCop == null || currentBudgetCop <= 0) {
    return null;
  }

  return SCENARIOS.map(({ increaseCop, benefitKey }) => ({
    increaseCop,
    projectedBudgetCop: currentBudgetCop + increaseCop,
    benefitKey,
  }));
}
