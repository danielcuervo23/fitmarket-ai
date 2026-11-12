export const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export type Day = (typeof DAYS)[number];

export const SLOTS = ["desayuno", "almuerzo", "cena", "snacks"] as const;
export type Slot = (typeof SLOTS)[number];

/** One line of a meal: a catalog ingredient and how much of it (its own unit). */
export interface MealItem {
  id: string;
  qty: number;
}

export interface ComposedMeal {
  name: { es: string; en: string };
  items: MealItem[];
  /** Library recipe the meal comes from (absent when the meal is not from the library). */
  recipeId?: string;
}

export type ComposedWeek = Record<Day, Record<Slot, ComposedMeal>>;
