import type { Catalog } from "../catalog.ts";
import type { PriceBook } from "../planner/priceBook.ts";
import { isAllowed, type RestrictionRules } from "../planner/restrictions.ts";
import { SLOTS, type Slot } from "../planner/types.ts";
import { SOAK_FOODS } from "./library.generated.ts";
import {
  COOKING_LEVELS,
  DEFAULT_ROLE_SCALE,
  type CookingLevel,
  type CookingPrefs,
  type Recipe,
  type RecipeAlternative,
  type RecipeLine,
} from "./types.ts";

/**
 * Which library recipes this user can cook, and with which foods.
 *
 * Library recipes are deep-frozen and shared by every request: nothing here
 * changes them. A resolved recipe is always a new object with new lines.
 */

export interface EligibilityContext {
  rules: RestrictionRules;
  catalog: Catalog;
  prices: PriceBook;
  /** The user's stores; empty means "any store". */
  stores: string[];
  cooking: CookingPrefs;
}

/** A line after eligibility: only usable foods and alternatives remain. */
export interface ResolvedLine extends RecipeLine {
  /**
   * Dish name for the line's current food, set when an `inName` primary was
   * unusable and its alternative moved into `food`.
   */
  name?: { es: string; en: string };
}

export interface ResolvedRecipe extends Recipe {
  lines: ResolvedLine[];
  /** Too long or too hard for a weekday, fine for the weekend. */
  weekendOnly: boolean;
}

export const WEEKEND_MAX_MINUTES = 60;
export const MIN_RECIPES_PER_SLOT = 3;

const WEEKDAY_CAPS: Record<CookingPrefs["weekdayMinutes"], number> = { 10: 10, 20: 20, 30: 45 };

/** 30 means "30 or more", so a weekday recipe may take up to 45 minutes. */
export function weekdayMinutesCap(minutes: CookingPrefs["weekdayMinutes"]): number {
  return WEEKDAY_CAPS[minutes] ?? WEEKDAY_CAPS[20];
}

const levelRank = (level: CookingLevel): number => COOKING_LEVELS.indexOf(level);

const SOAK: ReadonlySet<string> = new Set(SOAK_FOODS);

/** Dried legume that must soak overnight (needsSoaking in foods.json; never lentejas). */
export function needsSoaking(food: string): boolean {
  return SOAK.has(food);
}

/** The soak foods a resolved recipe cooks with (each line's current food), in line order. */
export function soakFoodsOf(recipe: ResolvedRecipe): string[] {
  return [...new Set(recipe.lines.map((line) => line.food).filter(needsSoaking))];
}

/**
 * Protein cap for a dish whose every protein option is protein-dense (owner
 * decision 2026-11-12): a 100 kg muscle user needs 140 g of protein a day (the
 * level-1 floor) and 2x portions cannot reach it. 2.5x keeps portions
 * realistic (at most 375 g raw chicken, 175 g dry lentils, 150 g cheese); 3x
 * would mean 210 g dry lentils in one meal. Foods counted in whole units (eggs)
 * keep 2x, so a meal never has more than 6 eggs (review 2026-11-12). The
 * level-2 protein_max rule still caps the day's protein for everyone.
 */
export const PROTEIN_DENSE_MAX_SCALE = 2.5;
const DENSE_DAIRY_MIN_PROTEIN_G = 15;

/**
 * Meat, fish and legumes (GABA group "proteicos"), or a dairy with at least
 * 15 g of protein per 100 g (cheese), sold by weight. Not milk, yogurt or
 * peanuts, and not eggs (whole units).
 */
function isProteinDense(food: string, catalog: Catalog): boolean {
  const ingredient = catalog.get(food);
  const group = ingredient?.micro?.gabaGroup;
  if (!ingredient || !group || ingredient.unit !== "g") return false;
  return group === "proteicos" || (group === "lacteos" && ingredient.per100.protein >= DENSE_DAIRY_MIN_PROTEIN_G);
}

