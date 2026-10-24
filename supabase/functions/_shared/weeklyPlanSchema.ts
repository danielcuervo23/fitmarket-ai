import { z } from "npm:zod@4.6.7";

/**
 * Shape of a generated weekly plan, shared by the Edge Function and the
 * browser (via the @shared alias) so both always agree.
 *
 * Plans saved before the catalog existed only have the base fields; the
 * optional ones (English menu, dish names, English item names, extra summary
 * numbers) are present on newer plans.
 */

const dayMenuSchema = z.object({
  desayuno: z.array(z.string().min(1)).min(1).max(8),
  almuerzo: z.array(z.string().min(1)).min(1).max(8),
  cena: z.array(z.string().min(1)).min(1).max(8),
  snacks: z.array(z.string().min(1)).min(1).max(8),
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

const dishNameSchema = z.object({ es: z.string(), en: z.string() });

const dayDishNamesSchema = z.object({
  desayuno: dishNameSchema,
  almuerzo: dishNameSchema,
  cena: dishNameSchema,
  snacks: dishNameSchema,
});

const dishNamesSchema = z.object({
  lun: dayDishNamesSchema,
  mar: dayDishNamesSchema,
  mie: dayDishNamesSchema,
  jue: dayDishNamesSchema,
  vie: dayDishNamesSchema,
  sab: dayDishNamesSchema,
  dom: dayDishNamesSchema,
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
  name_en: z.string().optional(),
  quantity: z.string().min(1),
  estimated_price_cop: z.number().int().nonnegative(),
  category: shoppingCategorySchema,
  store_id: z.string().min(1),
});

const planSummarySchema = z.object({
  estimated_total_cop: z.number().int().nonnegative(),
  estimated_daily_kcal: z.number().int().positive(),
  estimated_daily_protein_g: z.number().int().nonnegative().optional(),
  target_kcal: z.number().int().positive().optional(),
  household_size: z.number().int().positive().optional(),
  savings_note: z.string().optional(),
});

export const weeklyPlanSchema = z.object({
  summary: planSummarySchema,
  weekly_menu: weeklyMenuSchema,
  weekly_menu_en: weeklyMenuSchema.optional(),
  dish_names: dishNamesSchema.optional(),
  shopping_list: z.array(shoppingItemSchema).min(1),
});

export type WeeklyPlanParsed = z.infer<typeof weeklyPlanSchema>;

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
