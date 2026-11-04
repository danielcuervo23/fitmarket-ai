import {
  STATIC_CATALOG,
  gramsOf,
  nutritionOf,
  type Catalog,
  type Ingredient,
  type Nutrition,
  type ShoppingCategory,
} from "../catalog.ts";
import type { NutritionTargets } from "../nutrition.ts";
import type { PriceBook, PriceSource } from "./priceBook.ts";
import { STATIC_PRICE_BOOK } from "./stores.ts";
import { SWAP_RULES } from "./swaps.ts";
import {
  DAYS,
  SLOTS,
  type ComposedMeal,
  type ComposedWeek,
  type Day,
  type Slot,
} from "./types.ts";

/**
 * Deterministic part of the planner: takes the AI's composition and computes
 * everything numeric (calories, protein, shopping list, cost) from the
 * catalog, then fits the plan to the budget by swapping expensive foods for
 * cheaper equivalents.
 */

// ------------------------------------------------------------------ quantities

function roundQty(ingredient: Ingredient, qty: number): number {
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

function mealKcal(meal: ComposedMeal, catalog: Catalog): number {
  return meal.items.reduce((sum, item) => {
    const ingredient = catalog.get(item.id);
    return ingredient ? sum + nutritionOf(ingredient, item.qty).kcal : sum;
  }, 0);
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

function cloneWeek(week: ComposedWeek): ComposedWeek {
  const copy = {} as ComposedWeek;

  for (const day of DAYS) {
    const meals = {} as Record<Slot, ComposedMeal>;

    for (const slot of SLOTS) {
      const meal = week[day][slot];
      meals[slot] = {
        name: { ...meal.name },
        items: meal.items.map((item) => ({ ...item })),
      };
    }

    copy[day] = meals;
  }

  return copy;
}

/**
 * Scales every day to the calorie target. Seasonings and oils (category
 * "condimentos") stay as the AI wrote them; the rest of the day's food is
 * scaled up or down proportionally and rounded to sensible amounts.
 */
export function normalizeWeek(
  week: ComposedWeek,
  targetKcal: number,
  catalog: Catalog = STATIC_CATALOG,
): ComposedWeek {
  const result = cloneWeek(week);

  for (const day of DAYS) {
    let fixedKcal = 0;
    let scalableKcal = 0;

    for (const slot of SLOTS) {
      for (const item of result[day][slot].items) {
        const ingredient = catalog.get(item.id);

        if (!ingredient) {
          continue;
        }

        const kcal = nutritionOf(ingredient, item.qty).kcal;

        if (ingredient.category === "condimentos") {
          fixedKcal += kcal;
        } else {
          scalableKcal += kcal;
        }
      }
    }

    if (scalableKcal <= 0) {
      continue;
    }

    const factor = Math.min(
      1.6,
      Math.max(0.6, (targetKcal - fixedKcal) / scalableKcal),
    );

    for (const slot of SLOTS) {
      for (const item of result[day][slot].items) {
        const ingredient = catalog.get(item.id);

        if (ingredient && ingredient.category !== "condimentos") {
          item.qty = roundQty(ingredient, item.qty * factor);
        }
      }
    }
  }

  return result;
}

// ------------------------------------------------------------------ aggregation

/** Total quantity per ingredient across the week, for the whole household. */
export function totalsByIngredient(
  week: ComposedWeek,
  householdSize: number,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      for (const item of week[day][slot].items) {
        totals.set(
          item.id,
          (totals.get(item.id) ?? 0) + item.qty * householdSize,
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

export function weekCost(
  week: ComposedWeek,
  householdSize: number,
  stores: string[],
  catalog: Catalog = STATIC_CATALOG,
  prices: PriceBook = STATIC_PRICE_BOOK,
): number {
  let total = 0;

  for (const [id, qty] of totalsByIngredient(week, householdSize)) {
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

// ----------------------------------------------------------------- budget fit

function swapQty(
  from: Ingredient,
  to: Ingredient,
  qty: number,
  keep: "protein" | "kcal",
): number {
  const fromGrams = gramsOf(from, qty);
  const perGramFrom =
    keep === "protein" ? from.per100.protein : from.per100.kcal;
  const perGramTo = keep === "protein" ? to.per100.protein : to.per100.kcal;

  if (perGramTo <= 0) {
    return qty;
  }

  const toGrams = (fromGrams * perGramFrom) / perGramTo;
  const toQty = to.unit === "unit" ? toGrams / (to.gramsPerUnit ?? 100) : toGrams;

  return roundQty(to, toQty);
}

function applySwap(
  week: ComposedWeek,
  fromId: string,
  toId: string,
  keep: "protein" | "kcal",
  catalog: Catalog,
): ComposedWeek {
  const from = catalog.get(fromId);
  const to = catalog.get(toId);
  const next = cloneWeek(week);

  if (!from || !to) {
    return next;
  }

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const meal = next[day][slot];

      for (const item of meal.items) {
        if (item.id === fromId) {
          item.qty = swapQty(from, to, item.qty, keep);
          item.id = toId;
        }
      }

      // Merge duplicates created by the swap (e.g. two lines of the same food).
      const merged = new Map<string, number>();

      for (const item of meal.items) {
        merged.set(item.id, (merged.get(item.id) ?? 0) + item.qty);
      }

      meal.items = [...merged].map(([id, qty]) => ({ id, qty }));
    }
  }

  return next;
}

export interface FitResult {
  week: ComposedWeek;
  cost: number;
  /** How many substitutions were needed to get there. */
  swaps: number;
}

/**
 * Brings the week under budget by repeatedly applying the swap that saves the
 * most money, re-balancing calories after each one. Stops when the plan fits
 * or no swap helps any more.
 */
export function fitToBudget(
  week: ComposedWeek,
  options: {
    budgetCop: number;
    householdSize: number;
    targetKcal: number;
    allowedIds: ReadonlySet<string>;
    stores: string[];
    catalog?: Catalog;
    prices?: PriceBook;
  },
): FitResult {
  const { budgetCop, householdSize, targetKcal, allowedIds, stores } = options;
  const catalog = options.catalog ?? STATIC_CATALOG;
  const prices = options.prices ?? STATIC_PRICE_BOOK;
  let current = normalizeWeek(week, targetKcal, catalog);
  let cost = weekCost(current, householdSize, stores, catalog, prices);
  let swaps = 0;

  // Each swap removes an ingredient from the plan, so this always terminates.
  while (cost > budgetCop && swaps < 40) {
    const used = new Set(totalsByIngredient(current, 1).keys());
    let best: { week: ComposedWeek; cost: number } | null = null;

    for (const rule of SWAP_RULES) {
      if (!used.has(rule.from) || !allowedIds.has(rule.to)) {
        continue;
      }

      const candidate = normalizeWeek(
        applySwap(current, rule.from, rule.to, rule.keep, catalog),
        targetKcal,
        catalog,
      );
      const candidateCost = weekCost(
        candidate,
        householdSize,
        stores,
        catalog,
        prices,
      );

      if (candidateCost < cost && (!best || candidateCost < best.cost)) {
        best = { week: candidate, cost: candidateCost };
      }
    }

    if (!best) {
      break;
    }

    current = best.week;
    cost = best.cost;
    swaps += 1;
  }

  return { week: current, cost, swaps };
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

export interface BuiltPlan {
  summary: {
    estimated_total_cop: number;
    estimated_daily_kcal: number;
    estimated_daily_protein_g: number;
    target_kcal: number;
    household_size: number;
  };
  weekly_menu: Record<Day, Record<Slot, string[]>>;
  weekly_menu_en: Record<Day, Record<Slot, string[]>>;
  dish_names: Record<Day, Record<Slot, { es: string; en: string }>>;
  shopping_list: PlanShoppingItem[];
}

export function assemblePlan(
  week: ComposedWeek,
  options: {
    householdSize: number;
    stores: string[];
    targets: NutritionTargets;
    catalog?: Catalog;
    prices?: PriceBook;
  },
): BuiltPlan {
  const { householdSize, stores, targets } = options;
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

  for (const [id, qty] of totalsByIngredient(week, householdSize)) {
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

  return {
    summary: {
      estimated_total_cop: total,
      estimated_daily_kcal: stats.avgKcal,
      estimated_daily_protein_g: stats.avgProtein,
      target_kcal: targets.kcal,
      household_size: householdSize,
    },
    weekly_menu,
    weekly_menu_en,
    dish_names,
    shopping_list,
  };
}

// ------------------------------------------------------------------ quality gate

export type QualityIssue =
  | { code: "low_protein"; actual: number; target: number }
  | { code: "low_variety"; actual: number };

/** Checks the plan is nutritionally and culinarily worth showing. */
export function checkQuality(
  week: ComposedWeek,
  targets: NutritionTargets,
  catalog: Catalog = STATIC_CATALOG,
): QualityIssue | null {
  const stats = weekStats(week, catalog);

  if (stats.avgProtein < targets.proteinG * 0.85) {
    return {
      code: "low_protein",
      actual: stats.avgProtein,
      target: targets.proteinG,
    };
  }

  if (stats.distinctIngredients < 14) {
    return { code: "low_variety", actual: stats.distinctIngredients };
  }

  return null;
}

/** Plain-language feedback for the AI when a quality check fails. */
export function feedbackFor(issue: QualityIssue): string {
  if (issue.code === "low_protein") {
    return `The plan averages ${issue.actual} g of protein per day but the target is ${issue.target} g. Add more protein sources from the allowed list (eggs, chicken, beef, fish, dairy, and legumes if they are allowed), for example a larger portion at lunch and dinner.`;
  }

  return `The plan uses only ${issue.actual} different ingredients. Use at least 18 different ones across the week.`;
}

/** Helper for tests and callers that need the kcal of one meal. */
export function kcalOfMeal(
  meal: ComposedMeal,
  catalog: Catalog = STATIC_CATALOG,
): number {
  return Math.round(mealKcal(meal, catalog));
}
