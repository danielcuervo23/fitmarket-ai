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

/**
 * Ingredient lines per meal. Real meals include seasonings (oil, salt, garlic,
 * cilantro) so the upper bound is generous; extra lines are trimmed, not
 * rejected, because rejecting a whole week over one long lunch wastes money.
 */
export const ITEMS_PER_MEAL = { min: 1, max: 8 } as const;
