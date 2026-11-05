import type { ComposedMeal, MealItem } from "../planner/types.ts";
import type { ResolvedLine, ResolvedRecipe } from "./eligibility.ts";
import type { ScalableRole } from "./types.ts";

/**
 * Turns a resolved recipe, the food chosen on each line and a scale per role
 * into the meal the user eats. Quantities are not rounded here.
 */

/** Line index -> chosen food id (the line's food or one of its alternatives). */
export type LineChoice = Record<number, string>;
export type RoleScales = Partial<Record<ScalableRole, number>>;

type Name = { es: string; en: string };

export function primaryChoice(recipe: ResolvedRecipe): LineChoice {
  return Object.fromEntries(recipe.lines.map((line, index) => [index, line.food]));
}

/** The chosen food when it is an option of the line, else the line's own food. */
function chosenFood(line: ResolvedLine, choice: LineChoice, index: number): string {
  const wanted = choice[index];
  const isOption = wanted === line.food || (line.alternatives ?? []).some((alt) => alt.food === wanted);

  return isOption ? wanted : line.food;
}

/** Name for the food on an `inName` line, when it brings its own. */
function lineName(line: ResolvedLine, food: string): Name | undefined {
  if (!line.inName) return undefined;
  if (food === line.food) return line.name;
  return line.alternatives?.find((alt) => alt.food === food)?.name;
}

export function recipeName(recipe: ResolvedRecipe, choice: LineChoice): Name {
  for (const [index, line] of recipe.lines.entries()) {
    const name = lineName(line, chosenFood(line, choice, index));

    if (name) return { ...name };
  }

  return { ...recipe.name };
}

/** Base quantity (one serving) of the line's food or of one of its alternatives. */
export function lineQty(recipe: ResolvedRecipe, index: number, food: string): number {
  const line = recipe.lines[index];

  if (line?.food === food) return line.qty;

  const alternative = line?.alternatives?.find((alt) => alt.food === food);

  if (!alternative) {
    throw new RangeError(`lineQty: ${recipe.id} line ${index} has no option ${food}`);
  }

  return alternative.qty;
}

/**
 * The meal for one serving: each line's base qty times its role's scale
 * (fixed lines and missing roles use 1). Scales are NOT clamped here: callers
 * (the optimizer, T9/T10) must pass scales already inside the recipe's range
 * (`recipe.scale` or DEFAULT_ROLE_SCALE). Quantities are not rounded either.
 */
export function expandMeal(recipe: ResolvedRecipe, choice: LineChoice, scales: RoleScales): ComposedMeal {
  const items: MealItem[] = [];

  for (const [index, line] of recipe.lines.entries()) {
    const food = chosenFood(line, choice, index);
    const scale = line.role === "fixed" ? 1 : (scales[line.role] ?? 1);
    const qty = lineQty(recipe, index, food) * scale;
    const existing = items.find((item) => item.id === food);

    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ id: food, qty });
    }
  }

  return { name: recipeName(recipe, choice), items, recipeId: recipe.id };
}
