import { STATIC_CATALOG, nutritionOf, type Catalog } from "../catalog.ts";
import type { GenerationErrorCode } from "../errors.ts";
import { logEvent } from "../log.ts";
import type { BodyProfile } from "../nutrition.ts";
import type { ModelCall } from "../openai.ts";
import { eligibleRecipes, recipeCoverage, type ResolvedRecipe } from "../recipes/eligibility.ts";
import { RECIPES } from "../recipes/library.generated.ts";
import { DEFAULT_COOKING, DEFAULT_ROLE_SCALE, type CookingPrefs, type Recipe } from "../recipes/types.ts";
import { lineQty } from "../recipes/expand.ts";
import { assemblePlan, complianceFromShortfalls, type BuiltPlan, type PlanCompliance } from "./build.ts";
import {
  DEFAULT_MAX_MODEL_CALLS,
  DEFAULT_TIME_BUDGET_MS,
  MIN_COMPOSE_TIME_MS,
  withCallBudget,
  type GenerationLimits,
  type GenerationUsage,
} from "./callBudget.ts";
import { repairWeekendOnly } from "./compose.ts";
import { lpLoadError, prepareLp } from "./lp.ts";
import { PENALTY } from "./optimizer/model.ts";
import {
  createCpuBudget,
  optimizeWeek,
  type OptimizeInput,
  type OptimizeResult,
} from "./optimizer/optimize.ts";
import type { PriceBook } from "./priceBook.ts";
import { budgetTooLowFields, restrictionsTooStrictFields } from "./outcomeEvents.ts";
import { createAiRecipePicker, type RecipePicker } from "./recipePicker.ts";
import { allowedCatalog, buildRestrictionRules, isAllowed, type RestrictionRules } from "./restrictions.ts";
import { evaluateWeek } from "./rules/evaluate.ts";
import { buildRuleSet, isBlocker, type RuleSet, type Shortfall } from "./rules/ruleSet.ts";
import {
  buildTargets,
  householdFactor,
  toNutritionTargets,
  type GoalTargets,
  type HealthCondition,
} from "./rules/targets.ts";
import { STATIC_PRICE_BOOK } from "./stores.ts";
import { DAYS, SLOTS, type ComposedMeal, type ComposedWeek, type Day, type MealItem, type Slot } from "./types.ts";

export interface GenerateInput {
  weeklyBudgetCop: number;
  goals: string[];
  stores: string[];
  restrictions: string[];
  householdSize: number;
  profile: BodyProfile;
  /** Default DEFAULT_COOKING. */
  cooking?: CookingPrefs;
  /** Default [] (Plan 3 fills it). */
  health?: HealthCondition[];
  /**
   * "Quiero el plan igual": a week that misses level 2–5 rules is delivered
   * as a partial plan. Never relaxes restrictions, level 1 or the budget.
   */
  allowPartial?: boolean;
}

/** Why a plan could not be made, so the app can tell the user what to change. */
export interface FailureDiagnostics {
  /** Foods allowed after restrictions and stores. */
  availableFoods: number;
  totalFoods: number;
  /** One short code per rejected attempt or failed step. */
  reasons: string[];
  /** Weekday-usable recipes per meal (restrictions_too_strict). */
  availableRecipes?: Record<Slot, number>;
}

export interface BudgetOption {
  currentBudget: number;
  requiredBudget: number;
  recommendedIncrease: number;
}

interface FailureCommon {
  message: string;
  diagnostics?: FailureDiagnostics;
  budget?: BudgetOption;
}

/** goals_unreachable always carries the rules that clash and the "Quiero el plan igual" option. */
export type GenerateFailureError =
  | (FailureCommon & { code: GenerationErrorCode })
  | (FailureCommon & { code: "goals_unreachable"; conflicts: Shortfall[]; canForce: true });

/** The week of a goals_unreachable answer, kept so "Quiero el plan igual" can reuse it. */
export interface PartialWeek {
  week: ComposedWeek;
}

export interface GenerateFailure {
  error: GenerateFailureError;
  /** goals_unreachable only: the best week found, every level 1 rule and the budget met. */
  reusable?: PartialWeek;
  /** Our own failure before any OpenAI call (the solver did not load): give the try back. */
  refundable?: true;
}

export type GenerateOutcome = ({ plan: BuiltPlan } | GenerateFailure) & {
  /** Model calls made; absent when no call was needed (early checks). */
  usage?: GenerationUsage;
};

