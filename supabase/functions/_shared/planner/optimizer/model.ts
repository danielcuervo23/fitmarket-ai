/**
 * Optimizer model builder ("el contador", spec section 6.4): turns a week of
 * planned recipes, the rule set and the pack prices into one linear program.
 *
 * - One scale variable per (group, role used in the recipe): `x|<group>|<role>`,
 *   bounded by the recipe's `scale` or DEFAULT_ROLE_SCALE through a row named
 *   after the variable. Meals of the same group (batch cooking) share it.
 *   Fixed lines are constants: they move to the right-hand side.
 * - One pack variable per food on the menu: `p|<foodId>`, covering what the
 *   household eats (`pack|<foodId>`: packSize·p − householdFactor·Σ qty ≥ fixed),
 *   priced in thousands of COP in the objective `cost`.
 * - Budget row `budget`: Σ packPriceCop·p ≤ budgetCop, always hard.
 * - Rule rows `r|<code>|<day>|<slot>` (`-` when not applicable), measured on
 *   the user's own portion. Level 1 is always hard. Levels 2 to 5 depend on
 *   the mode: `elastic` gives each rule instance a relative slack
 *   `s|<code>|<day>|<slot>` (two-sided rules: one per side, `…|min` and
 *   `…|max`) with coefficient ±slackScale and cost PENALTY[level];
 *   `strict` makes 2 to 4 hard and keeps 5 elastic; `safety_only` drops 2 to 5.
 *
 * Pure, deterministic and independent of the solver: it only produces the
 * plain `LpModel` data. Names are built from validated ids, groups, rule
 * codes, days and slots only, never from user text. Invalid input throws a
 * RangeError.
 */

import { microOf, nutritionOf, type Catalog } from "../../catalog.ts";
import type { ResolvedRecipe } from "../../recipes/eligibility.ts";
import { lineQty, type LineChoice } from "../../recipes/expand.ts";
import { DEFAULT_ROLE_SCALE, type ScalableRole } from "../../recipes/types.ts";
import type { LpConstraint, LpModel } from "../lp.ts";
import type { PackOffer } from "../priceBook.ts";
import { CHEAP_PROTEIN_IDS, type LinearRule, type Metric, type RuleSet } from "../rules/ruleSet.ts";
import { DAYS, SLOTS, type Day, type Slot } from "../types.ts";

export type ModelMode = "elastic" | "strict" | "safety_only";

/** Same `group` = cooked once (batch): the meals share their scale variables. */
export interface PlannedMeal {
  day: Day;
  slot: Slot;
  recipe: ResolvedRecipe;
  choice: LineChoice;
  group: string;
}

export interface BuildModelInput {
  meals: PlannedMeal[];
  rules: RuleSet;
  catalog: Catalog;
  /** Pack offer per food id (PriceBook.packOffer); every food on the menu needs one. */
  offers: ReadonlyMap<string, PackOffer>;
  /** Portions bought per user portion (1 + others·2000/userKcal). */
  householdFactor: number;
  /** Weekly budget in COP; null = no budget row (diagnosis solves). */
  budgetCop: number | null;
  mode: ModelMode;
}

export interface SlackInfo {
  rule: LinearRule;
  day?: Day;
  slot?: Slot;
  sense: "min" | "max";
}

export interface BuiltModel {
  model: LpModel;
  /** Slack variable name → the rule instance and bound it relaxes. */
  slacks: ReadonlyMap<string, SlackInfo>;
  /** Name of a scale variable; absent from the model when the group's recipe has no line with that role. */
  scaleVar(group: string, role: ScalableRole): string;
  /** Name of a pack variable; absent from the model when the food is not on the menu. */
  packVar(foodId: string): string;
}

/** Objective cost per unit of relative slack, by rule level. */
export const PENALTY: Readonly<Record<2 | 3 | 4 | 5, number>> = Object.freeze({ 2: 1e6, 3: 1e4, 4: 1e3, 5: 1e2 });

const OBJECTIVE = "cost";
const BUDGET_ROW = "budget";
const NONE = "-";
const MODES: ReadonlySet<string> = new Set<ModelMode>(["elastic", "strict", "safety_only"]);
const SAFE_GROUP = /^[a-z0-9_.-]{1,64}$/;
const SAFE_ID = /^[a-z0-9_]{1,64}$/;

