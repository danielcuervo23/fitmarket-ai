/**
 * Week evaluation: measures a composed week against a rule set and lists the
 * rules it does not meet.
 *
 * - Day rules report the worst day, meal rules the worst meal among their
 *   slots, week rules the weekly total.
 * - A bound is missed only when the gap is larger than `tolerance` (default
 *   2 %) of the bound, or of the share allowance for zero-bound share rules
 *   (e.g. 2 % of the 9.9 % free-sugar allowance).
 * - Missing data (a food without micro-nutrients, or an id not in the catalog)
 *   never counts as met. Nutrient amounts only add up, so when every unknown
 *   metric of a rule has a positive coefficient the measured part is a lower
 *   bound: it settles a minimum it already reaches and a maximum it already
 *   breaks. Anything else is reported with `unmeasurable: true`.
 * - Lines with a quantity of 0 or less are not on the menu and are skipped.
 *
 * Pure: never modifies its inputs, never logs.
 */

import { gramsOf, microOf, nutritionOf } from "../../catalog.ts";
import type { Catalog, GabaGroup } from "../../catalog.ts";
import { DAYS, SLOTS } from "../types.ts";
import type { ComposedMeal, ComposedWeek } from "../types.ts";
import { CHEAP_PROTEIN_IDS, LEGUME_IDS, isIronSource } from "./ruleSet.ts";
import type { LinearRule, Metric, RuleSet, Shortfall, StructuralRule } from "./ruleSet.ts";

const DEFAULT_TOLERANCE = 0.02;
const GABA_MIN_GRAMS = 10;

const MACRO_METRICS: readonly Metric[] = ["kcal", "protein", "carbs", "fat", "cheapProtein"];
const MICRO_METRICS: readonly Metric[] = ["fiber", "freeSugars", "satFat", "sodium", "fruitVeg"];

/** Metric totals of a meal, day or week, plus the metrics that lack data. */
interface Totals {
  values: Record<Metric, number>;
  unknown: Set<Metric>;
}

type Status = "met" | "unmet" | "unmeasurable";

