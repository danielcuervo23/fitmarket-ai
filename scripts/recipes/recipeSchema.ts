import { z } from "zod";
import type { FoodUnit } from "../../supabase/functions/_shared/catalog.ts";
import { SLOTS } from "../../supabase/functions/_shared/planner/types.ts";
import {
  APPLIANCES,
  COOKING_LEVELS,
  type Recipe,
} from "../../supabase/functions/_shared/recipes/types.ts";

// Shape of one file of data/recipes (zod) plus the cross-file rules that need
// foods.json or the other files. build-library.ts refuses to write the library
// while any of these return an error.

const MAX_UNIT_QTY = 4;

const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

const text = (max: number) => z.string().min(1).max(max).regex(/\S/, "must not be blank");
const bilingual = z.strictObject({ es: text(80), en: text(80) });
const foodId = z.string().regex(/^[a-z0-9_]{2,40}$/);
const qty = z.number().finite().positive().max(10000);

const range = z
  .tuple([z.number().finite(), z.number().finite()])
  .refine(([min, max]) => min > 0 && min <= 1 && 1 <= max && max <= 3, "must satisfy 0 < min <= 1 <= max <= 3");

const alternative = z.strictObject({ food: foodId, qty, name: bilingual.optional() });

const line = z
  .strictObject({
    food: foodId,
    qty,
    role: z.enum(["protein", "carb", "veg", "fat", "fixed"]),
    optional: z.boolean().optional(),
    inName: z.boolean().optional(),
    alternatives: z.array(alternative).min(1).max(6).optional(),
  })
  .superRefine((value, ctx) => {
    const alternatives = value.alternatives ?? [];
    const foods = alternatives.map((alt) => alt.food);
    if (!distinct(foods)) ctx.addIssue({ code: "custom", message: "alternatives must be distinct" });
    if (foods.includes(value.food)) ctx.addIssue({ code: "custom", message: "an alternative repeats the line food" });
    if (value.inName && alternatives.some((alt) => !alt.name)) {
      ctx.addIssue({ code: "custom", message: "an inName line needs a name on every alternative" });
    }
  });

const steps = z
  .strictObject({ es: z.array(text(160)).min(1).max(8), en: z.array(text(160)).min(1).max(8) })
  .refine((value) => value.es.length === value.en.length, "steps.es and steps.en must have the same count");

export const recipeFileSchema: z.ZodType<Recipe> = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]{3,60}$/),
  status: z.enum(["pending_owner_ok", "approved"]),
  source: z.enum(["ai_draft", "owner"]),
  name: bilingual,
  slots: z.array(z.enum(SLOTS)).min(1).max(4).refine(distinct, "slots must be distinct"),
  minutes: z.number().int().min(1).max(120),
  level: z.enum(COOKING_LEVELS),
  appliances: z.array(z.enum(APPLIANCES)).min(1).max(8).refine(distinct, "appliances must be distinct"),
  batch: z.strictObject({ ok: z.boolean(), keepsDays: z.number().int().min(1).max(4) }),
  lines: z
    .array(line)
    .min(1)
    .max(10)
    .refine((lines) => lines.some((l) => l.role !== "fixed"), "at least one line must not be fixed"),
  scale: z
    .strictObject({ protein: range.optional(), carb: range.optional(), veg: range.optional(), fat: range.optional() })
    .optional(),
  steps,
});

export interface FoodIndex {
  foodIds: Set<string>;
  foodUnits: Map<string, FoodUnit>;
}

export function foodIndex(foods: readonly { id: string; unit: FoodUnit }[]): FoodIndex {
  return {
    foodIds: new Set(foods.map((food) => food.id)),
    foodUnits: new Map(foods.map((food) => [food.id, food.unit])),
  };
}

function labelOf(raw: unknown, index: number): string {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 ? id : `recipe #${index + 1}`;
}

function foodErrors(recipe: Recipe, foodIds: Set<string>, foodUnits: Map<string, FoodUnit>): string[] {
  const errors: string[] = [];
  recipe.lines.forEach((l, index) => {
    for (const use of [l, ...(l.alternatives ?? [])]) {
      if (!foodIds.has(use.food)) {
        errors.push(`${recipe.id}: lines.${index}: unknown food "${use.food}"`);
      } else if (foodUnits.get(use.food) === "unit" && use.qty > MAX_UNIT_QTY) {
        errors.push(`${recipe.id}: lines.${index}: ${use.qty} units of "${use.food}" (max ${MAX_UNIT_QTY})`);
      }
    }
  });
  return errors;
}

/** Every error of every recipe (shape, foods, units, duplicate ids). Empty means valid. */
export function validateRecipes(
  recipes: readonly unknown[],
  foodIds: Set<string>,
  foodUnits: Map<string, FoodUnit>,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  recipes.forEach((raw, index) => {
    const label = labelOf(raw, index);
    if (seen.has(label)) errors.push(`duplicate recipe id "${label}"`);
    seen.add(label);
    const parsed = recipeFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${label}: ${issue.path.join(".") || "(file)"}: ${issue.message}`);
      }
      return;
    }
    errors.push(...foodErrors(parsed.data, foodIds, foodUnits));
  });
  return errors;
}

export interface RecipeFile {
  fileName: string;
  data: unknown;
}

/** validateRecipes plus "the file name equals the id". */
export function validateRecipeFiles(
  files: readonly RecipeFile[],
  foodIds: Set<string>,
  foodUnits: Map<string, FoodUnit>,
): string[] {
  const nameErrors = files.flatMap(({ fileName, data }, index) => {
    const id = labelOf(data, index);
    return fileName === `${id}.json` ? [] : [`${fileName}: the file name must be "${id}.json"`];
  });
  return [...nameErrors, ...validateRecipes(files.map((file) => file.data), foodIds, foodUnits)];
}