const scaleVarName = (group: string, role: ScalableRole): string => `x|${group}|${role}`;
const packVarName = (foodId: string): string => `p|${foodId}`;
const packRowName = (foodId: string): string => `pack|${foodId}`;

type FoodMetric = Exclude<Metric, "dayKcal">;
type PerUnit = Readonly<Record<FoodMetric, number>>;

/** One line of one meal: `amount` units of `food` per unit of `variable` (null = a fixed amount). */
interface Term {
  variable: string | null;
  food: string;
  amount: number;
  perUnit: PerUnit;
}

interface MealTerms {
  meal: PlannedMeal;
  terms: Term[];
}

/** Σ coef·variable + constant. */
interface Expr {
  coefs: Map<string, number>;
  constant: number;
}

const fail = (message: string): never => {
  throw new RangeError(`buildModel: ${message}`);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// ---------------------------------------------------------------------------
// Validation

function validateScalars(input: BuildModelInput): void {
  if (!MODES.has(input.mode)) fail("unknown mode");
  if (!isFiniteNumber(input.householdFactor) || input.householdFactor <= 0) fail("householdFactor must be a positive number");
  if (input.budgetCop !== null && (!isFiniteNumber(input.budgetCop) || input.budgetCop < 0)) {
    fail("budgetCop must be null or a non-negative number");
  }
  if (!Array.isArray(input.meals) || input.meals.length === 0) fail("no meals");
}

function validateRules(rules: RuleSet): void {
  for (const rule of rules.linear) {
    const bounds = [rule.min, rule.max].filter((value) => value !== undefined);
    if (
      !SAFE_ID.test(rule.code) ||
      !Object.values(rule.terms).every(isFiniteNumber) ||
      bounds.length === 0 ||
      !bounds.every(isFiniteNumber) ||
      !(isFiniteNumber(rule.slackScale) && rule.slackScale > 0)
    ) {
      fail(`invalid rule ${String(rule.code)}`);
    }
  }
}

/** Meals in day and slot order; rejects unknown days, slots, unsafe groups and duplicates. */
function sortedMeals(meals: readonly PlannedMeal[]): PlannedMeal[] {
  const seen = new Set<string>();

  for (const meal of meals) {
    if (!DAYS.includes(meal.day) || !SLOTS.includes(meal.slot)) fail("unknown day or slot");
    if (typeof meal.group !== "string" || !SAFE_GROUP.test(meal.group)) fail("unsafe group name");
    const key = `${meal.day}.${meal.slot}`;
    if (seen.has(key)) fail(`duplicate meal ${key}`);
    seen.add(key);
  }

  const order = (meal: PlannedMeal): number => DAYS.indexOf(meal.day) * SLOTS.length + SLOTS.indexOf(meal.slot);
  return [...meals].sort((a, b) => order(a) - order(b));
}

function scaleRange(recipe: ResolvedRecipe, role: ScalableRole): readonly [number, number] {
  const range = recipe.scale?.[role] ?? DEFAULT_ROLE_SCALE[role];
  const [min, max] = range;
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || min < 0 || min > max) fail(`invalid scale for ${role}`);
  return range;
}

// ---------------------------------------------------------------------------
// Foods

function foodPerUnit(catalog: Catalog, cache: Map<string, PerUnit>, food: string): PerUnit {
  const cached = cache.get(food);
  if (cached) return cached;

  if (!SAFE_ID.test(food)) fail("unsafe food id");
  const ingredient = catalog.get(food) ?? fail(`unknown food ${food}`);
  const micro = microOf(ingredient, 1) ?? fail(`food without micro-nutrients ${food}`);
  const { kcal, protein, carbs, fat } = nutritionOf(ingredient, 1);
  const perUnit: PerUnit = {
    kcal,
    protein,
    carbs,
    fat,
    satFat: micro.satFatG,
    freeSugars: micro.freeSugarsG,
    fiber: micro.fiberG,
    sodium: micro.sodiumMg,
    fruitVeg: micro.fruitVegG,
    cheapProtein: CHEAP_PROTEIN_IDS.has(food) ? protein : 0,
  };
  if (!Object.values(perUnit).every(isFiniteNumber)) fail(`invalid nutrition for ${food}`);
  cache.set(food, perUnit);
  return perUnit;
}

