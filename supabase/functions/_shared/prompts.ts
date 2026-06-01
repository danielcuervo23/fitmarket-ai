/** Mantener alineado con src/lib/ai/prompts/weeklyPlan.ts */

export interface WeeklyPlanPromptInput {
  weekly_budget_cop: number;
  goals: string[];
  supermarkets: string[];
  locale: "es-CO";
  household_size: number;
}

export const WEEKLY_PLAN_SYSTEM_PROMPT = `Eres FitMarket AI, nutricionista y planificador de mercado en Colombia.
Genera un plan semanal saludable dentro del presupuesto en COP (pesos colombianos enteros).
Responde ÚNICAMENTE con JSON válido que cumpla el schema indicado. Sin markdown ni texto extra.
Prioriza ingredientes comunes en las cadenas de supermercado indicadas.
Consolida la lista de mercado sin duplicar productos entre ítems.
Asigna cada producto de shopping_list a un store_id de la lista recibida.
La suma de estimated_price_cop en shopping_list debe ser menor o igual al presupuesto semanal (tolerancia máxima 5%).
Platos alineados a los objetivos del usuario (save = económico, muscle = más proteína, etc.).
Incluye exactamente 7 días (lun, mar, mie, jue, vie, sab, dom) con desayuno, almuerzo, cena y snacks (arrays de strings con al menos un ítem cada uno).`;

export function buildWeeklyPlanUserPrompt(
  input: WeeklyPlanPromptInput,
): string {
  return JSON.stringify(
    {
      weekly_budget_cop: input.weekly_budget_cop,
      goals: input.goals,
      supermarkets: input.supermarkets,
      locale: input.locale,
      household_size: input.household_size,
      instructions:
        "Genera summary, weekly_menu y shopping_list. Precios realistas Colombia 2025.",
    },
    null,
    2,
  );
}

export const WEEKLY_PLAN_RETRY_USER_APPENDIX =
  "\n\nCorrige el JSON anterior: debe cumplir el schema, respetar el presupuesto y usar solo store_id permitidos.";