const MAX_ATTEMPTS = 3;
/**
 * Lowest weekly food budget per person worth trying (owner decision
 * 2026-11-12, from the Task 13 measurement: the cheapest week that only keeps
 * the safety rules cost 129 000-180 000 COP per person with the static price
 * book). Below it we answer at once, without a paid request. The web uses the
 * same value (src/lib/budgetSuggestion.ts, kept equal by a test).
 */
export const MIN_WEEKLY_BUDGET_PER_PERSON_COP = 130_000;

/** The optimizer ("el contador") behind an interface, so tests can observe or replace it. */
export interface WeekOptimizer {
  /** Loads the solver once per instance; false when it cannot be used. */
  prepare(): Promise<boolean>;
  /** Short code of the last failed load, safe to log. */
  loadError(): string | null;
  optimize(input: OptimizeInput): OptimizeResult;
}

const HIGHS_OPTIMIZER: WeekOptimizer = {
  prepare: () => prepareLp(),
  loadError: lpLoadError,
  optimize: optimizeWeek,
};

/** What the planner reads from outside; each field falls back to the built-in one. */
export interface PlannerDeps {
  catalog?: Catalog;
  prices?: PriceBook;
  /** Chooses the recipes of the week. Default: the AI, through the call budget. */
  picker?: RecipePicker;
  optimizer?: WeekOptimizer;
  /** Recipe library. Default: the generated library. */
  library?: readonly Recipe[];
}

const FAILED_MESSAGE = "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.";
const UNREACHABLE_MESSAGE = "Así como está, tu plan no cumple todas tus metas.";

/** Everything derived from the input that both generation and reuse need. Pure and cheap. */
interface Context {
  input: GenerateInput;
  catalog: Catalog;
  prices: PriceBook;
  cooking: CookingPrefs;
  restrictions: RestrictionRules;
  targets: GoalTargets;
  rules: RuleSet;
  eligible: Map<string, ResolvedRecipe>;
  eligibleList: ResolvedRecipe[];
  factor: number;
  availableFoods: number;
}

function contextOf(input: GenerateInput, deps: PlannerDeps): Context {
  const catalog = deps.catalog ?? STATIC_CATALOG;
  const prices = deps.prices ?? STATIC_PRICE_BOOK;
  const cooking = input.cooking ?? DEFAULT_COOKING;
  const restrictions = buildRestrictionRules(input.restrictions, catalog);
  const targets = buildTargets(input.profile, input.goals, input.health ?? []);
  const eligibleList = eligibleRecipes(deps.library ?? RECIPES, {
    rules: restrictions,
    catalog,
    prices,
    stores: input.stores,
    cooking,
  });
  const availableFoods = allowedCatalog(restrictions, catalog).filter(
    (food) => input.stores.length === 0 || input.stores.some((store) => prices.carries(store, food.id)),
  ).length;

  return {
    input,
    catalog,
    prices,
    cooking,
    restrictions,
    targets,
    rules: buildRuleSet(targets),
    eligible: new Map(eligibleList.map((recipe) => [recipe.id, recipe])),
    eligibleList,
    factor: householdFactor(input.householdSize, targets.kcal),
    availableFoods,
  };
}

const budgetOption = (current: number, required: number): BudgetOption => ({
  currentBudget: current,
  requiredBudget: required,
  recommendedIncrease: required - current,
});

function budgetTooLow(current: number, required: number): GenerateFailureError {
  return {
    code: "budget_too_low",
    message: "El presupuesto es demasiado bajo para un plan semanal.",
    budget: budgetOption(current, required),
  };
}

function budgetFloorFailure(input: GenerateInput): GenerateFailure | null {
  const floor = MIN_WEEKLY_BUDGET_PER_PERSON_COP * input.householdSize;
  if (input.weeklyBudgetCop >= floor) return null;
  logEvent("plan_budget_too_low", budgetTooLowFields("floor", input.householdSize, input.weeklyBudgetCop, floor));
  return {
    error: {
      ...budgetTooLow(input.weeklyBudgetCop, floor),
      message: "El presupuesto mínimo es 130.000 pesos por persona a la semana.",
    },
  };
}

