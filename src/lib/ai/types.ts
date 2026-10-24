/** Day keys aligned with WeeklyMenuScreen and the IA JSON contract. */
export type DayId = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

/** Meal slots shown in the weekly menu UI. */
export type MealSlot = "desayuno" | "almuerzo" | "cena" | "snacks";

export const DAY_IDS: readonly DayId[] = [
  "lun",
  "mar",
  "mie",
  "jue",
  "vie",
  "sab",
  "dom",
] as const;

export const MEAL_SLOTS: readonly MealSlot[] = [
  "desayuno",
  "almuerzo",
  "cena",
  "snacks",
] as const;

export function isDayId(value: string): value is DayId {
  return DAY_IDS.includes(value as DayId);
}

export function isMealSlot(value: string): value is MealSlot {
  return MEAL_SLOTS.includes(value as MealSlot);
}

/** Meals for a single day (lists of dish / ingredient lines). */
export interface DayMenu {
  desayuno: string[];
  almuerzo: string[];
  cena: string[];
  snacks: string[];
}

/** Seven-day menu keyed by DayId. */
export type WeeklyMenu = Record<DayId, DayMenu>;

/** Grocery list categories for grouping in dashboard / store views. */
export type ShoppingCategory =
  | "proteinas"
  | "frutas_verduras"
  | "lacteos"
  | "granos"
  | "bebidas"
  | "condimentos"
  | "otros";

export const SHOPPING_CATEGORIES: readonly ShoppingCategory[] = [
  "proteinas",
  "frutas_verduras",
  "lacteos",
  "granos",
  "bebidas",
  "condimentos",
  "otros",
] as const;

export function isShoppingCategory(value: string): value is ShoppingCategory {
  return SHOPPING_CATEGORIES.includes(value as ShoppingCategory);
}

/** Consolidated market item with estimated COP price and target store. */
export interface ShoppingItem {
  name: string;
  /** English name (newer plans). */
  name_en?: string;
  quantity: string;
  estimated_price_cop: number;
  category: ShoppingCategory;
  /** Supermarket id from user_supermarkets / supermarkets table. */
  store_id: string;
}

/** High-level totals returned with each generation. */
export interface PlanSummary {
  estimated_total_cop: number;
  estimated_daily_kcal: number;
  /** Newer plans: computed daily protein, the calorie target and household. */
  estimated_daily_protein_g?: number;
  target_kcal?: number;
  household_size?: number;
  savings_note?: string;
}

/** Full IA generation payload: menu + shopping list (in-memory, no persistence). */
export interface WeeklyPlan {
  summary: PlanSummary;
  weekly_menu: WeeklyMenu;
  /** Same menu in English (newer plans). */
  weekly_menu_en?: WeeklyMenu;
  /** Dish name of every meal, in both languages (newer plans). */
  dish_names?: Record<DayId, Record<MealSlot, { es: string; en: string }>>;
  shopping_list: ShoppingItem[];
}
