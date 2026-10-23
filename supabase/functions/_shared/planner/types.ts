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
}

export type ComposedWeek = Record<Day, Record<Slot, ComposedMeal>>;

/** Allowed number of ingredient lines per meal. */
export const ITEMS_PER_MEAL: Record<Slot, { min: number; max: number }> = {
  desayuno: { min: 2, max: 5 },
  almuerzo: { min: 2, max: 6 },
  cena: { min: 2, max: 6 },
  snacks: { min: 1, max: 3 },
};