/**
 * Generates a weekly plan: rules from the goals, eligible recipes, then up to
 * 3 attempts where the picker (the AI by default) chooses recipes and the
 * optimizer scales them to meet the rules at the lowest cost.
 *
 * The model is injected so the whole pipeline can be tested without OpenAI.
 * `limits` caps the model calls and the total time (defaults: 12 calls, 120 s).
 */
export async function generatePlan(
  input: GenerateInput,
  rawCallModel: ModelCall,
  limits?: Partial<GenerationLimits>,
  deps: PlannerDeps = {},
): Promise<GenerateOutcome> {
  const floorFailure = budgetFloorFailure(input);
  if (floorFailure) return floorFailure;

  let context: Context;
  try {
    context = contextOf(input, deps);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    logEvent("generation_invalid_input", { step: "targets" });
    return { error: { code: "generation_failed", message: FAILED_MESSAGE } };
  }

  const reasons: string[] = [];
  const diagnostics = (extra: Partial<FailureDiagnostics> = {}): FailureDiagnostics => ({
    availableFoods: context.availableFoods,
    totalFoods: context.catalog.all.length,
    reasons,
    ...extra,
  });

  const coverage = recipeCoverage(context.eligibleList);
  if (!coverage.ok) {
    logEvent("plan_restrictions_too_strict", restrictionsTooStrictFields(coverage.availableRecipes));
    return {
      error: {
        code: "restrictions_too_strict",
        message: "Tus restricciones y tu cocina dejan muy pocas recetas para armar un plan.",
        diagnostics: diagnostics({ availableRecipes: coverage.availableRecipes }),
      },
    };
  }

  // Load the solver before any paid call: a week that cannot be priced is useless.
  const optimizer = deps.optimizer ?? HIGHS_OPTIMIZER;
  if (!(await optimizer.prepare())) {
    logEvent("lp_load_failed", { code: optimizer.loadError() ?? "unknown" });
    reasons.push("optimizer_unavailable");
    return { error: { code: "generation_failed", message: FAILED_MESSAGE, diagnostics: diagnostics() }, refundable: true };
  }

  const now = limits?.now ?? Date.now;
  const budget = withCallBudget(rawCallModel, {
    maxModelCalls: limits?.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS,
    deadline: limits?.deadline ?? now() + DEFAULT_TIME_BUDGET_MS,
    now,
  });
  const picker = deps.picker ?? createAiRecipePicker(budget);
  const outcome = await runAttempts(context, picker, optimizer, budget.canStart, reasons, diagnostics);

  logEvent("generation_usage", {
    calls: budget.usage.modelCalls,
    billable: budget.usage.billableCalls,
    refused: budget.usage.refusedCalls,
  });
  return { ...outcome, usage: { ...budget.usage } };
}

/** Lower is better: blockers weighted by level, so one level-2 miss outweighs many level-3 ones. */
const shortfallWeight = (shortfalls: readonly Shortfall[]): number =>
  shortfalls.filter(isBlocker).reduce((sum, s) => sum + (PENALTY[s.level as 2 | 3 | 4] ?? 0), 0);

/** Fewest weighted shortfalls, then lower cost. */
function betterOf(a: OptimizeResult | null, b: OptimizeResult): OptimizeResult {
  if (a === null || a.week === null) return b;
  if (b.week === null) return a;
  const wa = shortfallWeight(a.shortfalls);
  const wb = shortfallWeight(b.shortfalls);
  if (wa !== wb) return wb < wa ? b : a;
  return (b.costCop ?? Infinity) < (a.costCop ?? Infinity) ? b : a;
}

const SHORTFALL_FEEDBACK: Readonly<Record<string, string>> = {
  fiber_min: "pick more recipes with vegetables, legumes or fruit",
  fruit_veg_min: "pick more recipes with vegetables, legumes or fruit",
  protein_min: "pick more protein-rich recipes",
  legumes_week: "include at least 2 legume dishes in the week",
  distinct_foods_week: "use more variety of foods",
  gaba_groups_day: "each day needs 4 food groups (cereals, protein foods, fruit or vegetables, dairy)",
  iron_sources_week: "put legumes, red meat or spinach in 5 meals",
  sodium_max: "choose fewer canned or salty dishes",
  free_sugar_max: "choose fewer sweetened dishes",
};

/**
 * fat_max: name the day with the highest fat share of kcal and its meal with
 * the most fat, so the retry swaps that dish instead of guessing.
 */
