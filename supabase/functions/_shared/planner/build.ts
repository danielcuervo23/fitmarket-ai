import {
  STATIC_CATALOG,
  nutritionOf,
  type Catalog,
  type Ingredient,
  type Nutrition,
  type ShoppingCategory,
} from "../catalog.ts";
import type { NutritionTargets } from "../nutrition.ts";
import { needsSoaking, type ResolvedRecipe } from "../recipes/eligibility.ts";
import { RECIPE_LIBRARY_VERSION } from "../recipes/library.generated.ts";
import type { Appliance, CookingLevel } from "../recipes/types.ts";
import type { PriceBook, PriceSource } from "./priceBook.ts";
import type { Shortfall } from "./rules/ruleSet.ts";
import type { NoticeCode } from "./rules/targets.ts";
import { STATIC_PRICE_BOOK } from "./stores.ts";
import {
  DAYS,
  SLOTS,
  type ComposedWeek,
  type Day,
  type Slot,
} from "./types.ts";

/**
 * Deterministic part of the planner: takes the week chosen from recipes and
 * computes everything numeric (calories, protein, shopping list, cost) from
 * the catalog.
 */

// ------------------------------------------------------------------ quantities

export function roundQty(ingredient: Ingredient, qty: number): number {
  if (ingredient.unit === "unit") {
    // Eggs and fruit come whole; avocados and peppers may be halved.
    return ingredient.wholeUnits
      ? Math.max(1, Math.round(qty))
      : Math.max(0.5, Math.round(qty * 2) / 2);
  }

  if (qty >= 20) {
    return Math.max(5, Math.round(qty / 5) * 5);
  }

  return Math.max(1, Math.round(qty));
}

function addNutrition(total: Nutrition, add: Nutrition): Nutrition {
  return {
    kcal: total.kcal + add.kcal,
    protein: total.protein + add.protein,
    carbs: total.carbs + add.carbs,
    fat: total.fat + add.fat,
  };
}

const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function dayNutrition(
  week: ComposedWeek,
  day: Day,
  catalog: Catalog = STATIC_CATALOG,
): Nutrition {
  let total = ZERO;

  for (const slot of SLOTS) {
    for (const item of week[day][slot].items) {
      const ingredient = catalog.get(item.id);

      if (ingredient) {
        total = addNutrition(total, nutritionOf(ingredient, item.qty));
      }
    }
  }

  return total;
}

// ------------------------------------------------------------------ aggregation

/**
 * Total quantity per ingredient across the week, for the whole household.
 * `householdFactor` is the number of adult portions bought per menu portion;
 * it may be fractional (a child or a smaller eater counts as part of one).
 */
export function totalsByIngredient(
  week: ComposedWeek,
  householdFactor: number,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      for (const item of week[day][slot].items) {
        totals.set(
          item.id,
          (totals.get(item.id) ?? 0) + item.qty * householdFactor,
        );
      }
    }
  }

  return totals;
}

/**
 * What buying `qty` costs at the cheapest of the user's stores that sells it
 * (whole packs, then the store's price level).
 */
export function costAt(
  ingredient: Ingredient,
  qty: number,
  stores: string[],
  prices: PriceBook = STATIC_PRICE_BOOK,
): number {
  return prices.quote(ingredient, qty, stores).costCop;
}

/**
 * Cost of the week's shopping (whole packs). `householdFactor` is the same
 * number of adult portions per menu portion that `assemblePlan` uses (it may
 * be fractional), so the budget check and the plan total never diverge.
 */
export function weekCost(
  week: ComposedWeek,
  householdFactor: number,
  stores: string[],
  catalog: Catalog = STATIC_CATALOG,
  prices: PriceBook = STATIC_PRICE_BOOK,
): number {
  let total = 0;

  for (const [id, qty] of totalsByIngredient(week, householdFactor)) {
    const ingredient = catalog.get(id);

    if (ingredient) {
      total += costAt(ingredient, qty, stores, prices);
    }
  }

  return total;
}

