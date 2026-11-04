import { z } from "zod";
import { RETAIL_MARKUP, retailPrice, type MarkupGroup } from "./markup.ts";
import type { SipsaRow } from "./sipsa.ts";

// SIPSA rows -> one reference price per food, in the food's base unit
// (COP per g, ml or unit), ready for city_reference_prices.

/** Same rules as the planner (priceBook.ts): see REFERENCE_MIN_RATIO there. */
const MIN_RATIO = 0.33;
const MAX_RATIO = 3;
/** Same as MAX_PRICE_AGE_DAYS in the planner. */
export const MAX_REFERENCE_AGE_DAYS = 45;
const DAY_MS = 86_400_000;

const mappingSchema = z.object({
  market: z.string(),
  source: z.string(),
  products: z
    .array(
      z.object({
        foodId: z.string().regex(/^[a-z0-9_]{2,40}$/),
        group: z.enum(Object.keys(RETAIL_MARKUP) as [MarkupGroup, ...MarkupGroup[]]),
        priceBasis: z.enum(["per_kg", "per_unit"]),
        artiIds: z.array(z.number().int().positive()).min(1).max(6),
      }),
    )
    .min(1),
});

export type DaneMapping = z.infer<typeof mappingSchema>;

export interface FoodInfo {
  id: string;
  unit: "g" | "ml" | "unit";
  refPriceCop: number;
  gramsPerUnit?: number;
}

export interface ReferencePrice {
  foodId: string;
  pricePerUnit: number;
  observedOn: string;
}

export interface DeriveResult {
  prices: ReferencePrice[];
  anomalies: { foodId: string; pricePerUnit: number; refPriceCop: number }[];
  /** Mapped foods with no SIPSA row at all. */
  missing: string[];
  /** Mapped foods whose newest week is older than the freshness limit. */
  stale: string[];
}

export function loadMapping(json: unknown, knownFoodIds: ReadonlySet<string>): DaneMapping {
  const mapping = mappingSchema.parse(json);
  const seen = new Set<string>();

  for (const product of mapping.products) {
    if (!knownFoodIds.has(product.foodId)) throw new Error(`mapping.json: unknown food ${product.foodId}`);
    if (seen.has(product.foodId)) throw new Error(`mapping.json: duplicate food ${product.foodId}`);
    seen.add(product.foodId);
  }

  return mapping;
}

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/** SIPSA price (per kg, or per unit) to the food's base unit, before markup. */
function toBaseUnit(price: number, basis: "per_kg" | "per_unit", food: FoodInfo): number {
  if (basis === "per_unit") {
    if (food.unit !== "unit") throw new Error(`${food.id}: per_unit price needs a food counted in units`);
    return price;
  }
  if (food.unit === "unit") {
    if (!food.gramsPerUnit || food.gramsPerUnit <= 0) throw new Error(`${food.id}: grams_per_unit is needed to convert kg to unit`);
    return (price / 1000) * food.gramsPerUnit;
  }
  return price / 1000; // g, or ml read as g (density ~1: oils are not mapped)
}

export function deriveReferencePrices(input: {
  rows: readonly SipsaRow[];
  mapping: Pick<DaneMapping, "products">;
  foods: readonly FoodInfo[];
  today: string;
}): DeriveResult {
  const foodsById = new Map(input.foods.map((f) => [f.id, f]));
  const byArti = new Map<number, SipsaRow[]>();

  for (const row of input.rows) byArti.set(row.artiId, [...(byArti.get(row.artiId) ?? []), row]);

  const today = dayNumber(input.today);
  const result: DeriveResult = { prices: [], anomalies: [], missing: [], stale: [] };

  for (const product of input.mapping.products) {
    const food = foodsById.get(product.foodId);

    if (!food) throw new Error(`unknown food ${product.foodId}`);

    const mine = product.artiIds.flatMap((id) => byArti.get(id) ?? []);

    if (mine.length === 0) {
      result.missing.push(food.id);
      continue;
    }

    const newest = mine.reduce((best, row) => (row.weekStart > best ? row.weekStart : best), "");
    const age = today - dayNumber(newest);

    if (age > MAX_REFERENCE_AGE_DAYS) {
      result.stale.push(food.id);
      continue;
    }

    // Only products seen in the newest week, so an old week never mixes in.
    const latest = mine.filter((row) => row.weekStart === newest);
    const wholesale = latest.reduce((sum, row) => sum + row.pricePerKg, 0) / latest.length;
    const pricePerUnit = Number(retailPrice(toBaseUnit(wholesale, product.priceBasis, food), product.group).toFixed(4));

    if (pricePerUnit > 0 && pricePerUnit >= food.refPriceCop * MIN_RATIO && pricePerUnit <= food.refPriceCop * MAX_RATIO) {
      result.prices.push({ foodId: food.id, pricePerUnit, observedOn: newest });
    } else {
      result.anomalies.push({ foodId: food.id, pricePerUnit, refPriceCop: food.refPriceCop });
    }
  }

  return result;
}