function fatFeedback(week: ComposedWeek | null, catalog: Catalog): string {
  const general = "put at most one high-fat dish per day";
  if (!week) return general;

  let worst: { day: Day; share: number; recipeId: string | undefined; slot: Slot } | null = null;
  for (const day of DAYS) {
    let kcal = 0;
    let fat = 0;
    let fattest: { fat: number; recipeId: string | undefined; slot: Slot } | null = null;
    for (const slot of SLOTS) {
      const meal = week[day][slot];
      let mealFat = 0;
      for (const item of meal.items) {
        const ingredient = catalog.get(item.id);
        if (!ingredient) continue;
        const n = nutritionOf(ingredient, item.qty);
        kcal += n.kcal;
        fat += n.fat;
        mealFat += n.fat;
      }
      if (!fattest || mealFat > fattest.fat) fattest = { fat: mealFat, recipeId: meal.recipeId, slot };
    }
    const share = kcal > 0 ? (fat * 9) / kcal : 0;
    if (fattest && (!worst || share > worst.share)) worst = { day, share, recipeId: fattest.recipeId, slot: fattest.slot };
  }

  return worst?.recipeId
    ? `day ${worst.day} has too much fat: swap "${worst.recipeId}" (${worst.slot}) for a lower-fat dish, and ${general}`
    : general;
}

/** Retry feedback from what the week missed (code-made text only, never user data). */
export function feedbackFromShortfalls(
  shortfalls: readonly Shortfall[],
  week: ComposedWeek | null = null,
  catalog: Catalog = STATIC_CATALOG,
): string {
  const asks = [
    ...new Set(
      shortfalls
        .map((s) => (s.rule === "fat_max" ? fatFeedback(week, catalog) : SHORTFALL_FEEDBACK[s.rule]))
        .filter(Boolean),
    ),
  ];
  return asks.length > 0
    ? `The last week missed some goals: ${asks.join("; ")}.`
    : "The last week missed some goals: choose dishes that fit the goals better.";
}

const optimizerFailureReason = (error: NonNullable<OptimizeResult["error"]>): string =>
  error === "cpu_exhausted" ? "optimizer_cpu_exhausted" : "optimizer_unavailable";

