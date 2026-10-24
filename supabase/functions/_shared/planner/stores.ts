import { type Ingredient, type ShoppingCategory } from "../catalog.ts";

/**
 * Where to buy each ingredient, and what it costs there.
 *
 * ASSUMPTIONS, to be replaced with real data: the catalog prices are national
 * references. Each chain gets a price level per category relative to that
 * reference (1 = reference). Discount chains (D1, Ara) are cheaper, full
 * service chains (Éxito, Jumbo, Carulla) are not, and Ara is strongest on fresh
 * food. The figures are estimates informed by a small sample of shelf prices
 * (see data/price-samples) and are meant to be calibrated, not trusted blindly.
 */

type Factors = Record<ShoppingCategory, number>;

const flat = (value: number): Factors => ({
  proteinas: value,
  frutas_verduras: value,
  lacteos: value,
  granos: value,
  bebidas: value,
  condimentos: value,
  otros: value,
});

export const STORE_PRICE_FACTOR: Record<string, Factors> = {
  D1: {
    proteinas: 0.96,
    frutas_verduras: 0.97,
    lacteos: 0.9,
    granos: 0.88,
    bebidas: 0.9,
    condimentos: 0.9,
    otros: 0.92,
  },
  Ara: {
    proteinas: 0.93,
    frutas_verduras: 0.9,
    lacteos: 0.94,
    granos: 0.92,
    bebidas: 0.93,
    condimentos: 0.93,
    otros: 0.94,
  },
  Exito: flat(1),
  Jumbo: { ...flat(1.05), frutas_verduras: 1.08, proteinas: 1.05 },
  Carulla: { ...flat(1.1), frutas_verduras: 1.12, proteinas: 1.08 },
};

/** Item-level differences we have actually observed (eggs are cheap at D1). */
const ITEM_FACTOR: Record<string, Record<string, number>> = {
  huevo: { D1: 0.9, Ara: 0.95 },
  papa: { D1: 0.87 },
};

/** Things the discount chains do not usually stock. */
const NOT_CARRIED: Record<string, readonly string[]> = {
  D1: ["salmon", "tilapia", "quinua", "almendras", "nueces", "aceite_oliva", "res_sobrebarriga"],
  Ara: ["salmon", "quinua", "almendras", "nueces", "aceite_oliva"],
};

export function carries(store: string, ingredientId: string): boolean {
  return !NOT_CARRIED[store]?.includes(ingredientId);
}

/** Does at least one of the user's stores sell this ingredient? */
export function carriedByAny(stores: string[], ingredientId: string): boolean {
  return stores.length === 0 || stores.some((store) => carries(store, ingredientId));
}

export function priceFactor(store: string, ingredient: Ingredient): number {
  const itemFactor = ITEM_FACTOR[ingredient.id]?.[store];

  if (itemFactor !== undefined) {
    return itemFactor;
  }

  return STORE_PRICE_FACTOR[store]?.[ingredient.category] ?? 1;
}

/**
 * Cheapest of the user's stores that sells the ingredient. Ties keep the order
 * the user chose them in. With no stores (should not happen) the reference
 * price applies.
 */
export function cheapestStore(
  ingredient: Ingredient,
  stores: string[],
): { store: string; factor: number } {
  let best: { store: string; factor: number } | null = null;

  for (const store of stores) {
    if (!carries(store, ingredient.id)) {
      continue;
    }

    const factor = priceFactor(store, ingredient);

    if (!best || factor < best.factor) {
      best = { store, factor };
    }
  }

  return best ?? { store: stores[0] ?? "", factor: 1 };
}