/** One measured instance of a rule (a day, a meal or the week). */
interface Check {
  status: Status;
  /** Gap past the bound, relative to its scale; larger is worse. */
  gap: number;
  target: number;
  achieved: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function emptyTotals(): Totals {
  return {
    values: {
      kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, freeSugars: 0,
      fiber: 0, sodium: 0, fruitVeg: 0, cheapProtein: 0, dayKcal: 0,
    },
    unknown: new Set(),
  };
}

function addInto(total: Totals, part: Totals): void {
  for (const key of Object.keys(part.values) as Metric[]) total.values[key] += part.values[key];
  for (const metric of part.unknown) total.unknown.add(metric);
}

const eaten = (meal: ComposedMeal) => meal.items.filter((item) => item.qty > 0);

function mealTotals(meal: ComposedMeal, catalog: Catalog): Totals {
  const totals = emptyTotals();
  const { values, unknown } = totals;
  for (const item of eaten(meal)) {
    const ingredient = catalog.get(item.id);
    if (!ingredient) {
      for (const metric of [...MACRO_METRICS, ...MICRO_METRICS]) unknown.add(metric);
      continue;
    }
    const nutrition = nutritionOf(ingredient, item.qty);
    values.kcal += nutrition.kcal;
    values.protein += nutrition.protein;
    values.carbs += nutrition.carbs;
    values.fat += nutrition.fat;
    if (CHEAP_PROTEIN_IDS.has(item.id)) values.cheapProtein += nutrition.protein;

    const micro = microOf(ingredient, item.qty);
    if (!micro) {
      for (const metric of MICRO_METRICS) unknown.add(metric);
      continue;
    }
    values.fiber += micro.fiberG;
    values.freeSugars += micro.freeSugarsG;
    values.satFat += micro.satFatG;
    values.sodium += micro.sodiumMg;
    values.fruitVeg += micro.fruitVegG;
  }
  return totals;
}

function sumTotals(parts: readonly Totals[]): Totals {
  const total = emptyTotals();
  for (const part of parts) addInto(total, part);
  return total;
}

/** A meal's totals with `dayKcal` set from its day. */
function withDayKcal(meal: Totals, day: Totals): Totals {
  const unknown = new Set(meal.unknown);
  if (day.unknown.has("kcal")) unknown.add("dayKcal");
  return { values: { ...meal.values, dayKcal: day.values.kcal }, unknown };
}

const termsOf = (rule: LinearRule) => Object.entries(rule.terms) as [Metric, number][];

/** The rule's value in its display unit (g/kg, % of kcal or protein, or the plain sum). */
function displayValue(rule: LinearRule, totals: Totals, weightKg: number): number {
  const terms = termsOf(rule);
  const unit = rule.display.unit;
  if (unit === "pct_kcal" || unit === "pct_protein") {
    let numerator = 0;
    let denominator = 0;
    for (const [metric, coef] of terms) {
      if (coef > 0) numerator += coef * totals.values[metric];
      else denominator += totals.values[metric];
    }
    return denominator > 0 ? round2((numerator / denominator) * 100) : 0;
  }
  const sum = terms.reduce((acc, [metric, coef]) => acc + coef * totals.values[metric], 0);
  return round2(unit === "g_per_kg" ? sum / weightKg : sum);
}

function boundInDisplayUnit(rule: LinearRule, bound: number, weightKg: number): number {
  return rule.display.unit === "g_per_kg" ? round2(bound / weightKg) : bound;
}

function checkLinear(rule: LinearRule, totals: Totals, weightKg: number, tolerance: number): Check[] {
  const terms = termsOf(rule);
  const sum = terms.reduce((acc, [metric, coef]) => acc + coef * totals.values[metric], 0);
  const allowance = terms.reduce(
    (acc, [metric, coef]) => (coef < 0 ? acc - coef * totals.values[metric] : acc),
    0,
  );
  const unknownTerms = terms.filter(([metric]) => totals.unknown.has(metric));
  const lowerBoundOnly = unknownTerms.every(([, coef]) => coef > 0);
  const achieved = displayValue(rule, totals, weightKg);
  const twoSided = rule.min !== undefined && rule.max !== undefined;

  const bounds: { bound: number; side: "min" | "max" }[] = [];
  if (rule.min !== undefined) bounds.push({ bound: rule.min, side: "min" });
  if (rule.max !== undefined) bounds.push({ bound: rule.max, side: "max" });

  return bounds.map(({ bound, side }) => {
    const scale = Math.abs(bound) || allowance;
    const over = side === "min" ? bound - sum : sum - bound;
    const gap = scale > 0 ? over / scale : over > 0 ? Infinity : 0;
    const missed = gap > tolerance;
    let status: Status = missed ? "unmet" : "met";
    if (unknownTerms.length > 0) {
      const settled = lowerBoundOnly && (side === "min" ? !missed : missed);
      if (!settled) status = "unmeasurable";
    }
    const target = twoSided ? boundInDisplayUnit(rule, bound, weightKg) : rule.display.target;
    return { status, gap, target, achieved };
  });
}

/** Worst definite miss first; otherwise the worst unmeasurable instance; otherwise none. */
function worst(checks: readonly Check[]): Check | null {
  const pick = (status: Status): Check | null =>
    checks.filter((c) => c.status === status).reduce<Check | null>((a, c) => (a && a.gap >= c.gap ? a : c), null);
  return pick("unmet") ?? pick("unmeasurable");
}

function toShortfall(rule: LinearRule | StructuralRule, unit: Shortfall["unit"], check: Check): Shortfall {
  const shortfall: Shortfall = { rule: rule.code, level: rule.level, unit, target: check.target, achieved: check.achieved };
  return check.status === "unmeasurable" ? { ...shortfall, unmeasurable: true } : shortfall;
}

/** A count rule (minimum only): `known` is what the data proves, `unsure` whether more may exist. */
function countCheck(min: number, known: number, unsure: boolean): Check {
  const status: Status = known >= min ? "met" : unsure ? "unmeasurable" : "unmet";
  return { status, gap: min > 0 ? (min - known) / min : 0, target: min, achieved: known };
}

function gabaCheck(meals: readonly ComposedMeal[], catalog: Catalog, min: number): Check {
  const grams = new Map<GabaGroup, number>();
  let unsure = false;
  for (const item of meals.flatMap(eaten)) {
    const ingredient = catalog.get(item.id);
    const micro = ingredient?.micro;
    if (!ingredient || !micro) {
      unsure = true;
      continue;
    }
    if (micro.gabaGroup === null) continue;
    grams.set(micro.gabaGroup, (grams.get(micro.gabaGroup) ?? 0) + gramsOf(ingredient, item.qty));
  }
  const groups = [...grams.values()].filter((g) => g >= GABA_MIN_GRAMS).length;
  return countCheck(min, groups, unsure);
}

function ironCheck(meals: readonly ComposedMeal[], catalog: Catalog, min: number): Check {
  let known = 0;
  let unsure = false;
  for (const meal of meals) {
    const ingredients = eaten(meal).map((item) => catalog.get(item.id));
    if (ingredients.some((i) => i !== undefined && isIronSource(i))) known += 1;
    else if (ingredients.some((i) => i === undefined || !i.micro)) unsure = true;
  }
  return countCheck(min, known, unsure);
}

function checkStructural(rule: StructuralRule, week: ComposedWeek, catalog: Catalog): Check | null {
  const days = DAYS.map((day) => SLOTS.map((slot) => week[day][slot]));
  const meals = days.flat();
  switch (rule.code) {
    case "gaba_groups_day":
      return worst(days.map((dayMeals) => gabaCheck(dayMeals, catalog, rule.min)));
    case "legumes_week": {
      const count = meals.filter((meal) => eaten(meal).some((item) => LEGUME_IDS.has(item.id))).length;
      return worst([countCheck(rule.min, count, false)]);
    }
    case "distinct_foods_week": {
      const count = new Set(meals.flatMap((meal) => eaten(meal).map((item) => item.id))).size;
      return worst([countCheck(rule.min, count, false)]);
    }
    case "iron_sources_week":
      return worst([ironCheck(meals, catalog, rule.min)]);
  }
}

export function evaluateWeek(
  week: ComposedWeek,
  rules: RuleSet,
  catalog: Catalog,
  tolerance: number = DEFAULT_TOLERANCE,
): Shortfall[] {
  const { weightKg } = rules.targets;
  const meals = DAYS.map((day) => SLOTS.map((slot) => ({ slot, totals: mealTotals(week[day][slot], catalog) })));
  const dayTotals = meals.map((dayMeals) => sumTotals(dayMeals.map((m) => m.totals)));
  const weekTotals = sumTotals(dayTotals);

  const scopeTotals = (rule: LinearRule): Totals[] => {
    if (rule.scope === "week") return [weekTotals];
    if (rule.scope === "day") return dayTotals;
    const slots = rule.slots ?? SLOTS;
    return meals.flatMap((dayMeals, i) =>
      dayMeals.filter((m) => slots.includes(m.slot)).map((m) => withDayKcal(m.totals, dayTotals[i])),
    );
  };

  const shortfalls: Shortfall[] = [];
  for (const rule of rules.linear) {
    const check = worst(scopeTotals(rule).flatMap((totals) => checkLinear(rule, totals, weightKg, tolerance)));
    if (check) shortfalls.push(toShortfall(rule, rule.display.unit, check));
  }
  for (const rule of rules.structural) {
    const check = checkStructural(rule, week, catalog);
    if (check) shortfalls.push(toShortfall(rule, "count", check));
  }
  return shortfalls;
}