/** The retry loop: pick recipes, optimize, keep the best week. */
async function runAttempts(
  context: Context,
  picker: RecipePicker,
  optimizer: WeekOptimizer,
  canStart: (calls?: number, minMs?: number) => boolean,
  reasons: string[],
  diagnostics: () => FailureDiagnostics,
): Promise<GenerateFailure | { plan: BuiltPlan }> {
  const { input } = context;
  const cpu = createCpuBudget(); // one per request, shared by every attempt
  const fail = (code: GenerationErrorCode, message = FAILED_MESSAGE): GenerateFailure => ({
    error: { code, message, diagnostics: diagnostics() },
  });

  let feedback: string | undefined;
  let unavailable = 0;
  let lastFailure: GenerateFailure = fail("generation_failed");
  let best: OptimizeResult | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // Do not start an attempt that cannot finish within the limits.
    if (attempt > 0 && !canStart(1, MIN_COMPOSE_TIME_MS)) {
      logEvent("generation_budget_exhausted", { attempt });
      break;
    }

    const pick = await picker.pick({
      eligible: context.eligible,
      targets: context.targets,
      goals: input.goals,
      budgetPerPersonCop: Math.round(input.weeklyBudgetCop / input.householdSize),
      cooking: context.cooking,
      catalog: context.catalog,
      prices: context.prices,
      stores: input.stores,
      unmatchedText: context.restrictions.unmatchedText,
      feedback,
    });

    if (pick.kind === "unavailable") {
      unavailable += 1;
      reasons.push(pick.reason);
      lastFailure = fail(pick.code, pick.message);
      // Configuration problems do not fix themselves, and a service that
      // failed twice would only run into the function time limit.
      if (pick.final || unavailable >= 2) break;
      continue;
    }

    if (pick.kind === "rejected") {
      feedback = pick.feedback;
      reasons.push(pick.reason);
      logEvent("plan_attempt_rejected", { attempt, code: pick.reason.split(":")[0] });
      lastFailure = fail("invalid_format", "El plan generado no tiene un formato válido.");
      continue;
    }

    let result: OptimizeResult;
    try {
      result = optimizer.optimize({
        recipeWeek: repairWeekendOnly(pick.week, context.eligible),
        recipes: context.eligible,
        rules: context.rules,
        catalog: context.catalog,
        prices: context.prices,
        stores: input.stores,
        householdFactor: context.factor,
        budgetCop: input.weeklyBudgetCop,
        cooking: context.cooking,
        cpu,
        // Always: the numbers of budget_too_low and goals_unreachable come from it, and a
        // whole request stays far below OPTIMIZER_CPU_BUDGET_MS (measured in Task 13).
        diagnose: true,
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      logEvent("plan_attempt_rejected", { attempt, code: "optimizer_invalid_input" });
      reasons.push("optimizer_invalid_input");
      return best ? decide(context, best) : fail("generation_failed");
    }

    // `error` before `status`: the run stopped early (CPU spent or solver broken);
    // a week it still holds is valid, otherwise "infeasible" only means "no week".
    if (result.error) {
      reasons.push(optimizerFailureReason(result.error));
      best = result.week ? betterOf(best, result) : best;
      return best ? decide(context, best) : fail("generation_failed");
    }

    if (result.status === "optimal") return decide(context, result);

    if (result.status === "relaxed") {
      best = betterOf(best, result);
      reasons.push(`relaxed:${result.shortfalls.map((s) => s.rule).join(",")}`);
      // "Quiero el plan igual" takes the first week that meets level 1 and the budget.
      if (input.allowPartial) break;
      feedback = feedbackFromShortfalls(result.shortfalls, result.week, context.catalog);
      continue;
    }

    // over_budget or infeasible: a relaxed week found earlier still wins.
    if (best) break;
    if (result.status === "over_budget") {
      logEvent(
        "plan_budget_too_low",
        budgetTooLowFields("optimizer", input.householdSize, input.weeklyBudgetCop, result.requiredBudgetCop),
      );
      return result.requiredBudgetCop !== null
        ? { error: { ...budgetTooLow(input.weeklyBudgetCop, result.requiredBudgetCop), diagnostics: diagnostics() } }
        : fail("budget_too_low", "La lista de mercado supera tu presupuesto semanal.");
    }
    reasons.push("optimizer_infeasible");
    return fail("generation_failed");
  }

  return best ? decide(context, best) : lastFailure;
}

/** Turns the chosen optimizer result (with a week) into a plan or a goals_unreachable answer. */
function decide(context: Context, result: OptimizeResult): GenerateFailure | { plan: BuiltPlan } {
  const { input } = context;
  const week = result.week as ComposedWeek;
  const blockers = result.shortfalls.filter(isBlocker);

  // `relaxed` is never shipped as a plan unless the user asked for it.
  if (blockers.length > 0 && !input.allowPartial) {
    logEvent("plan_goals_unreachable", { conflicts: blockers.length, budget_fix: result.requiredBudgetCop !== null });
    return {
      error: {
        code: "goals_unreachable",
        message: UNREACHABLE_MESSAGE,
        conflicts: blockers,
        canForce: true,
        ...(result.requiredBudgetCop !== null && result.requiredBudgetCop > input.weeklyBudgetCop
          ? { budget: budgetOption(input.weeklyBudgetCop, result.requiredBudgetCop) }
          : {}),
      },
      reusable: { week },
    };
  }

  const plan = assemble(context, week, complianceFromShortfalls(blockers));
  // The optimizer already guarantees it; this is the last guard before shipping.
  if (plan.summary.estimated_total_cop > input.weeklyBudgetCop) {
    logEvent("plan_over_budget", { step: "assemble" });
    const required = Math.ceil(plan.summary.estimated_total_cop / 1000) * 1000;
    logEvent("plan_budget_too_low", budgetTooLowFields("assemble", input.householdSize, input.weeklyBudgetCop, required));
    return { error: budgetTooLow(input.weeklyBudgetCop, required) };
  }
  logEvent("plan_generated", { status: blockers.length > 0 ? "partial" : "full" });
  return { plan };
}

function assemble(context: Context, week: ComposedWeek, compliance: PlanCompliance): BuiltPlan {
  return assemblePlan(week, {
    householdSize: context.input.householdSize,
    stores: context.input.stores,
    targets: toNutritionTargets(context.targets),
    catalog: context.catalog,
    prices: context.prices,
    recipes: context.eligible,
    notices: context.targets.notices,
    compliance,
    householdFactor: context.factor,
    batch: context.cooking.batch,
  });
}

// ---------------------------------------------------------------------------
// "Quiero el plan igual" from a stored week

/** Most one meal item may hold (g, ml or units) in a stored week; real ones are far below. */
const MAX_STORED_QTY = 5000;
const MAX_NAME_LENGTH = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Most of `food` one serving of `recipe` can hold: the line's base quantity
 * times its role's largest scale (recipe.scale, else DEFAULT_ROLE_SCALE;
 * fixed lines 1, condiment lines 1), plus one rounding step (roundQty). Null
 * when the food is not on any line.
 */
