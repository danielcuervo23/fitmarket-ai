import { z } from "npm:zod@3.23.8";
import { validateDietaryRestrictions } from "./dietaryRestrictions.ts";

const dayMenuSchema = z.object({
  desayuno: z.array(z.string().min(1)).min(2).max(5),
  almuerzo: z.array(z.string().min(1)).min(2).max(5),
  cena: z.array(z.string().min(1)).min(2).max(5),
  snacks: z.array(z.string().min(1)).min(1).max(3),
});

const weeklyMenuSchema = z.object({
  lun: dayMenuSchema,
  mar: dayMenuSchema,
  mie: dayMenuSchema,
  jue: dayMenuSchema,
  vie: dayMenuSchema,
  sab: dayMenuSchema,
  dom: dayMenuSchema,
});

const shoppingCategorySchema = z.enum([
  "proteinas",
  "frutas_verduras",
  "lacteos",
  "granos",
  "bebidas",
  "condimentos",
  "otros",
]);

const shoppingItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().min(1),
  estimated_price_cop: z.number().int().nonnegative(),
  category: shoppingCategorySchema,
  store_id: z.string().min(1),
});

const planSummarySchema = z.object({
  estimated_total_cop: z.number().int().nonnegative(),
  estimated_daily_kcal: z.number().int().positive(),
  savings_note: z.string().optional(),
});

export const weeklyPlanSchema = z.object({
  summary: planSummarySchema,
  weekly_menu: weeklyMenuSchema,
  shopping_list: z.array(shoppingItemSchema).min(1),
});

export type WeeklyPlanParsed = z.infer<typeof weeklyPlanSchema>;

export interface WeeklyPlanBusinessInput {
  weekly_budget_cop: number;
  supermarkets: string[];
  dietary_restrictions: string[];
}

export type WeeklyPlanValidationError =
  | {
      code: "budget_too_low";
      currentBudget: number;
      requiredBudget: number;
      recommendedIncrease: number;
    }
  | { code: "message"; message: string };

export function validationErrorToMessage(
  error: WeeklyPlanValidationError,
): string {
  if (error.code === "budget_too_low") {
    return "La lista de mercado supera tu presupuesto semanal.";
  }

  return error.message;
}

/** Detecta cantidad aproximada: "80 g", "250 ml", "1 banano", etc. */
const MEAL_PORTION_PATTERN =
  /\d+\s*(?:g|gr|gramos|ml|mililitros|kg|kilogramos|l|litro|litros|unidad|unidades|rodaja|rodajas|taza|tazas)\b|\d+\s+(?:de\s+)?[a-záéíóúñ]/i;

function validateMealPortionDetail(plan: WeeklyPlanParsed): string | null {
  for (const [day, dayMenu] of Object.entries(plan.weekly_menu)) {
    for (const [meal, items] of Object.entries(dayMenu)) {
      for (const item of items) {
        if (!MEAL_PORTION_PATTERN.test(item)) {
          return `Las comidas deben incluir cantidades por ingrediente (ej. "150 g de pollo"). Revisa ${meal} del ${day}.`;
        }
      }
    }
  }

  return null;
}

export function parseWeeklyPlanJson(raw: unknown): {
  data: WeeklyPlanParsed | null;
  error: string | null;
} {
  const result = weeklyPlanSchema.safeParse(raw);

  if (!result.success) {
    return {
      data: null,
      error: "El plan generado no tiene un formato válido.",
    };
  }

  return { data: result.data, error: null };
}