/**
 * The recipe's scale ranges, with the protein cap raised to
 * PROTEIN_DENSE_MAX_SCALE when every option of every protein line is
 * protein-dense (a single egg line keeps the whole dish at 2x). A range the recipe sets itself is kept.
 */
function resolvedScale(recipe: Recipe, lines: readonly ResolvedLine[], catalog: Catalog): Recipe["scale"] {
  const own = recipe.scale
    ? Object.fromEntries(Object.entries(recipe.scale).map(([role, range]) => [role, [...range] as [number, number]]))
    : undefined;
  if (own?.protein) return own;

  const protein = lines.filter((line) => line.role === "protein");
  const dense =
    protein.length > 0 &&
    protein.every((line) =>
      [line.food, ...(line.alternatives ?? []).map((alt) => alt.food)].every((food) => isProteinDense(food, catalog)),
    );
  if (!dense) return own;
  return { ...own, protein: [DEFAULT_ROLE_SCALE.protein[0], PROTEIN_DENSE_MAX_SCALE] };
}

/** In the catalog, with micro-nutrients, allowed, and sold by some chosen store. */
function isUsableFood(food: string, ctx: EligibilityContext): boolean {
  const ingredient = ctx.catalog.get(food);

  return (
    ingredient !== undefined &&
    ingredient.micro !== undefined &&
    isAllowed(ingredient, ctx.rules) &&
    (ctx.stores.length === 0 || ctx.stores.some((store) => ctx.prices.carries(store, food)))
  );
}

type LineResult = { kind: "keep"; line: ResolvedLine } | { kind: "drop" } | { kind: "blocked" };

/**
 * The line with these alternatives. The key is left out when none remain, the
 * same shape as a recipe line that never had any (readers use `?? []`).
 */
function withAlternatives<T extends RecipeLine>(line: T, alternatives: RecipeAlternative[]): T {
  const { alternatives: _old, ...rest } = line;
  return (alternatives.length > 0 ? { ...rest, alternatives } : rest) as T;
}

function resolveLine(line: RecipeLine, ctx: EligibilityContext): LineResult {
  const usable: RecipeAlternative[] = (line.alternatives ?? []).filter((alt) => isUsableFood(alt.food, ctx));

  if (isUsableFood(line.food, ctx)) {
    return { kind: "keep", line: withAlternatives(line, usable) };
  }

  const [first, ...rest] = usable;

  if (first) {
    const swapped: ResolvedLine = withAlternatives({ ...line, food: first.food, qty: first.qty }, rest);

    if (line.inName && first.name) {
      swapped.name = { ...first.name };
    }

    return { kind: "keep", line: swapped };
  }

  return line.optional ? { kind: "drop" } : { kind: "blocked" };
}

/** null when no day works; true when only the weekend works. */
function weekendOnlyFor(recipe: Recipe, cooking: CookingPrefs): boolean | null {
  const userLevel = levelRank(cooking.level);
  const recipeLevel = levelRank(recipe.level);
  const weekdayOk = recipe.minutes <= weekdayMinutesCap(cooking.weekdayMinutes) && recipeLevel <= userLevel;
  const weekendOk = recipe.minutes <= WEEKEND_MAX_MINUTES && recipeLevel <= userLevel + 1;

  if (weekdayOk) return false;
  return weekendOk ? true : null;
}