function maxLineQty(recipe: ResolvedRecipe, food: string, unit: string): number | null {
  const roundingStep = unit === "unit" ? 1 : 5;
  let best: number | null = null;
  recipe.lines.forEach((line, index) => {
    if (line.food !== food && !(line.alternatives ?? []).some((alt) => alt.food === food)) return;
    const role = line.role;
    const maxScale =
      role === "fixed" ? 1 : (recipe.scale?.[role as keyof NonNullable<typeof recipe.scale>]?.[1] ?? DEFAULT_ROLE_SCALE[role][1]);
    const bound = lineQty(recipe, index, food) * maxScale + roundingStep;
    best = best === null ? bound : Math.max(best, bound);
  });
  return best;
}

function readMeal(raw: unknown, context: Context, day: Day, slot: Slot): ComposedMeal | null {
  if (!isRecord(raw) || !isRecord(raw.name) || !Array.isArray(raw.items)) return null;
  const { recipeId, name, items } = raw;
  if (typeof recipeId !== "string") return null;
  const recipe = context.eligible.get(recipeId);
  // Only recipes this user can cook today, in their slots; weekend-only ones on the weekend.
  if (!recipe || !recipe.slots.includes(slot) || (recipe.weekendOnly && day !== "sab" && day !== "dom")) return null;
  if (typeof name.es !== "string" || typeof name.en !== "string") return null;
  if (name.es.length > MAX_NAME_LENGTH || name.en.length > MAX_NAME_LENGTH) return null;
  // One item per recipe line at most.
  if (items.length < 1 || items.length > recipe.lines.length) return null;

  const parsed: MealItem[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.qty !== "number") return null;
    if (parsed.some((seen) => seen.id === item.id)) return null;
    const food = context.catalog.get(item.id);
    if (!food || !isAllowed(food, context.restrictions)) return null;
    // Only the recipe's own foods (a line's food or one of its alternatives),
    // never more than that line can scale to (rounding included).
    const maxQty = maxLineQty(recipe, item.id, food.unit);
    if (maxQty === null || !Number.isFinite(item.qty) || item.qty <= 0 || item.qty > Math.min(maxQty, MAX_STORED_QTY)) return null;
    parsed.push({ id: item.id, qty: item.qty });
  }
  return { name: { es: name.es, en: name.en }, items: parsed, recipeId };
}

/**
 * Builds the "Quiero el plan igual" plan from a week stored by an earlier
 * request, with no model call and no new solve. Never trusts the stored data:
 * every meal must be an eligible recipe made only of its own foods allowed for
 * this user, level 1 rules are measured again, compliance is measured on the
 * week, and the list must fit the budget at today's prices. Null when
 * anything fails (the caller then generates normally).
 */
export function planFromPartial(input: GenerateInput, stored: unknown, deps: PlannerDeps = {}): BuiltPlan | null {
  if (!isRecord(stored) || !isRecord(stored.week) || budgetFloorFailure(input)) return null;

  let context: Context;
  try {
    context = contextOf(input, deps);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }

  const week = {} as ComposedWeek;
  for (const day of DAYS) {
    const meals = stored.week[day];
    if (!isRecord(meals)) return null;
    week[day] = {} as Record<Slot, ComposedMeal>;
    for (const slot of SLOTS) {
      const meal = readMeal(meals[slot], context, day, slot);
      if (!meal) return null;
      week[day][slot] = meal;
    }
  }

  const shortfalls = evaluateWeek(week, context.rules, context.catalog);
  if (shortfalls.some((s) => s.level === 1)) return null;

  const plan = assemble(context, week, complianceFromShortfalls(shortfalls.filter(isBlocker)));
  return plan.summary.estimated_total_cop <= input.weeklyBudgetCop ? plan : null;
}
