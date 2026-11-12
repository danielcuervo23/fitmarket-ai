/**
 * Optimizer solve ("el contador", spec section 6.4): the cheapest week of
 * portions for the recipes the AI picked, inside the budget and every safety
 * rule, and a diagnosis of what clashes when the goals cannot all be met.
 *
 * - Pure: no I/O besides the injectable `log`; the clock is injectable (`now`).
 * - One CPU budget is shared by every solve of the request: each solve gets
 *   `min(cpu.left(), SOLVE_TIME_LIMIT_MS)` and nothing new starts once it is
 *   spent (`error: "cpu_exhausted"`, best result so far).
 * - Alternatives come only from `ResolvedRecipe.lines` (already restricted
 *   and soak-safe by eligibility); the raw library is never consulted.
 * - Slacks are read through `BuiltModel.slacks`, never by parsing names.
 * - After rounding (whole packs, `roundQty`) the week is checked again
 *   against level 1 and the budget; a miss tightens the model and solves
 *   again, so a plan above budget or outside safety is never returned.
 */

import { gramsOf, microOf, nutritionOf, type Catalog } from "../../catalog.ts";
import { logEvent } from "../../log.ts";
import { needsSoaking, soakFoodsOf, type ResolvedRecipe } from "../../recipes/eligibility.ts";
import { expandMeal, primaryChoice, type LineChoice, type RoleScales } from "../../recipes/expand.ts";
import {
  DEFAULT_ROLE_SCALE,
  SCALABLE_ROLES,
  type CookingPrefs,
  type RecipeWeek,
  type ScalableRole,
} from "../../recipes/types.ts";
import { roundQty, weekCost } from "../build.ts";
import { MAX_BATCH_DAYS } from "../compose.ts";
import { LP_DEFAULT_TIME_LIMIT_MS, solveLp, type LpSolution } from "../lp.ts";
import type { PackOffer, PriceBook } from "../priceBook.ts";
import { evaluateWeek } from "../rules/evaluate.ts";
import {
  CHEAP_PROTEIN_IDS,
  type LinearRule,
  type Metric,
  type RuleCode,
  type RuleSet,
  type RuleUnit,
  type Shortfall,
} from "../rules/ruleSet.ts";
import { DAYS, SLOTS, type ComposedMeal, type ComposedWeek, type Day, type Slot } from "../types.ts";
import { PENALTY, buildModel, type BuiltModel, type ModelMode, type PlannedMeal } from "./model.ts";

export type OptimizeStatus = "optimal" | "relaxed" | "over_budget" | "infeasible";
/** Why the optimizer stopped early: the CPU budget ran out, or the solver is unusable. */
export type OptimizeError = "cpu_exhausted" | "solver_error";

export interface CpuBudget {
  left(): number;
  spend(ms: number): void;
}

export const OPTIMIZER_CPU_BUDGET_MS = 900;
/** Longest a single solve may run, also when more budget is left. */
export const SOLVE_TIME_LIMIT_MS = LP_DEFAULT_TIME_LIMIT_MS;
/** Re-solves after rounding broke the budget or a level-1 rule. */
export const MAX_ROUNDING_RETRIES = 2;

/** Below this an LP value is solver noise. */
const EPS = 1e-6;

export function createCpuBudget(limitMs: number = OPTIMIZER_CPU_BUDGET_MS): CpuBudget {
  if (!Number.isFinite(limitMs) || limitMs < 0) throw new RangeError("createCpuBudget: limit must be a non-negative number");
  let spent = 0;
  return {
    left: () => Math.max(0, limitMs - spent),
    spend: (ms) => {
      if (Number.isFinite(ms) && ms > 0) spent += ms;
    },
  };
}

/**
 * "What to change" for one rule the optimizer had to relax (levels 2–4 only):
 * `change` moves the bound in the rule's display unit (negative lowers a
 * minimum, positive raises a maximum); `slack` is the largest relative slack
 * among the rule's days or meals.
 */
