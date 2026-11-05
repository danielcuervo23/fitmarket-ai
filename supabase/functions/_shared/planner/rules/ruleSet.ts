/**
 * Rule set (spec section 3): turns goal targets into the measurable rules of a
 * plan, ordered by priority level (1 safety, 2 calories and protein, 3 health,
 * 4 family, 5 savings).
 *
 * Linear rules are written as `min <= Σ coef·metric <= max` so the optimizer
 * can use them directly; share rules use a zero bound
 * (`free_sugar_max`: 4·freeSugars − 0.099·kcal <= 0). Structural rules count
 * things (food groups, legume meals, distinct foods) and are only evaluated.
 *
 * Pure and deterministic.
 */

import type { GabaGroup, Ingredient } from "../../catalog.ts";
import type { Slot } from "../types.ts";
import type { GoalTargets } from "./targets.ts";

export type RuleLevel = 1 | 2 | 3 | 4 | 5;
export type RuleCode =
  | "kcal_safety" | "protein_safety_max" | "protein_muscle_floor" | "budget"
  | "kcal_range" | "protein_min" | "protein_max" | "carbs_min_muscle" | "meal_protein_muscle"
  | "fruit_veg_min" | "fiber_min" | "free_sugar_max" | "sodium_max" | "fat_max" | "sat_fat_max"
  | "legumes_week" | "distinct_foods_week" | "gaba_groups_day" | "meal_kcal_share_max"
  | "breakfast_protein_min" | "breakfast_fiber_min" | "iron_sources_week" | "cheap_protein_share";
export type RuleUnit = "kcal" | "g" | "mg" | "g_per_kg" | "pct_kcal" | "pct_protein" | "count";
export type Metric =
  | "kcal" | "protein" | "carbs" | "fat" | "satFat" | "freeSugars" | "fiber" | "sodium"
  | "fruitVeg" | "cheapProtein" | "dayKcal";

export interface LinearRule {
  code: RuleCode;
  level: RuleLevel;
  scope: "day" | "meal" | "week";
  /** Meal scope only. */
  slots?: readonly Slot[];
  /** Σ coef·metric. */
  terms: Partial<Record<Metric, number>>;
  /** Bounds on Σ. */
  min?: number;
  max?: number;
  /** |bound|, or targets.kcal when the bound is 0. */
  slackScale: number;
  /** What the user is shown: the human target (e.g. "< 2000 mg", "< 10 %"). */
  display: { unit: RuleUnit; target: number };
}

export interface StructuralRule {
  code: "gaba_groups_day" | "legumes_week" | "distinct_foods_week" | "iron_sources_week";
  level: 3;
  min: number;
}

export interface RuleSet {
  targets: GoalTargets;
  linear: LinearRule[];
  structural: StructuralRule[];
}

/**
 * A rule the week does not meet. `achieved` is in `unit` (worst day for day
 * rules, worst meal for meal rules, weekly total for week rules).
 *
 * `unmeasurable` marks a rule that could not be checked because some food on
 * the menu has no micro-nutrient data (or is not in the catalog) and the
 * measured part alone does not settle it. `achieved` is then the measured
 * part only. It is never reported as met.
 */
export interface Shortfall {
  rule: RuleCode;
  level: RuleLevel;
  unit: RuleUnit;
  target: number;
  achieved: number;
  unmeasurable?: true;
}

export const LEGUME_IDS: ReadonlySet<string> = new Set(["lentejas", "frijol", "garbanzo", "arveja_seca"]);

export const CHEAP_PROTEIN_IDS: ReadonlySet<string> = new Set([
  "huevo",
  "lentejas",
  "frijol",
  "garbanzo",
  "arveja_seca",
  "pernil_pollo",
  "sardina_lata",
]);

const IRON_SOURCE_MIN_MG = 1.5;
const IRON_SOURCE_GROUPS: ReadonlySet<GabaGroup> = new Set(["proteicos", "frutas_verduras"]);