/** The food each line uses: the choice, else the line's own food. */
function chosenFoods(meal: PlannedMeal): string[] {
  return meal.recipe.lines.map((line, index) => meal.choice[index] ?? line.food);
}

function mealTerms(meal: PlannedMeal, catalog: Catalog, cache: Map<string, PerUnit>): Term[] {
  const foods = chosenFoods(meal);

  return meal.recipe.lines.map((line, index) => {
    const food = foods[index];
    let amount = 0;
    try {
      amount = lineQty(meal.recipe, index, food);
    } catch {
      fail(`line ${index} of a ${meal.slot} has no option ${food}`);
    }
    if (!isFiniteNumber(amount) || amount < 0) fail("invalid line quantity");

    return {
      variable: line.role === "fixed" ? null : scaleVarName(meal.group, line.role),
      food,
      amount,
      perUnit: foodPerUnit(catalog, cache, food),
    };
  });
}

/** Meals of one group must be the same dish with the same foods. */
function checkGroups(meals: readonly PlannedMeal[]): void {
  const first = new Map<string, { recipe: string; foods: string }>();

  for (const meal of meals) {
    const signature = { recipe: meal.recipe.id, foods: chosenFoods(meal).join(",") };
    const known = first.get(meal.group);
    if (!known) first.set(meal.group, signature);
    else if (known.recipe !== signature.recipe || known.foods !== signature.foods) fail(`group ${meal.group} mixes dishes`);
  }
}

// ---------------------------------------------------------------------------
// Expressions

function addTo(expr: Expr, variable: string | null, value: number): void {
  if (value === 0) return;
  if (variable === null) expr.constant += value;
  else expr.coefs.set(variable, (expr.coefs.get(variable) ?? 0) + value);
}

/** Σ coef·metric over `meals`; `dayKcal` is the kcal of `dayMeals`. */
function ruleExpr(rule: LinearRule, meals: readonly MealTerms[], dayMeals: readonly MealTerms[]): Expr {
  const expr: Expr = { coefs: new Map(), constant: 0 };

  for (const [metric, coef] of Object.entries(rule.terms) as [Metric, number][]) {
    const source = metric === "dayKcal" ? dayMeals : meals;
    const measured: FoodMetric = metric === "dayKcal" ? "kcal" : metric;
    for (const { terms } of source) {
      for (const term of terms) addTo(expr, term.variable, coef * term.amount * term.perUnit[measured]);
    }
  }
  return expr;
}

/** A rule applied to one day, one meal or the whole week. */
interface RuleInstance {
  day?: Day;
  slot?: Slot;
  meals: MealTerms[];
  dayMeals: MealTerms[];
}

function instancesOf(rule: LinearRule, byDay: ReadonlyMap<Day, MealTerms[]>, all: MealTerms[]): RuleInstance[] {
  if (rule.scope === "week") return [{ meals: all, dayMeals: all }];

  const instances: RuleInstance[] = [];
  for (const [day, dayMeals] of byDay) {
    if (rule.scope === "day") {
      instances.push({ day, meals: dayMeals, dayMeals });
      continue;
    }
    const slots = rule.slots ?? SLOTS;
    for (const entry of dayMeals) {
      if (slots.includes(entry.meal.slot)) instances.push({ day, slot: entry.meal.slot, meals: [entry], dayMeals });
    }
  }
  return instances;
}

type Treatment = "hard" | "elastic" | "drop";

function treatmentOf(level: LinearRule["level"], mode: ModelMode): Treatment {
  if (level === 1) return "hard";
  if (mode === "safety_only") return "drop";
  if (mode === "strict" && level < 5) return "hard";
  return "elastic";
}

// ---------------------------------------------------------------------------
// Builder