export interface Relaxation {
  rule: RuleCode;
  level: 2 | 3 | 4;
  sense: "min" | "max";
  unit: RuleUnit;
  slack: number;
  change: number;
}

export type OptimizerLog = (event: string, fields: Record<string, string | number | boolean>) => void;

export interface OptimizeInput {
  recipeWeek: RecipeWeek;
  /** Resolved (eligible) recipes by id: the only source of foods and alternatives. */
  recipes: ReadonlyMap<string, ResolvedRecipe>;
  rules: RuleSet;
  catalog: Catalog;
  prices: PriceBook;
  stores: string[];
  householdFactor: number;
  budgetCop: number;
  cooking: CookingPrefs;
  /** Shared by every optimizer call of the request. */
  cpu: CpuBudget;
  /** Spend extra solves on `requiredBudgetCop`. */
  diagnose: boolean;
  /** Millisecond clock; default performance.now. */
  now?: () => number;
  /** Default `logEvent`; events carry codes and counts only. */
  log?: OptimizerLog;
}

export interface OptimizeResult {
  status: OptimizeStatus;
  week: ComposedWeek | null;
  costCop: number | null;
  /** Levels 2–4 of the rounded week (level 5 is never reported). */
  shortfalls: Shortfall[];
  /** Status `relaxed` only: how far each relaxed rule had to move inside the budget. */
  relaxations: Relaxation[];
  /**
   * Rounded up to 1000. over_budget: what the cheapest safe week costs. relaxed: a budget
   * that works (the strict week with these foods meets every rule after rounding), not
   * necessarily the minimum; null when no budget fixes the shortfalls.
   */
  requiredBudgetCop: number | null;
  solves: number;
  cpuMs: number;
  /** Read before `status`: when set, the run stopped early and `infeasible` means "no week", not proven. */
  error?: OptimizeError;
}

// ---------------------------------------------------------------------------
// Batch groups

const WEEKEND: ReadonlySet<Day> = new Set<Day>(["sab", "dom"]);
const isWeekday = (day: Day): boolean => !WEEKEND.has(day);
const mealKey = (day: Day, slot: Slot): string => `${day}.${slot}`;

/** Weekend-only dish, or one that cooks a dried legume that soaks overnight. */
const isWeekendDish = (recipe: ResolvedRecipe): boolean => recipe.weekendOnly || soakFoodsOf(recipe).length > 0;

/**
 * "day.slot" → group. With batch cooking, consecutive days of the same batch
 * recipe in the same slot share a group (cooked once), up to
 * min(keepsDays, MAX_BATCH_DAYS) days; a weekend dish only groups weekend
 * days. Group names are "day.slot" keys only, never recipe ids.
 */