export function validateWeeklyPlanBusinessRules(
  plan: WeeklyPlanParsed,
  input: WeeklyPlanBusinessInput,
): WeeklyPlanValidationError | null {
  const listTotal = plan.shopping_list.reduce(
    (sum, item) => sum + item.estimated_price_cop,
    0,
  );
  const weeklyBudgetCop = input.weekly_budget_cop;
  const maxBudget = Math.round(weeklyBudgetCop * 1.05);

  // LOG TEMPORAL — quitar tras diagnosticar presupuesto vs lista
  console.log({
    budget: weeklyBudgetCop,
    budgetType: typeof weeklyBudgetCop,
    shoppingTotal: listTotal,
    summaryTotalCop: plan.summary.estimated_total_cop,
    itemCount: plan.shopping_list.length,
    limit: maxBudget,
    overBy: listTotal - maxBudget,
    items: plan.shopping_list.map((item) => ({
      name: item.name,
      price: item.estimated_price_cop,
    })),
  });

  if (listTotal > maxBudget) {
    const recommendedIncrease = Math.max(0, listTotal - weeklyBudgetCop);

    console.log(
      "[validateWeeklyPlanBusinessRules] FAIL presupuesto:",
      {
        listTotal,
        maxBudget,
        weeklyBudgetCop,
        requiredBudget: listTotal,
        recommendedIncrease,
      },
    );

    return {
      code: "budget_too_low",
      currentBudget: weeklyBudgetCop,
      requiredBudget: listTotal,
      recommendedIncrease,
    };
  }

  const invalidStore = plan.shopping_list.find(
    (item) => !input.supermarkets.includes(item.store_id),
  );

  if (invalidStore) {
    return {
      code: "message",
      message: "Uno o más productos tienen una tienda no válida.",
    };
  }

  const dietaryError = validateDietaryRestrictions(
    plan,
    input.dietary_restrictions,
  );

  if (dietaryError) {
    console.log(
      "[validateWeeklyPlanBusinessRules] FAIL restricciones dietéticas:",
      { dietary_restrictions: input.dietary_restrictions },
    );
    return { code: "message", message: dietaryError };
  }

  const portionError = validateMealPortionDetail(plan);

  if (portionError) {
    console.log(
      "[validateWeeklyPlanBusinessRules] FAIL porciones:",
      { portionError },
    );
    return { code: "message", message: portionError };
  }

  return null;
}

const openAiMealItemsSchema = {
  type: "array",
  items: { type: "string" },
};

const openAiDayMenuSchema = {
  type: "object",
  additionalProperties: false,
  required: ["desayuno", "almuerzo", "cena", "snacks"],
  properties: {
    desayuno: { ...openAiMealItemsSchema, minItems: 2, maxItems: 5 },
    almuerzo: { ...openAiMealItemsSchema, minItems: 2, maxItems: 5 },
    cena: { ...openAiMealItemsSchema, minItems: 2, maxItems: 5 },
    snacks: { ...openAiMealItemsSchema, minItems: 1, maxItems: 3 },
  },
};

const openAiShoppingItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "quantity",
    "estimated_price_cop",
    "category",
    "store_id",
  ],
  properties: {
    name: { type: "string" },
    quantity: { type: "string" },
    estimated_price_cop: { type: "integer", minimum: 0 },
    category: {
      type: "string",
      enum: [
        "proteinas",
        "frutas_verduras",
        "lacteos",
        "granos",
        "bebidas",
        "condimentos",
        "otros",
      ],
    },
    store_id: { type: "string" },
  },
};

export const OPENAI_WEEKLY_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "weekly_menu", "shopping_list"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "estimated_total_cop",
        "estimated_daily_kcal",
        "savings_note",
      ],
      properties: {
        estimated_total_cop: { type: "integer", minimum: 0 },
        estimated_daily_kcal: { type: "integer", minimum: 1 },
        savings_note: { type: "string" },
      },
    },
    weekly_menu: {
      type: "object",
      additionalProperties: false,
      required: ["lun", "mar", "mie", "jue", "vie", "sab", "dom"],
      properties: {
        lun: openAiDayMenuSchema,
        mar: openAiDayMenuSchema,
        mie: openAiDayMenuSchema,
        jue: openAiDayMenuSchema,
        vie: openAiDayMenuSchema,
        sab: openAiDayMenuSchema,
        dom: openAiDayMenuSchema,
      },
    },
    shopping_list: {
      type: "array",
      minItems: 1,
      items: openAiShoppingItemSchema,
    },
  },
};

export function getOpenAIWeeklyPlanResponseFormat() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "weekly_plan",
      strict: true,
      schema: OPENAI_WEEKLY_PLAN_JSON_SCHEMA,
    },
  };
}