/** Food with `iron_mg >= 1.5` per 100 g in GABA group proteicos or frutas_verduras. */
export function isIronSource(ingredient: Ingredient): boolean {
  const micro = ingredient.micro;
  if (!micro || micro.gabaGroup === null) return false;
  return micro.ironMg >= IRON_SOURCE_MIN_MG && IRON_SOURCE_GROUPS.has(micro.gabaGroup);
}

/** Level 5 rules are always elastic: reported, but never a reason to refuse a plan. */
export function isBlocker(shortfall: Shortfall): boolean {
  return shortfall.level < 5;
}

const MEAL_SLOTS: readonly Slot[] = ["desayuno", "almuerzo", "cena"];
const ALL_SLOTS: readonly Slot[] = ["desayuno", "almuerzo", "cena", "snacks"];
const BREAKFAST: readonly Slot[] = ["desayuno"];

/** Spec values. "Strictly less than" rules use 0.099 and 1999. */
const V = {
  fruitVegMinG: 400,
  fiberMinG: 25,
  freeSugarShare: 0.099,
  sodiumMaxMg: 1999,
  fatShare: 0.3,
  satFatShare: 0.099,
  legumeMealsWeek: 2,
  distinctFoodsWeek: 15,
  gabaGroupsDay: 4,
  mealKcalShareMax: 0.4,
  breakfastProteinMinG: 15,
  breakfastFiberMinG: 3,
  ironSourceMealsWeek: 5,
  cheapProteinShare: 0.5,
  mealProteinMuscle: { min: 20, max: 40 },
} as const;