export interface WeekStats {
  avgKcal: number;
  avgProtein: number;
  distinctIngredients: number;
}

export function weekStats(
  week: ComposedWeek,
  catalog: Catalog = STATIC_CATALOG,
): WeekStats {
  let kcal = 0;
  let protein = 0;
  const ids = new Set<string>();

  for (const day of DAYS) {
    const nutrition = dayNutrition(week, day, catalog);
    kcal += nutrition.kcal;
    protein += nutrition.protein;

    for (const slot of SLOTS) {
      week[day][slot].items.forEach((item) => ids.add(item.id));
    }
  }

  return {
    avgKcal: Math.round(kcal / 7),
    avgProtein: Math.round(protein / 7),
    distinctIngredients: ids.size,
  };
}

// --------------------------------------------------------------------- output

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatPurchase(ingredient: Ingredient, qty: number): string {
  if (ingredient.unit === "unit") {
    return `×${trimNumber(qty)}`;
  }

  if (qty >= 1000) {
    return `${trimNumber(qty / 1000)} ${ingredient.unit === "g" ? "kg" : "L"}`;
  }

  return `${trimNumber(qty)} ${ingredient.unit}`;
}

function formatCount(qty: number, lang: "es" | "en"): string {
  if (Number.isInteger(qty)) {
    return String(qty);
  }

  if (qty === 0.5) {
    return "1/2";
  }

  const text = qty.toFixed(1);

  return lang === "es" ? text.replace(".", ",") : text;
}

/** "80 g de avena en hojuelas" / "2 huevos". */
export function mealLine(
  ingredient: Ingredient,
  qty: number,
  lang: "es" | "en",
): string {
  const name = ingredient.name[lang].toLowerCase();

  if (ingredient.unit === "unit") {
    const plural = ingredient.plural?.[lang] ?? name;
    return `${formatCount(qty, lang)} ${qty <= 1 ? name : plural}`;
  }

  return lang === "es"
    ? `${qty} ${ingredient.unit} de ${name}`
    : `${qty} ${ingredient.unit} ${name}`;
}

export interface PlanShoppingItem {
  name: string;
  name_en: string;
  quantity: string;
  estimated_price_cop: number;
  category: ShoppingCategory;
  store_id: string;
  price_source?: PriceSource;
  /** YYYY-MM-DD; only when the price is not an estimate. */
  price_updated_at?: string;
}

/** What the plan shows about one recipe used this week. */
export interface PlanRecipeInfo {
  name: { es: string; en: string };
  minutes: number;
  level: CookingLevel;
  appliances: Appliance[];
  batch: boolean;
  steps: { es: string[]; en: string[] };
}

/**
 * A rule the plan does not meet. `unmeasurable: true` marks a rule that could
 * not be checked because some food has no nutrient data: it is listed as
 * unmet (never as met) and `achieved` is only the measured part.
 */
export interface PlanUnmetRule {
  rule: string;
  target: number;
  achieved: number;
  unit: string;
  unmeasurable?: true;
}

export interface PlanCompliance {
  /**
   * Producers write only these two values. The shared schema accepts any
   * short string and the web treats an unknown status as "partial".
   */
  status: "full" | "partial";
  unmet: PlanUnmetRule[];
}

/**
 * Shortfalls of levels 2-4 (also unmeasurable ones) are unmet; level 5 rules
 * are always elastic and never reported. Nothing unmet means full.
 */
export function complianceFromShortfalls(shortfalls: readonly Shortfall[]): PlanCompliance {
  const unmet = shortfalls.filter((s) => s.level !== 5).map((s): PlanUnmetRule => {
    const entry: PlanUnmetRule = { rule: s.rule, target: s.target, achieved: s.achieved, unit: s.unit };
    return s.unmeasurable ? { ...entry, unmeasurable: true } : entry;
  });
  return { status: unmet.length > 0 ? "partial" : "full", unmet };
}

/** A copy whose status follows its unmet rules: "partial" if any, else "full". */
function consistentCompliance(compliance: PlanCompliance): PlanCompliance {
  return {
    status: compliance.unmet.length > 0 ? "partial" : "full",
    unmet: compliance.unmet.map((entry) => ({ ...entry })),
  };
}