export function batchGroups(
  week: RecipeWeek,
  recipes: ReadonlyMap<string, ResolvedRecipe>,
  batch: boolean,
): Map<string, string> {
  const groups = new Map<string, string>();

  for (const slot of SLOTS) {
    let start: Day | null = null;
    let length = 0;
    let previous: string | null = null;

    for (const day of DAYS) {
      const key = mealKey(day, slot);
      const id = week[day][slot];
      const recipe = recipes.get(id);
      const joins =
        batch &&
        recipe !== undefined &&
        recipe.batch.ok &&
        start !== null &&
        id === previous &&
        length < Math.min(recipe.batch.keepsDays, MAX_BATCH_DAYS) &&
        !(isWeekendDish(recipe) && (isWeekday(day) || isWeekday(start)));

      if (joins && start !== null) {
        groups.set(key, mealKey(start, slot));
        length += 1;
      } else {
        groups.set(key, key);
        start = day;
        length = 1;
      }
      previous = id;
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Validation

const fail = (message: string): never => {
  throw new RangeError(`optimizeWeek: ${message}`);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

interface Slotted {
  day: Day;
  slot: Slot;
  recipe: ResolvedRecipe;
}

function validatedMeals(input: OptimizeInput): Slotted[] {
  if (!isFiniteNumber(input.budgetCop) || input.budgetCop < 0) fail("budgetCop must be a non-negative number");
  if (!isFiniteNumber(input.householdFactor) || input.householdFactor <= 0) fail("householdFactor must be positive");
  if (!Array.isArray(input.stores) || !input.stores.every((store) => typeof store === "string")) fail("stores must be a list");
  if (typeof input.cpu?.left !== "function" || typeof input.cpu?.spend !== "function") fail("cpu budget missing");
  if (typeof input.recipeWeek !== "object" || input.recipeWeek === null) fail("recipeWeek missing");
  if (!(input.recipes instanceof Map)) fail("recipes must be a Map");
  const rules = input.rules;
  if (
    typeof rules !== "object" || rules === null ||
    !Array.isArray(rules.linear) || !Array.isArray(rules.structural) ||
    !isFiniteNumber(rules.targets?.weightKg) || rules.targets.weightKg <= 0
  ) {
    fail("invalid rule set");
  }
  if (typeof input.catalog?.get !== "function") fail("invalid catalog");
  if (typeof input.prices?.packOffer !== "function" || typeof input.prices?.quote !== "function") fail("invalid price book");

  const meals: Slotted[] = [];
  for (const day of DAYS) {
    const dayMeals = input.recipeWeek[day];
    if (typeof dayMeals !== "object" || dayMeals === null) fail(`no meals on ${day}`);
    for (const slot of SLOTS) {
      const id = dayMeals[slot];
      const recipe = (typeof id === "string" ? input.recipes.get(id) : undefined) ?? fail(`unknown recipe at ${day}.${slot}`);
      if (!recipe.slots.includes(slot)) fail(`recipe does not fit ${day}.${slot}`);
      if (isWeekday(day) && isWeekendDish(recipe)) fail(`weekend-only recipe on ${day}`);
      meals.push({ day, slot, recipe });
    }
  }
  return meals;
}

// ---------------------------------------------------------------------------
// Run state: CPU accounting and solves

interface Run {
  input: OptimizeInput;
  now: () => number;
  mark: number;
  spentMs: number;
  solves: number;
  stop: OptimizeError | null;
  offers: Map<string, PackOffer>;
}

/** Charges the time since the last tick to the shared CPU budget. */
function tick(run: Run): void {
  const at = run.now();
  const elapsed = at - run.mark;
  run.mark = at;
  if (elapsed > 0) {
    run.input.cpu.spend(elapsed);
    run.spentMs += elapsed;
  }
}

/** One LP solve inside the budget; null = no usable result (infeasible, time limit or stopped). */
function solve(run: Run, built: BuiltModel): LpSolution | null {
  tick(run);
  if (run.stop !== null) return null;
  if (!(run.input.cpu.left() > 0)) {
    run.stop = "cpu_exhausted";
    return null;
  }

  const solution = solveLp(built.model, run.now, { timeLimitMs: Math.min(run.input.cpu.left(), SOLVE_TIME_LIMIT_MS) });
  run.solves += 1;
  tick(run);

  if (solution.error === "time_limit") {
    // No verdict: the model may well be feasible. Treat it as the budget running out,
    // so nothing downstream reads it as "infeasible".
    run.stop = "cpu_exhausted";
    return null;
  }
  if (solution.error !== undefined) {
    run.stop = "solver_error";
    return null;
  }
  return solution.feasible && solution.bounded ? solution : null;
}

// ---------------------------------------------------------------------------
// Choices, meals and offers

/** Line choice per group. */
type Choices = ReadonlyMap<string, LineChoice>;

interface Plan {
  meals: Slotted[];
  groups: ReadonlyMap<string, string>;
}

const groupOf = (plan: Plan, day: Day, slot: Slot): string => plan.groups.get(mealKey(day, slot)) ?? mealKey(day, slot);

function plannedMeals(plan: Plan, choices: Choices): PlannedMeal[] {
  return plan.meals.map(({ day, slot, recipe }) => {
    const group = groupOf(plan, day, slot);
    return { day, slot, recipe, group, choice: choices.get(group) ?? primaryChoice(recipe) };
  });
}

/** The food's pack offer, asked once per call. */
function offerOf(run: Run, food: string): PackOffer {
  const cached = run.offers.get(food);
  if (cached) return cached;
  const ingredient = run.input.catalog.get(food) ?? fail("unknown food on the menu");
  const offer = run.input.prices.packOffer(ingredient, run.input.stores);
  run.offers.set(food, offer);
  return offer;
}

function offersFor(run: Run, meals: readonly PlannedMeal[]): Map<string, PackOffer> {
  const offers = new Map<string, PackOffer>();
  for (const meal of meals) {
    for (const [index, line] of meal.recipe.lines.entries()) {
      const food = meal.choice[index] ?? line.food;
      offers.set(food, offerOf(run, food));
    }
  }
  return offers;
}

/** The first meal of each group, and whether any meal of the group is on a weekday. */
function groupHeads(plan: Plan): Map<string, { recipe: ResolvedRecipe; weekday: boolean }> {
  const heads = new Map<string, { recipe: ResolvedRecipe; weekday: boolean }>();
  for (const { day, slot, recipe } of plan.meals) {
    const group = groupOf(plan, day, slot);
    const head = heads.get(group) ?? { recipe, weekday: false };
    head.weekday ||= isWeekday(day);
    heads.set(group, head);
  }
  return heads;
}

function primaryChoices(plan: Plan): Choices {
  return new Map([...groupHeads(plan)].map(([group, { recipe }]) => [group, primaryChoice(recipe)]));
}

/**
 * COP per unit of what the role is for: g protein (protein), kcal (carb,
 * fat) or grams (veg). Infinity when the food gives none of it.
 */
function costPerUse(run: Run, food: string, role: ScalableRole): number {
  const ingredient = run.input.catalog.get(food) ?? fail("unknown food on the menu");
  const offer = offerOf(run, food);
  const nutrition = nutritionOf(ingredient, 1);
  const per = role === "protein" ? nutrition.protein : role === "veg" ? gramsOf(ingredient, 1) : nutrition.kcal;
  return per > 0 ? offer.packPriceCop / offer.packSize / per : Infinity;
}

/**
 * The cheapest option of every scalable line, among the line's own food and
 * its alternatives in `ResolvedRecipe.lines` (eligibility already removed
 * forbidden, unsold and weekday soak foods); a soak food is still skipped on
 * any group that touches a weekday. Ties keep the line's own food.
 */
function cheapestChoices(run: Run, plan: Plan): Choices {
  const choices = new Map<string, LineChoice>();
  for (const [group, { recipe, weekday }] of groupHeads(plan)) {
    const choice = primaryChoice(recipe);
    for (const [index, line] of recipe.lines.entries()) {
      if (line.role === "fixed" || !line.alternatives?.length) continue;
      const role = line.role;
      let best = line.food;
      let bestCost = costPerUse(run, line.food, role);
      for (const { food } of line.alternatives) {
        if (weekday && needsSoaking(food)) continue;
        const cost = costPerUse(run, food, role);
        if (cost < bestCost) {
          best = food;
          bestCost = cost;
        }
      }
      choice[index] = best;
    }
    choices.set(group, choice);
  }
  return choices;
}

const sameChoices = (a: Choices, b: Choices): boolean =>
  [...a].every(([group, choice]) => JSON.stringify(choice) === JSON.stringify(b.get(group)));

// ---------------------------------------------------------------------------
// Rounding

function scaleRange(recipe: ResolvedRecipe, role: ScalableRole): readonly [number, number] {
  return recipe.scale?.[role] ?? DEFAULT_ROLE_SCALE[role];
}

interface Rounded {
  week: ComposedWeek;
  /** Same week before `roundQty`. */
  exact: ComposedWeek;
}

function roundedWeek(run: Run, meals: readonly PlannedMeal[], built: BuiltModel, values: Record<string, number>): Rounded {
  const { catalog } = run.input;
  const week = {} as Record<Day, Record<Slot, ComposedMeal>>;
  const exact = {} as Record<Day, Record<Slot, ComposedMeal>>;

  for (const meal of meals) {
    const scales: RoleScales = {};
    for (const role of SCALABLE_ROLES) {
      const value = values[built.scaleVar(meal.group, role)];
      if (value === undefined) continue;
      const [min, max] = scaleRange(meal.recipe, role);
      scales[role] = Math.min(max, Math.max(min, value));
    }
    const expanded = expandMeal(meal.recipe, meal.choice, scales);
    const items = expanded.items.map((item) => {
      const ingredient = catalog.get(item.id) ?? fail("unknown food on the menu");
      return { id: item.id, qty: roundQty(ingredient, item.qty) };
    });
    (exact[meal.day] ??= {} as Record<Slot, ComposedMeal>)[meal.slot] = expanded;
    (week[meal.day] ??= {} as Record<Slot, ComposedMeal>)[meal.slot] = { ...expanded, items };
  }
  return { week, exact };
}

// ---------------------------------------------------------------------------
// Rule measurement (for level-1 tightening)

type Values = Record<Exclude<Metric, "dayKcal">, number>;

function mealValues(meal: ComposedMeal, catalog: Catalog): Values {
  const values: Values = {
    kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, freeSugars: 0, fiber: 0, sodium: 0, fruitVeg: 0, cheapProtein: 0,
  };
  for (const item of meal.items) {
    const ingredient = catalog.get(item.id);
    if (!ingredient || item.qty <= 0) continue;
    const n = nutritionOf(ingredient, item.qty);
    values.kcal += n.kcal;
    values.protein += n.protein;
    values.carbs += n.carbs;
    values.fat += n.fat;
    if (CHEAP_PROTEIN_IDS.has(item.id)) values.cheapProtein += n.protein;
    const micro = microOf(ingredient, item.qty);
    if (!micro) continue;
    values.satFat += micro.satFatG;
    values.freeSugars += micro.freeSugarsG;
    values.fiber += micro.fiberG;
    values.sodium += micro.sodiumMg;
    values.fruitVeg += micro.fruitVegG;
  }
  return values;
}

function addValues(parts: readonly Values[]): Values {
  const total = { ...parts[0] };
  for (const part of parts.slice(1)) {
    for (const key of Object.keys(total) as (keyof Values)[]) total[key] += part[key];
  }
  return total;
}

/** Σ coef·metric of the rule for each of its days, meals or the week. */
function ruleSums(rule: LinearRule, week: ComposedWeek, catalog: Catalog): number[] {
  const perDay = DAYS.map((day) => SLOTS.map((slot) => ({ slot, values: mealValues(week[day][slot], catalog) })));
  const sum = (values: Values, dayKcal: number): number =>
    (Object.entries(rule.terms) as [Metric, number][]).reduce(
      (acc, [metric, coef]) => acc + coef * (metric === "dayKcal" ? dayKcal : values[metric]),
      0,
    );

  const days = perDay.map((meals) => addValues(meals.map((meal) => meal.values)));
  if (rule.scope === "week") {
    const total = addValues(days);
    return [sum(total, total.kcal)];
  }
  if (rule.scope === "day") return days.map((day) => sum(day, day.kcal));
  const slots = rule.slots ?? SLOTS;
  return perDay.flatMap((meals, i) =>
    meals.filter((meal) => slots.includes(meal.slot)).map((meal) => sum(meal.values, days[i].kcal)));
}

const level1Of = (rules: RuleSet): RuleSet => ({ ...rules, linear: rules.linear.filter((r) => r.level === 1), structural: [] });

/**
 * Moves inwards, by that rule's largest rounding error, every bound of a rule
 * in `codes` that the rounded week breaks (measured against the original
 * rules; `current` are the possibly already tightened model rules).
 * null: nothing to tighten; "impossible": the bounds would cross.
 */
function tightenRules(
  current: RuleSet,
  original: RuleSet,
  rounded: Rounded,
  catalog: Catalog,
  codes: ReadonlySet<RuleCode>,
): RuleSet | null | "impossible" {
  let changed = false;
  let impossible = false;
  const linear = current.linear.map((rule, index) => {
    const base = original.linear[index];
    if (base === undefined || !codes.has(base.code)) return rule;
    const after = ruleSums(base, rounded.week, catalog);
    const before = ruleSums(base, rounded.exact, catalog);
    const error = Math.max(0, ...after.map((value, i) => Math.abs(value - before[i])));
    const { min, max } = base;
    const missedMin = min !== undefined && after.some((value) => value < min);
    const missedMax = max !== undefined && after.some((value) => value > max);
    if (!missedMin && !missedMax) return rule;

    changed = true;
    const next = { ...rule };
    if (missedMin && next.min !== undefined) next.min += error + EPS;
    if (missedMax && next.max !== undefined) next.max -= error + EPS;
    if (next.min !== undefined && next.max !== undefined && next.min > next.max) impossible = true;
    return next;
  });
  if (impossible) return "impossible";
  return changed ? { ...current, linear } : null;
}

/** Rules (levels 2–4) the LP met with no slack but the rounded week misses. */
function roundingMisses(built: BuiltModel, values: Record<string, number>, shortfalls: readonly Shortfall[]): Set<RuleCode> {
  const relaxed = new Set<RuleCode>();
  for (const [name, info] of built.slacks) if ((values[name] ?? 0) > EPS) relaxed.add(info.rule.code);
  const linear = new Set<RuleCode>([...built.slacks.values()].map((info) => info.rule.code));
  return new Set(shortfalls.map((s) => s.rule).filter((code) => linear.has(code) && !relaxed.has(code)));
}

// ---------------------------------------------------------------------------
// One attempt: solve, round, re-check, tighten

interface Candidate {
  choices: Choices;
  built: BuiltModel;
  values: Record<string, number>;
  week: ComposedWeek;
  costCop: number;
  /** Σ penalty·slack of the LP solution (levels 2–5). */
  penalty: number;
  /** What the LP pays for packs (fractional packs), in COP. */
  lpCostCop: number;
  shortfalls: Shortfall[];
}

/**
 * Solve, round to what the user buys, and re-check: a real total above
 * `budgetCop` lowers the budget row by the overshoot, a level-1 miss tightens
 * that rule; at most MAX_ROUNDING_RETRIES times. `startCap` is the first
 * budget row (default `budgetCop`).
 */
function attempt(
  run: Run,
  plan: Plan,
  choices: Choices,
  mode: ModelMode,
  budgetCop: number | null,
  startCap: number | null = budgetCop,
): Candidate | null {
  const { input } = run;
  const meals = plannedMeals(plan, choices);
  const offers = offersFor(run, meals);
  let cap = startCap;
  let rules = input.rules;
  let kept: Candidate | null = null;
  const safety = level1Of(input.rules);
  const safetyCodes = new Set(safety.linear.map((rule) => rule.code));

  for (let round = 0; round <= MAX_ROUNDING_RETRIES; round++) {
    if (cap !== null && cap < 0) break;
    const built = buildModel({
      meals, rules, catalog: input.catalog, offers, householdFactor: input.householdFactor, budgetCop: cap, mode,
    });
    const solution = solve(run, built);
    if (solution === null) break;

    const rounded = roundedWeek(run, meals, built, solution.values);
    const costCop = weekCost(rounded.week, input.householdFactor, input.stores, input.catalog, input.prices);
    const overshoot = budgetCop === null ? 0 : costCop - budgetCop;
    const unsafe = evaluateWeek(rounded.week, safety, input.catalog).length > 0;

    if (overshoot <= 0 && !unsafe) {
      // A valid week. Rules the LP met but rounding broke get one more try, tightened.
      const penalty = penaltyOf(built, solution.values);
      const shortfalls = blockingShortfalls(rounded.week, input);
      kept = better(kept, {
        choices, built, values: solution.values, week: rounded.week, costCop, penalty, shortfalls,
        lpCostCop: Math.max(0, (solution.objective - penalty) * 1000),
      });
      const misses = roundingMisses(built, solution.values, shortfalls);
      const tightened = misses.size > 0 ? tightenRules(rules, input.rules, rounded, input.catalog, misses) : null;
      if (tightened === null || tightened === "impossible") break;
      rules = tightened;
      continue;
    }
    if (unsafe) {
      const tightened = tightenRules(rules, input.rules, rounded, input.catalog, safetyCodes);
      if (tightened === "impossible") break;
      if (tightened !== null) rules = tightened;
    }
    if (overshoot > 0 && cap !== null) cap -= overshoot;
  }
  return kept;
}

function penaltyOf(built: BuiltModel, values: Record<string, number>): number {
  let total = 0;
  for (const name of built.slacks.keys()) {
    const value = values[name] ?? 0;
    if (value > EPS) total += (built.model.variables[name]?.[built.model.optimize] ?? 0) * value;
  }
  return total;
}

function blockingShortfalls(week: ComposedWeek, input: OptimizeInput): Shortfall[] {
  return evaluateWeek(week, input.rules, input.catalog).filter((s) => s.level >= 2 && s.level <= 4);
}

// ---------------------------------------------------------------------------
// Diagnosis

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

/** Bound movement in the rule's display unit for a relative slack. */
function changeOf(rule: LinearRule, slack: number, weightKg: number): number {
  const unit = rule.display.unit;
  // Zero-bound share rules: slackScale is the day's kcal target, so the slack is a share of kcal.
  if (unit === "pct_kcal" || unit === "pct_protein") return slack * 100;
  const amount = slack * rule.slackScale;
  return unit === "g_per_kg" ? amount / weightKg : amount;
}

function relaxationsOf(candidate: Candidate, weightKg: number): Relaxation[] {
  const worst = new Map<string, Relaxation>();
  for (const [name, info] of candidate.built.slacks) {
    const value = candidate.values[name] ?? 0;
    const level = info.rule.level;
    if (value <= EPS || level < 2 || level > 4) continue;
    const key = `${info.rule.code}|${info.sense}`;
    if ((worst.get(key)?.slack ?? -1) >= value) continue;
    const change = changeOf(info.rule, value, weightKg);
    worst.set(key, {
      rule: info.rule.code,
      level: level as 2 | 3 | 4,
      sense: info.sense,
      unit: info.rule.display.unit,
      slack: value,
      change: info.sense === "min" ? -change : change,
    });
  }
  return [...worst.values()]
    .map((r) => ({ ...r, slack: round4(r.slack), change: round2(r.change) }))
    .sort((a, b) => a.level - b.level || a.rule.localeCompare(b.rule) || a.sense.localeCompare(b.sense));
}

// ---------------------------------------------------------------------------
// Choosing between attempts and pricing the diagnosis

/** No plan, a shortfall, or any LP slack left: worth trying the cheapest alternatives. */
const needsMore = (candidate: Candidate | null): boolean =>
  candidate === null || candidate.shortfalls.length > 0 || candidate.penalty > EPS;

/** Shortfalls weighted by the same per-level penalties as the model. */
const shortfallWeight = (candidate: Candidate): number =>
  candidate.shortfalls.reduce((sum, s) => sum + (PENALTY[s.level as 2 | 3 | 4] ?? 0), 0);

/** A plan first, then fewer weighted shortfalls, then less LP slack, then lower cost. */
function better(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (a === null || b === null) return a ?? b;
  const byShortfalls = shortfallWeight(a) - shortfallWeight(b);
  if (byShortfalls !== 0) return byShortfalls < 0 ? a : b;
  if (Math.abs(a.penalty - b.penalty) > EPS) return a.penalty < b.penalty ? a : b;
  return a.costCop <= b.costCop ? a : b;
}

const roundUpToThousand = (cop: number): number => Math.ceil(cop / 1000) * 1000;
const nextThousandAbove = (cop: number): number => Math.floor(cop / 1000) * 1000 + 1000;

/** The cheapest week that meets level 1, with no budget row (null: none at any price, or stopped). */
function cheapestSafe(run: Run, plan: Plan, choiceSets: readonly Choices[]): Candidate | null {
  let tried: Choices | null = null;
  for (const choices of choiceSets) {
    if (tried !== null && sameChoices(choices, tried)) continue;
    tried = choices;
    const candidate = attempt(run, plan, choices, "safety_only", null);
    if (candidate !== null) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entry point

export function optimizeWeek(input: OptimizeInput): OptimizeResult {
  const now = input.now ?? (() => performance.now());
  const log = input.log ?? logEvent;
  const run: Run = { input, now, mark: now(), spentMs: 0, solves: 0, stop: null, offers: new Map() };
  const meals = validatedMeals(input);
  const plan: Plan = { meals, groups: batchGroups(input.recipeWeek, input.recipes, input.cooking?.batch === true) };

  const primary = primaryChoices(plan);
  let best = attempt(run, plan, primary, "elastic", input.budgetCop);
  const cheapest = needsMore(best) ? cheapestChoices(run, plan) : primary;
  if (!sameChoices(cheapest, primary)) best = better(best, attempt(run, plan, cheapest, "elastic", input.budgetCop));
  // No elastic week survived rounding. The cheapest safe week (no budget row)
  // both rescues budgets it fits and prices the diagnosis when it does not.
  let safe: Candidate | null = null;
  if (best === null && run.stop === null) {
    safe = cheapestSafe(run, plan, [cheapest, primary]);
    if (safe !== null && safe.costCop <= input.budgetCop) {
      // Give the elastic LP only the money the safe week leaves over, so its packs round inside the budget.
      const cap = safe.lpCostCop + (input.budgetCop - safe.costCop);
      best = attempt(run, plan, safe.choices, "elastic", input.budgetCop, cap) ?? safe;
    }
  }

  let result: Omit<OptimizeResult, "solves" | "cpuMs">;
  if (best === null) {
    // Callers read `error` first: with it, "infeasible" only means "no week", nothing was proven.
    result = {
      status: run.stop !== null || safe === null ? "infeasible" : "over_budget",
      week: null,
      costCop: null,
      shortfalls: [],
      relaxations: [],
      requiredBudgetCop:
        input.diagnose && safe !== null
          ? Math.max(roundUpToThousand(safe.costCop), nextThousandAbove(input.budgetCop))
          : null,
    };
  } else {
    const relaxed = best.shortfalls.length > 0;
    // A budget that works (every rule met after rounding, with this week's foods), not
    // the minimum; null when the strict week still misses a rule (money is not the fix).
    const required = relaxed && input.diagnose ? attempt(run, plan, best.choices, "strict", null) : null;
    const requiredCop = required === null || required.shortfalls.length > 0 ? null : roundUpToThousand(required.costCop);
    result = {
      status: relaxed ? "relaxed" : "optimal",
      week: best.week,
      costCop: best.costCop,
      shortfalls: best.shortfalls,
      relaxations: relaxed ? relaxationsOf(best, input.rules.targets.weightKg) : [],
      requiredBudgetCop: requiredCop !== null && requiredCop > input.budgetCop ? requiredCop : null,
    };
  }

  tick(run);
  if (run.stop === "cpu_exhausted") log("optimizer_cpu_exhausted", { solves: run.solves });
  log("optimizer_result", { status: result.status, solves: run.solves, cpu_ms: Math.round(run.spentMs) });
  return {
    ...result,
    solves: run.solves,
    cpuMs: run.spentMs,
    ...(run.stop !== null ? { error: run.stop } : {}),
  };
}