export function buildModel(input: BuildModelInput): BuiltModel {
  validateScalars(input);
  validateRules(input.rules);
  const meals = sortedMeals(input.meals);
  checkGroups(meals);

  const { householdFactor, budgetCop, offers } = input;
  const constraints: Record<string, LpConstraint> = {};
  const variables: Record<string, Record<string, number>> = {};
  const slacks = new Map<string, SlackInfo>();
  const coef = (variable: string, row: string, value: number): void => {
    const coefs = (variables[variable] ??= {});
    coefs[row] = (coefs[row] ?? 0) + value;
  };

  // Scale variables and their bounds.
  for (const meal of meals) {
    for (const line of meal.recipe.lines) {
      if (line.role === "fixed") continue;
      const name = scaleVarName(meal.group, line.role);
      if (variables[name]) continue;
      const [min, max] = scaleRange(meal.recipe, line.role);
      constraints[name] = { min, max };
      coef(name, name, 1);
    }
  }

  // Terms per meal, and meals per day (in day order).
  const perUnitCache = new Map<string, PerUnit>();
  const all: MealTerms[] = meals.map((meal) => ({ meal, terms: mealTerms(meal, input.catalog, perUnitCache) }));
  const byDay = new Map<Day, MealTerms[]>();
  for (const entry of all) byDay.set(entry.meal.day, [...(byDay.get(entry.meal.day) ?? []), entry]);

  // Packs: the household's portions of every food on the menu.
  const need = new Map<string, Expr>();
  for (const { terms } of all) {
    for (const term of terms) {
      const expr = need.get(term.food) ?? { coefs: new Map(), constant: 0 };
      addTo(expr, term.variable, householdFactor * term.amount);
      need.set(term.food, expr);
    }
  }
  for (const [food, expr] of need) {
    const offer = offers.get(food) ?? fail(`no pack offer for ${food}`);
    if (!isFiniteNumber(offer.packSize) || offer.packSize <= 0) fail(`invalid pack size for ${food}`);
    if (!isFiniteNumber(offer.packPriceCop) || offer.packPriceCop < 0) fail(`invalid pack price for ${food}`);

    const row = packRowName(food);
    const pack = packVarName(food);
    constraints[row] = { min: expr.constant };
    for (const [variable, value] of expr.coefs) coef(variable, row, -value);
    variables[pack] = { [OBJECTIVE]: offer.packPriceCop / 1000, [row]: offer.packSize };
    if (budgetCop !== null) variables[pack][BUDGET_ROW] = offer.packPriceCop;
  }
  if (budgetCop !== null) constraints[BUDGET_ROW] = { max: budgetCop };

  // Rules.
  for (const rule of input.rules.linear) {
    const treatment = treatmentOf(rule.level, input.mode);
    if (treatment === "drop") continue;

    for (const instance of instancesOf(rule, byDay, all)) {
      const suffix = `${rule.code}|${instance.day ?? NONE}|${instance.slot ?? NONE}`;
      const row = `r|${suffix}`;
      const expr = ruleExpr(rule, instance.meals, instance.dayMeals);
      const bounds: LpConstraint = {};
      if (rule.min !== undefined) bounds.min = rule.min - expr.constant;
      if (rule.max !== undefined) bounds.max = rule.max - expr.constant;
      constraints[row] = bounds;
      for (const [variable, value] of expr.coefs) coef(variable, row, value);

      if (treatment !== "elastic") continue;
      const level = rule.level as 2 | 3 | 4 | 5;
      const sides = (["min", "max"] as const).filter((side) => rule[side] !== undefined);
      for (const sense of sides) {
        const slack = sides.length === 2 ? `s|${suffix}|${sense}` : `s|${suffix}`;
        variables[slack] = { [OBJECTIVE]: PENALTY[level], [row]: sense === "min" ? rule.slackScale : -rule.slackScale };
        slacks.set(slack, {
          rule,
          ...(instance.day ? { day: instance.day } : {}),
          ...(instance.slot ? { slot: instance.slot } : {}),
          sense,
        });
      }
    }
  }

  return {
    model: { optimize: OBJECTIVE, opType: "min", constraints, variables },
    slacks,
    scaleVar: scaleVarName,
    packVar: packVarName,
  };
}