export interface BuiltPlan {
  summary: {
    estimated_total_cop: number;
    estimated_daily_kcal: number;
    estimated_daily_protein_g: number;
    target_kcal: number;
    household_size: number;
    recipe_library_version?: string;
  };
  weekly_menu: Record<Day, Record<Slot, string[]>>;
  weekly_menu_en: Record<Day, Record<Slot, string[]>>;
  dish_names: Record<Day, Record<Slot, { es: string; en: string }>>;
  shopping_list: PlanShoppingItem[];
  /** Recipe id per meal (plans from recipes only). */
  meal_recipes?: Record<Day, Record<Slot, string>>;
  /** Details of the recipes used this week, by id. */
  recipes?: Record<string, PlanRecipeInfo>;
  notices?: string[];
  compliance?: PlanCompliance;
}

function recipeInfo(recipe: ResolvedRecipe): PlanRecipeInfo {
  return {
    name: { ...recipe.name },
    minutes: recipe.minutes,
    level: recipe.level,
    appliances: [...recipe.appliances],
    batch: recipe.batch.ok,
    steps: { es: [...recipe.steps.es], en: [...recipe.steps.en] },
  };
}

/**
 * Recipe per meal and the details of each recipe used, or null when any meal
 * does not come from a known recipe (then the plan carries no recipe fields).
 */
function recipeFields(
  week: ComposedWeek,
  library: ReadonlyMap<string, ResolvedRecipe>,
): Required<Pick<BuiltPlan, "meal_recipes" | "recipes">> | null {
  const meal_recipes = {} as Record<Day, Record<Slot, string>>;
  const recipes: Record<string, PlanRecipeInfo> = {};

  for (const day of DAYS) {
    meal_recipes[day] = {} as Record<Slot, string>;

    for (const slot of SLOTS) {
      const id = week[day][slot].recipeId;
      const recipe = id === undefined ? undefined : library.get(id);

      if (id === undefined || !recipe) {
        return null;
      }

      meal_recipes[day][slot] = id;
      recipes[id] ??= recipeInfo(recipe);
    }
  }

  return { meal_recipes, recipes };
}

/** The evening before each weekend day: soak days only ever fall on Saturday or Sunday. */
const SOAK_REMINDER: Partial<Record<Day, NoticeCode>> = {
  sab: "soak_friday_night",
  dom: "soak_saturday_night",
};

/**
 * Reminders to soak dried legumes the evening before (owner decision
 * 2026-11-11). Only recipe meals count; eligibility keeps soak foods off
 * weekdays, so only Saturday and Sunday can need one. When the user cooks
 * in batches (`options.batch`, default true for callers that do not know),
 * a Sunday meal from a batch recipe (per `recipes`) already served on
 * Saturday is that pot's leftover, not a new cooking, so it needs no
 * Saturday-night reminder; a user who does not cook in batches cooks it again.
 */
export function soakNotices(
  week: ComposedWeek,
  recipes?: ReadonlyMap<string, ResolvedRecipe>,
  options: { batch?: boolean } = {},
): NoticeCode[] {
  const batch = options.batch ?? true;
  const notices: NoticeCode[] = [];

  for (const day of DAYS) {
    const code = SOAK_REMINDER[day];
    const soaks = SLOTS.some((slot) => {
      const meal = week[day][slot];
      return (
        meal.recipeId !== undefined &&
        meal.items.some((item) => needsSoaking(item.id)) &&
        !(batch && isBatchLeftover(week, day, meal.recipeId, recipes))
      );
    });

    if (code && soaks) notices.push(code);
  }

  return notices;
}

