import { z } from "npm:zod@4.6.7";

/**
 * Shape of a generated weekly plan, shared by the Edge Function and the
 * browser (via the @shared alias) so both always agree.
 *
 * Plans saved before the catalog existed only have the base fields; the
 * optional ones (English menu, dish names, English item names, extra summary
 * numbers) are present on newer plans.
 *
 * Plan 2 adds more optional fields (recipe per meal, recipe details, notices,
 * compliance, recipe library version). Codes and labels that may grow over
 * time (notice codes, rule codes, units, cooking levels, appliances) are plain
 * strings, never enums: a newer server must never make an older web reject a
 * plan. The web shows only the codes it has copy for.
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
  price_source: z.enum(["official", "user", "estimate"]).optional(),
  price_updated_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const planSummarySchema = z.object({
  estimated_total_cop: z.number().int().nonnegative(),
  estimated_daily_kcal: z.number().int().positive(),
  estimated_daily_protein_g: z.number().int().nonnegative().optional(),
  target_kcal: z.number().int().positive().optional(),
  household_size: z.number().int().positive().optional(),
  savings_note: z.string().optional(),
  recipe_library_version: z.string().min(1).max(40).optional(),
});

/** A code that may grow over time: never an enum (forward compatible). */
const codeSchema = z.string().min(1).max(40);

const recipeIdSchema = z.string().regex(/^[a-z0-9_]{3,60}$/);

const MAX_RECIPES_PER_PLAN = 28;

const dayRecipeIdsSchema = z.object({
  desayuno: recipeIdSchema,
  almuerzo: recipeIdSchema,
  cena: recipeIdSchema,
  snacks: recipeIdSchema,
});

const mealRecipesSchema = z.object({
  lun: dayRecipeIdsSchema,
  mar: dayRecipeIdsSchema,
  mie: dayRecipeIdsSchema,
  jue: dayRecipeIdsSchema,
  vie: dayRecipeIdsSchema,
  sab: dayRecipeIdsSchema,
  dom: dayRecipeIdsSchema,
});

const stepListSchema = z.array(z.string().min(1).max(200)).min(1).max(8);

const planRecipeInfoSchema = z.object({
  name: z.object({ es: z.string().min(1).max(120), en: z.string().min(1).max(120) }),
  minutes: z.number().int().min(1).max(240),
  level: codeSchema,
  appliances: z.array(codeSchema).max(8),
  batch: z.boolean(),
  steps: z.object({ es: stepListSchema, en: stepListSchema }),
});

const recipesSchema = z
  .record(recipeIdSchema, planRecipeInfoSchema)
  .refine((recipes) => Object.keys(recipes).length <= MAX_RECIPES_PER_PLAN, {
    message: `at most ${MAX_RECIPES_PER_PLAN} recipes`,
  });

/**
 * A rule the plan does not meet. `unmeasurable: true` means the rule could not
 * be checked (some food has no nutrient data); it is listed here, never as
 * met, and `achieved` is only the measured part.
 */
const unmetRuleSchema = z.object({
  rule: codeSchema,
  target: z.number().finite(),
  achieved: z.number().finite(),
  unit: codeSchema,
  unmeasurable: z.boolean().optional(),
});

/**
 * Producers write "full" or "partial" (PlanCompliance in planner/build.ts);
 * any short string is accepted so a future status never breaks an older web.
 */
const complianceSchema = z.object({
  status: z.string().min(1).max(20),
  unmet: z.array(unmetRuleSchema).max(50),
});

export const weeklyPlanSchema = z.object({
  summary: planSummarySchema,
  weekly_menu: weeklyMenuSchema,
  weekly_menu_en: weeklyMenuSchema.optional(),
  dish_names: dishNamesSchema.optional(),
  shopping_list: z.array(shoppingItemSchema).min(1),
  meal_recipes: mealRecipesSchema.optional(),
  recipes: recipesSchema.optional(),
  notices: z.array(codeSchema).max(20).optional(),
  compliance: complianceSchema.optional(),
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