const KCAL_PER_G = { fat: 9, sugar: 4 } as const;

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function buildRuleSet(targets: GoalTargets): RuleSet {
  const goals = new Set(targets.effectiveGoals);
  const has = (...any: string[]): boolean => any.some((goal) => goals.has(goal));
  const perKg = (grams: number): number => round2(grams / targets.weightKg);
  const scaleOf = (bound: number): number => Math.abs(bound) || targets.kcal;

  const linear: LinearRule[] = [];
  const add = (
    rule: Omit<LinearRule, "slackScale" | "scope"> & { scope?: LinearRule["scope"] },
  ): void => {
    const bound = rule.min ?? rule.max ?? 0;
    linear.push({ scope: "day", ...rule, slackScale: scaleOf(bound) });
  };
  const shareMax = (code: RuleCode, metric: Metric, kcalPerUnit: number, share: number, display: number): void =>
    add({
      code,
      level: 3,
      terms: { [metric]: kcalPerUnit, kcal: -share },
      max: 0,
      display: { unit: "pct_kcal", target: display },
    });

  // Level 1: safety.
  add({
    code: "kcal_safety",
    level: 1,
    terms: { kcal: 1 },
    min: targets.kcalSafety.min,
    max: targets.kcalSafety.max,
    display: { unit: "kcal", target: targets.kcalSafety.min },
  });
  add({
    code: "protein_safety_max",
    level: 1,
    terms: { protein: 1 },
    max: targets.proteinSafetyMaxG,
    display: { unit: "g_per_kg", target: perKg(targets.proteinSafetyMaxG) },
  });
  if (targets.proteinFloorG !== null) {
    add({
      code: "protein_muscle_floor",
      level: 1,
      terms: { protein: 1 },
      min: targets.proteinFloorG,
      display: { unit: "g_per_kg", target: perKg(targets.proteinFloorG) },
    });
  }

  // Level 2: calories and protein. A zero-width range is ">= min", capped by safety.
  const { kcalRange } = targets;
  add({
    code: "kcal_range",
    level: 2,
    terms: { kcal: 1 },
    min: kcalRange.min,
    max: kcalRange.max > kcalRange.min ? kcalRange.max : targets.kcalSafety.max,
    display: { unit: "kcal", target: targets.kcal },
  });
  add({
    code: "protein_min",
    level: 2,
    terms: { protein: 1 },
    min: targets.proteinG.min,
    display: { unit: "g_per_kg", target: perKg(targets.proteinG.min) },
  });
  add({
    code: "protein_max",
    level: 2,
    terms: { protein: 1 },
    max: targets.proteinG.max,
    display: { unit: "g_per_kg", target: perKg(targets.proteinG.max) },
  });
  if (targets.carbsMinG !== null) {
    add({
      code: "carbs_min_muscle",
      level: 2,
      terms: { carbs: 1 },
      min: targets.carbsMinG,
      display: { unit: "g_per_kg", target: perKg(targets.carbsMinG) },
    });
  }
  if (goals.has("muscle")) {
    add({
      code: "meal_protein_muscle",
      level: 2,
      scope: "meal",
      slots: MEAL_SLOTS,
      terms: { protein: 1 },
      min: V.mealProteinMuscle.min,
      max: V.mealProteinMuscle.max,
      display: { unit: "g", target: V.mealProteinMuscle.min },
    });
  }

  // Level 3: health.
  if (has("healthy", "fat")) {
    add({ code: "fruit_veg_min", level: 3, terms: { fruitVeg: 1 }, min: V.fruitVegMinG, display: { unit: "g", target: V.fruitVegMinG } });
    add({ code: "fiber_min", level: 3, terms: { fiber: 1 }, min: V.fiberMinG, display: { unit: "g", target: V.fiberMinG } });
  }
  if (has("healthy", "energy")) {
    shareMax("free_sugar_max", "freeSugars", KCAL_PER_G.sugar, V.freeSugarShare, 10);
  }
  if (has("healthy")) {
    add({ code: "sodium_max", level: 3, terms: { sodium: 1 }, max: V.sodiumMaxMg, display: { unit: "mg", target: 2000 } });
    shareMax("fat_max", "fat", KCAL_PER_G.fat, V.fatShare, 30);
    shareMax("sat_fat_max", "satFat", KCAL_PER_G.fat, V.satFatShare, 10);
  }
  if (has("energy")) {
    add({
      code: "meal_kcal_share_max",
      level: 3,
      scope: "meal",
      slots: ALL_SLOTS,
      terms: { kcal: 1, dayKcal: -V.mealKcalShareMax },
      max: 0,
      display: { unit: "pct_kcal", target: 40 },
    });
    add({
      code: "breakfast_protein_min",
      level: 3,
      scope: "meal",
      slots: BREAKFAST,
      terms: { protein: 1 },
      min: V.breakfastProteinMinG,
      display: { unit: "g", target: V.breakfastProteinMinG },
    });
    add({
      code: "breakfast_fiber_min",
      level: 3,
      scope: "meal",
      slots: BREAKFAST,
      terms: { fiber: 1 },
      min: V.breakfastFiberMinG,
      display: { unit: "g", target: V.breakfastFiberMinG },
    });
  }

  // Level 4 (family) has no numeric rule yet. Level 5: savings, always elastic.
  if (has("save")) {
    add({
      code: "cheap_protein_share",
      level: 5,
      scope: "week",
      terms: { cheapProtein: 1, protein: -V.cheapProteinShare },
      min: 0,
      display: { unit: "pct_protein", target: 50 },
    });
  }

  const structural: StructuralRule[] = [{ code: "gaba_groups_day", level: 3, min: V.gabaGroupsDay }];
  if (has("healthy")) {
    structural.push(
      { code: "legumes_week", level: 3, min: V.legumeMealsWeek },
      { code: "distinct_foods_week", level: 3, min: V.distinctFoodsWeek },
    );
  }
  if (has("energy")) {
    structural.push({ code: "iron_sources_week", level: 3, min: V.ironSourceMealsWeek });
  }

  return { targets, linear, structural };
}
