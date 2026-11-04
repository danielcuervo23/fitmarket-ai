import { costOf, type Ingredient } from "../catalog.ts";
import { carries, priceFactor } from "./stores.ts";

export type PriceSource = "official" | "user" | "estimate";

/**
 * A city reference price (DANE SIPSA) is trusted only between these multiples
 * of the food's static reference price (same rule the SIPSA reader applies).
 */
export const REFERENCE_MIN_RATIO = 0.33;
export const REFERENCE_MAX_RATIO = 3;

/** A price older than this many days is ignored and the estimate applies. */
export const MAX_PRICE_AGE_DAYS = 45;

export interface PriceOffer {
  storeId: string;
  foodId: string;
  /**
   * Size of the pack in the ingredient's base unit (the same as
   * `ingredient.unit`: g, ml or unit), never kg or L.
   */
  packSize: number;
  regularPriceCop: number;
  source: "official" | "user";
  /** YYYY-MM-DD */
  observedOn: string;
}

export interface Quote {
  store: string;
  costCop: number;
  packs: number;
  packSize: number;
  source: PriceSource;
  observedOn: string | null;
}

/** A city's reference price for one food (DANE SIPSA), per g, ml or unit. */
export interface CityReferencePrice {
  foodId: string;
  pricePerUnit: number;
  /** YYYY-MM-DD */
  observedOn: string;
}

export interface PriceBook {
  carries(storeId: string, foodId: string): boolean;
  quote(ingredient: Ingredient, qty: number, stores: string[]): Quote;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) / DAY_MS : NaN;
}

/**
 * Sanity rule against unit mix-ups (kg typed as g, L as ml): an offer's pack
 * must be between 0.1x and 10x the ingredient's reference pack, else it is
 * ignored and the estimate applies.
 */
function plausiblePack(ingredient: Ingredient, packSize: number): boolean {
  return packSize * 10 >= ingredient.pack && packSize <= ingredient.pack * 10;
}

const packsFor = (qty: number, packSize: number): number =>
  qty <= 0 ? 0 : Math.ceil(qty / packSize - 1e-9);

/**
 * Today's estimate for one store: whole packs at the reference price (the
 * city's SIPSA-based price when given, else the national one), times the
 * store's price level.
 */
function estimateQuote(
  ingredient: Ingredient,
  qty: number,
  store: string,
  factor: number = priceFactor(store, ingredient),
  referencePrice?: number,
): Quote {
  const priced = referencePrice === undefined ? ingredient : { ...ingredient, price: referencePrice };

  return {
    store,
    costCop: Math.round(costOf(priced, qty) * factor),
    packs: packsFor(qty, ingredient.pack),
    packSize: ingredient.pack,
    source: "estimate",
    observedOn: null,
  };
}

const keyOf = (storeId: string, foodId: string): string => `${storeId}\u0000${foodId}`;

/**
 * Prices read from a city's supermarkets. Fresh offers win; a store/food with
 * no fresh offer is priced with the estimate, so a plan never lacks a price.
 */
export function createCityPriceBook(
  offers: readonly PriceOffer[],
  options: {
    today: string;
    inactive?: ReadonlyArray<{ storeId: string; foodId: string }>;
    maxAgeDays?: number;
    /** City reference prices: the base of estimates when fresh and plausible. */
    cityReference?: readonly CityReferencePrice[];
  },
): PriceBook {
  const today = dayNumber(options.today);

  if (!Number.isFinite(today)) {
    throw new Error(`createCityPriceBook: invalid today "${options.today}" (expected YYYY-MM-DD)`);
  }

  const maxAge = options.maxAgeDays ?? MAX_PRICE_AGE_DAYS;
  const all = new Map<string, PriceOffer[]>();
  const fresh = new Map<string, PriceOffer[]>();
  const references = new Map<string, number>();

  for (const row of options.cityReference ?? []) {
    const age = today - dayNumber(row.observedOn);

    if (Number.isFinite(row.pricePerUnit) && row.pricePerUnit > 0 && age >= 0 && age <= maxAge) {
      references.set(row.foodId, row.pricePerUnit);
    }
  }

  /** The reference for this food, only when within x0.33..x3 of its static price. */
  const referenceFor = (ingredient: Ingredient): number | undefined => {
    const value = references.get(ingredient.id);

    return value !== undefined &&
        value >= ingredient.price * REFERENCE_MIN_RATIO &&
        value <= ingredient.price * REFERENCE_MAX_RATIO
      ? value
      : undefined;
  };

  const inactive = new Set((options.inactive ?? []).map((row) => keyOf(row.storeId, row.foodId)));

  for (const offer of offers) {
    if (
      !Number.isFinite(offer.packSize) ||
      offer.packSize <= 0 ||
      !Number.isFinite(offer.regularPriceCop) ||
      offer.regularPriceCop < 0
    ) {
      continue;
    }

    const key = keyOf(offer.storeId, offer.foodId);
    all.set(key, [...(all.get(key) ?? []), offer]);

    const age = today - dayNumber(offer.observedOn);

    if (age >= 0 && age <= maxAge) {
      fresh.set(key, [...(fresh.get(key) ?? []), offer]);
    }
  }

  const carriesFood = (storeId: string, foodId: string): boolean => {
    const key = keyOf(storeId, foodId);

    if (all.has(key)) {
      return true;
    }

    return inactive.has(key) ? false : carries(storeId, foodId);
  };

  const quoteAt = (ingredient: Ingredient, qty: number, store: string): Quote => {
    const options = fresh
      .get(keyOf(store, ingredient.id))
      ?.filter((offer) => plausiblePack(ingredient, offer.packSize));

    if (!options?.length || qty <= 0) {
      return estimateQuote(ingredient, qty, store, undefined, referenceFor(ingredient));
    }

    let best: Quote | null = null;

    for (const offer of options) {
      const packs = packsFor(qty, offer.packSize);
      const costCop = packs * offer.regularPriceCop;

      if (!best || costCop < best.costCop) {
        best = {
          store,
          costCop,
          packs,
          packSize: offer.packSize,
          source: offer.source,
          observedOn: offer.observedOn,
        };
      }
    }

    return best as Quote;
  };

  return {
    carries: carriesFood,
    quote(ingredient, qty, stores) {
      let best: Quote | null = null;

      for (const store of stores) {
        if (!carriesFood(store, ingredient.id)) {
          continue;
        }

        const candidate = quoteAt(ingredient, qty, store);

        if (!best || candidate.costCop < best.costCop) {
          best = candidate;
        }
      }

      // No store carries it: same fallback as cheapestStore (reference price).
      return best ?? estimateQuote(ingredient, qty, stores[0] ?? "", 1, referenceFor(ingredient));
    },
  };
}
