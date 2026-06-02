export interface BudgetIncreaseScenario {
  increaseCop: number;
  projectedBudgetCop: number;
  benefit: string;
}

const BUDGET_INCREASE_STEPS_COP = [10_000, 20_000, 50_000] as const;

const BENEFIT_BY_INCREASE: Record<
  (typeof BUDGET_INCREASE_STEPS_COP)[number],
  string
> = {
  10_000: "Mayor flexibilidad para snacks y desayunos.",
  20_000: "Más variedad de proteínas durante la semana.",
  50_000: "Plan más variado y mayor cantidad de alimentos.",
};

export function buildBudgetIncreaseRecommendations(
  currentBudgetCop: number | null | undefined,
): BudgetIncreaseScenario[] | null {
  if (currentBudgetCop == null || currentBudgetCop <= 0) {
    return null;
  }

  return BUDGET_INCREASE_STEPS_COP.map((increaseCop) => ({
    increaseCop,
    projectedBudgetCop: currentBudgetCop + increaseCop,
    benefit: BENEFIT_BY_INCREASE[increaseCop],
  }));
}

export function formatBudgetIncreaseLabel(increaseCop: number): string {
  return `+${increaseCop.toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  })} COP`;
}