export function resolveRecipe(recipe: Recipe, ctx: EligibilityContext): ResolvedRecipe | null {
  // An empty list means no cooking, which fits every kitchen.
  if (!recipe.appliances.every((appliance) => ctx.cooking.appliances.includes(appliance))) {
    return null;
  }

  const weekendOnly = weekendOnlyFor(recipe, ctx.cooking);

  if (weekendOnly === null) {
    return null;
  }

  const lines: ResolvedLine[] = [];

  for (const line of recipe.lines) {
    const result = resolveLine(line, ctx);

    if (result.kind === "blocked") return null;
    if (result.kind === "keep") lines.push(result.line);
  }

  if (!lines.some((line) => line.role !== "fixed")) {
    return null;
  }

  // Owner decision 2026-11-11: dried legumes that soak overnight are cooked
  // only on Saturday or Sunday. A recipe that cooks one is weekend-only; a
  // weekday-capable recipe drops its soak alternatives, so none can be chosen
  // on a weekday later.
  if (lines.some((line) => needsSoaking(line.food))) {
    return withScale({ ...ownedCopy(recipe), lines, weekendOnly: true }, resolvedScale(recipe, lines, ctx.catalog));
  }

  const weekdaySafe = weekendOnly
    ? lines
    : lines.map((line) => withAlternatives(line, (line.alternatives ?? []).filter((alt) => !needsSoaking(alt.food))));

  return withScale({ ...ownedCopy(recipe), lines: weekdaySafe, weekendOnly }, resolvedScale(recipe, weekdaySafe, ctx.catalog));
}

/** The recipe with these scale ranges; the key is left out when there are none. */
function withScale(recipe: ResolvedRecipe, scale: Recipe["scale"]): ResolvedRecipe {
  const { scale: _old, ...rest } = recipe;
  return scale ? { ...rest, scale } : rest;
}

/**
 * A copy whose arrays and objects belong to the caller, so a later change to
 * a resolved recipe can never hit the deep-frozen library (which would throw).
 * `scale` is left out: resolvedScale builds the resolved recipe's own copy.
 * Copying is cheaper to keep right than readonly types on every consumer.
 */
function ownedCopy(recipe: Recipe): Omit<Recipe, "scale"> {
  const { scale: _scale, ...rest } = recipe;

  return {
    ...rest,
    name: { ...recipe.name },
    slots: [...recipe.slots],
    appliances: [...recipe.appliances],
    batch: { ...recipe.batch },
    steps: { es: [...recipe.steps.es], en: [...recipe.steps.en] },
  };
}

export function eligibleRecipes(recipes: readonly Recipe[], ctx: EligibilityContext): ResolvedRecipe[] {
  return recipes.flatMap((recipe) => {
    const resolved = resolveRecipe(recipe, ctx);
    return resolved ? [resolved] : [];
  });
}

/** Usable recipes per meal slot (a recipe counts in each of its slots), weekend-only included. */
export function countBySlot(recipes: readonly ResolvedRecipe[]): Record<Slot, number> {
  const counts = Object.fromEntries(SLOTS.map((slot) => [slot, 0])) as Record<Slot, number>;

  for (const recipe of recipes) {
    for (const slot of recipe.slots) {
      counts[slot] += 1;
    }
  }

  return counts;
}

interface CoverageCounts {
  /** Recipes usable on weekdays (not weekendOnly), per slot: what coverage is judged on. */
  availableRecipes: Record<Slot, number>;
  /** All usable recipes per slot, weekend-only ones included. */
  totalRecipes: Record<Slot, number>;
}

export type RecipeCoverage =
  | ({ ok: true } & CoverageCounts)
  | ({ ok: false; code: "restrictions_too_strict" } & CoverageCounts);

/**
 * Every slot needs MIN_RECIPES_PER_SLOT recipes that work on a weekday, else
 * the restrictions are too strict: weekend-only recipes would leave Monday to
 * Friday with nothing.
 */
export function recipeCoverage(recipes: readonly ResolvedRecipe[]): RecipeCoverage {
  const availableRecipes = countBySlot(recipes.filter((recipe) => !recipe.weekendOnly));
  const totalRecipes = countBySlot(recipes);

  return SLOTS.every((slot) => availableRecipes[slot] >= MIN_RECIPES_PER_SLOT)
    ? { ok: true, availableRecipes, totalRecipes }
    : { ok: false, code: "restrictions_too_strict", availableRecipes, totalRecipes };
}
