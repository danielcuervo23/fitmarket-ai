import { z } from "zod";

const dayMenuSchema = z.object({
  desayuno: z.array(z.string().min(1)).min(1),
  almuerzo: z.array(z.string().min(1)).min(1),
  cena: z.array(z.string().min(1)).min(1),
  snacks: z.array(z.string().min(1)).min(1),
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
): string | null {
  const listTotal = plan.shopping_list.reduce(
    (sum, item) => sum + item.estimated_price_cop,
    0,
  );
  const maxBudget = Math.round(input.weekly_budget_cop * 1.05);

  if (listTotal > maxBudget) {
    return "La lista de mercado supera tu presupuesto semanal.";
  }

  const invalidStore = plan.shopping_list.find(
    (item) => !input.supermarkets.includes(item.store_id),
  );

  if (invalidStore) {
    return "Uno o más productos tienen una tienda no válida.";
  }

  return null;
}

const openAiDayMenuSchema = {
  type: "object",
  additionalProperties: false,
  required: ["desayuno", "almuerzo", "cena", "snacks"],
  properties: {
    desayuno: { type: "array", items: { type: "string" }, minItems: 1 },
    almuerzo: { type: "array", items: { type: "string" }, minItems: 1 },
    cena: { type: "array", items: { type: "string" }, minItems: 1 },
    snacks: { type: "array", items: { type: "string" }, minItems: 1 },
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

/** JSON Schema for OpenAI Structured Outputs (strict, sin $ref). */
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
} as const;

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