/** Sunday's meal is Saturday's batch when a batch recipe that keeps 2+ days was also served Saturday. */
function isBatchLeftover(
  week: ComposedWeek,
  day: Day,
  recipeId: string,
  recipes?: ReadonlyMap<string, ResolvedRecipe>,
): boolean {
  const recipe = recipes?.get(recipeId);

  return (
    day === "dom" &&
    recipe !== undefined &&
    recipe.batch.ok &&
    recipe.batch.keepsDays >= 2 &&
    SLOTS.some((slot) => week.sab[slot].recipeId === recipeId)
  );
}

export function assemblePlan(
  week: ComposedWeek,
  options: {
    householdSize: number;
    stores: string[];
    targets: NutritionTargets;
    catalog?: Catalog;
    prices?: PriceBook;
    /** Library recipes by id; meals point to them with `recipeId`. */
    recipes?: ReadonlyMap<string, ResolvedRecipe>;
    notices?: NoticeCode[];
    compliance?: PlanCompliance;
    /** Adult portions bought per menu portion (default householdSize). */
    householdFactor?: number;
    /** The user cooks in batches (soak reminders); default true. */
    batch?: boolean;
  },
): BuiltPlan {
  const { householdSize, stores, targets } = options;
  const householdFactor = options.householdFactor ?? householdSize;
  const catalog = options.catalog ?? STATIC_CATALOG;
  const prices = options.prices ?? STATIC_PRICE_BOOK;
  const stats = weekStats(week, catalog);

  const weekly_menu = {} as BuiltPlan["weekly_menu"];
  const weekly_menu_en = {} as BuiltPlan["weekly_menu_en"];
  const dish_names = {} as BuiltPlan["dish_names"];

  for (const day of DAYS) {
    weekly_menu[day] = {} as Record<Slot, string[]>;
    weekly_menu_en[day] = {} as Record<Slot, string[]>;
    dish_names[day] = {} as Record<Slot, { es: string; en: string }>;

    for (const slot of SLOTS) {
      const meal = week[day][slot];
      const ingredients = meal.items
        .map((item) => ({ ingredient: catalog.get(item.id), qty: item.qty }))
        .filter(
          (entry): entry is { ingredient: Ingredient; qty: number } =>
            entry.ingredient !== undefined,
        );

      weekly_menu[day][slot] = ingredients.map(({ ingredient, qty }) =>
        mealLine(ingredient, qty, "es"),
      );
      weekly_menu_en[day][slot] = ingredients.map(({ ingredient, qty }) =>
        mealLine(ingredient, qty, "en"),
      );
      dish_names[day][slot] = meal.name;
    }
  }

  const shopping_list: PlanShoppingItem[] = [];
  let total = 0;

  for (const [id, qty] of totalsByIngredient(week, householdFactor)) {
    const ingredient = catalog.get(id);

    if (!ingredient) {
      continue;
    }

    const quote = prices.quote(ingredient, qty, stores);
    total += quote.costCop;

    shopping_list.push({
      name: ingredient.name.es,
      name_en: ingredient.name.en,
      quantity: formatPurchase(ingredient, quote.packs * quote.packSize),
      estimated_price_cop: quote.costCop,
      category: ingredient.category,
      store_id: quote.store,
      price_source: quote.source,
      ...(quote.observedOn ? { price_updated_at: quote.observedOn } : {}),
    });
  }

  const fromRecipes = options.recipes ? recipeFields(week, options.recipes) : null;
  const soak = fromRecipes ? soakNotices(week, options.recipes, { batch: options.batch }) : [];
  const notices =
    options.notices || soak.length > 0 ? [...new Set([...(options.notices ?? []), ...soak])] : null;

  return {
    summary: {
      estimated_total_cop: total,
      estimated_daily_kcal: stats.avgKcal,
      estimated_daily_protein_g: stats.avgProtein,
      target_kcal: targets.kcal,
      household_size: householdSize,
      ...(fromRecipes ? { recipe_library_version: RECIPE_LIBRARY_VERSION } : {}),
    },
    weekly_menu,
    weekly_menu_en,
    dish_names,
    shopping_list,
    ...(fromRecipes ?? {}),
    ...(notices ? { notices } : {}),
    ...(options.compliance ? { compliance: consistentCompliance(options.compliance) } : {}),
  };
}
