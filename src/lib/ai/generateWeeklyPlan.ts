import { buildGenerationInput, type GenerationInput } from "@/lib/ai/buildGenerationInput";
import {
  DAY_IDS,
  MEAL_SLOTS,
  type DayId,
  type DayMenu,
  type PlanSummary,
  type ShoppingCategory,
  type ShoppingItem,
  type WeeklyMenu,
  type WeeklyPlan,
} from "@/lib/ai/types";
import type { GoalType } from "@/lib/goals";

const GOAL_LABELS: Record<GoalType, string> = {
  muscle: "ganar masa muscular",
  fat: "perder grasa",
  healthy: "comer saludable",
  save: "ahorrar dinero",
  family: "alimentación familiar",
  energy: "mejorar tu energía",
};

const SHOPPING_TEMPLATES: {
  name: string;
  quantity: string;
  category: ShoppingCategory;
}[] = [
  { name: "Pechuga de pollo", quantity: "1 kg", category: "proteinas" },
  { name: "Huevos", quantity: "12 und", category: "proteinas" },
  { name: "Lentejas", quantity: "500 g", category: "granos" },
  { name: "Arroz integral", quantity: "1 kg", category: "granos" },
  { name: "Avena", quantity: "500 g", category: "granos" },
  { name: "Banano", quantity: "6 und", category: "frutas_verduras" },
  { name: "Tomate", quantity: "1 kg", category: "frutas_verduras" },
  { name: "Espinaca", quantity: "250 g", category: "frutas_verduras" },
  { name: "Yogur natural", quantity: "1 L", category: "lacteos" },
  { name: "Leche descremada", quantity: "1 L", category: "lacteos" },
  { name: "Aceite de oliva", quantity: "500 ml", category: "condimentos" },
  { name: "Agua", quantity: "6 und", category: "bebidas" },
];

function formatCop(amount: number): string {
  return amount.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function goalLabelsText(goals: string[]): string {
  return goals
    .map((goal) => GOAL_LABELS[goal as GoalType] ?? goal)
    .join(", ");
}

function estimatedDailyKcal(goals: string[]): number {
  if (goals.includes("muscle")) {
    return 2100;
  }

  if (goals.includes("fat")) {
    return 1650;
  }

  if (goals.includes("save")) {
    return 1550;
  }

  if (goals.includes("family")) {
    return 1900;
  }

  return 1800;
}

function mealLinesForDay(
  dayId: DayId,
  mealSlot: (typeof MEAL_SLOTS)[number],
  input: GenerationInput,
  dayIndex: number,
): string[] {
  const goalId = input.goals[dayIndex % input.goals.length];
  const goalLabel = GOAL_LABELS[goalId as GoalType] ?? goalId;
  const storeId = input.supermarkets[dayIndex % input.supermarkets.length];
  const dayLabel = dayId.toUpperCase();

  const mealNames: Record<(typeof MEAL_SLOTS)[number], string> = {
    desayuno: "Desayuno",
    almuerzo: "Almuerzo",
    cena: "Cena",
    snacks: "Snack",
  };

  return [
    `${mealNames[mealSlot]} · ${dayLabel} (plan demo)`,
    `Enfocado en ${goalLabel}`,
    `Compra sugerida en ${storeId}`,
  ];
}

function buildMockWeeklyMenu(input: GenerationInput): WeeklyMenu {
  const menu = {} as WeeklyMenu;

  DAY_IDS.forEach((dayId, dayIndex) => {
    const dayMenu = {} as DayMenu;

    MEAL_SLOTS.forEach((mealSlot) => {
      dayMenu[mealSlot] = mealLinesForDay(dayId, mealSlot, input, dayIndex);
    });

    menu[dayId] = dayMenu;
  });

  return menu;
}

function buildMockShoppingList(input: GenerationInput): ShoppingItem[] {
  const targetTotal = Math.round(input.weekly_budget_cop * 0.92);
  const itemCount = Math.min(
    SHOPPING_TEMPLATES.length,
    Math.max(6, Math.floor(targetTotal / 12_000)),
  );
  const templates = SHOPPING_TEMPLATES.slice(0, itemCount);
  const basePrice = Math.floor(targetTotal / itemCount);
  let remainder = targetTotal - basePrice * itemCount;

  return templates.map((template, index) => {
    const extra = remainder > 0 ? 1 : 0;

    if (remainder > 0) {
      remainder -= 1;
    }

    return {
      name: template.name,
      quantity: template.quantity,
      estimated_price_cop: basePrice + extra,
      category: template.category,
      store_id: input.supermarkets[index % input.supermarkets.length],
    };
  });
}

function buildMockSummary(input: GenerationInput, shoppingList: ShoppingItem[]): PlanSummary {
  const estimatedTotalCop = shoppingList.reduce(
    (sum, item) => sum + item.estimated_price_cop,
    0,
  );

  return {
    estimated_total_cop: estimatedTotalCop,
    estimated_daily_kcal: estimatedDailyKcal(input.goals),
    savings_note: `Plan demo · Presupuesto $${formatCop(input.weekly_budget_cop)} COP · Objetivos: ${goalLabelsText(input.goals)} · Tiendas: ${input.supermarkets.join(", ")}`,
  };
}

function buildMockWeeklyPlan(input: GenerationInput): WeeklyPlan {
  const shopping_list = buildMockShoppingList(input);

  return {
    summary: buildMockSummary(input, shopping_list),
    weekly_menu: buildMockWeeklyMenu(input),
    shopping_list,
  };
}

export async function generateWeeklyPlan(): Promise<{
  data: WeeklyPlan | null;
  error: string | null;
}> {
  const { data: input, error } = await buildGenerationInput();

  if (error || !input) {
    return { data: null, error };
  }

  return {
    data: buildMockWeeklyPlan(input),
    error: null,
  };
}
