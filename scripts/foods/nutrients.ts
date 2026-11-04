import { z } from "zod";

// Pure parsers for the two public nutrition sources. Their answers are
// untrusted: every value is checked (finite number, not negative, plausible
// size) and anything unexpected gives null, never a guess.

/** Nutrients per 100 g used to fill the extended columns of public.foods. */
export interface ExtendedNutrients {
  fiberG: number;
  /** null when the source does not report total sugars (e.g. quinoa in USDA). */
  totalSugarsG: number | null;
  /** null when the source does not report added sugars. */
  addedSugarsG: number | null;
  satFatG: number;
  sodiumMg: number;
  ironMg: number;
}

export type FreeSugarsRule = "none" | "all" | "added";

// Upper bound far above any real food (salt has ~39 000 mg of sodium per 100 g).
const amount = z.number().finite().min(0).max(100_000);

// USDA nutrient numbers: SR Legacy / Foundation (old numbers) and the newer
// numbering used by Foundation foods. The first one found wins.
const USDA = {
  fiberG: ["1079", "291"],
  totalSugarsG: ["2000", "269"],
  addedSugarsG: ["1235", "539"],
  satFatG: ["1258", "606"],
  sodiumMg: ["1093", "307"],
  ironMg: ["1089", "303"],
} as const;

const usdaNutrient = z.object({
  number: z.string().optional(),
  nutrient: z.object({ number: z.string().optional() }).optional(),
  amount: z.unknown().optional(),
});

const usdaFood = z.object({ foodNutrients: z.array(usdaNutrient).min(1) });

/**
 * Reads a USDA FoodData Central food (abridged or full format). Returns null
 * when the answer is malformed or any of fiber, saturated fat, sodium or iron
 * is missing. Total and added sugars are optional (null when not reported).
 */
export function parseUsdaFood(json: unknown): ExtendedNutrients | null {
  const food = usdaFood.safeParse(json);
  if (!food.success) {
    return null;
  }

  const byNumber = new Map<string, unknown>();
  for (const item of food.data.foodNutrients) {
    const number = item.number ?? item.nutrient?.number;
    if (number !== undefined && !byNumber.has(number)) {
      byNumber.set(number, item.amount);
    }
  }

  // undefined = absent (allowed only for added sugars); null = present but invalid.
  const read = (numbers: readonly string[]): number | null | undefined => {
    for (const number of numbers) {
      if (byNumber.has(number)) {
        const parsed = amount.safeParse(byNumber.get(number));
        return parsed.success ? parsed.data : null;
      }
    }
    return undefined;
  };

  const fiberG = read(USDA.fiberG);
  const totalSugarsG = read(USDA.totalSugarsG);
  const addedSugarsG = read(USDA.addedSugarsG);
  const satFatG = read(USDA.satFatG);
  const sodiumMg = read(USDA.sodiumMg);
  const ironMg = read(USDA.ironMg);

  if (
    typeof fiberG !== "number" ||
    totalSugarsG === null ||
    addedSugarsG === null ||
    typeof satFatG !== "number" ||
    typeof sodiumMg !== "number" ||
    typeof ironMg !== "number"
  ) {
    return null;
  }

  return {
    fiberG,
    totalSugarsG: totalSugarsG ?? null,
    addedSugarsG: addedSugarsG ?? null,
    satFatG,
    sodiumMg,
    ironMg,
  };
}

const offProduct = z.object({
  product: z.object({
    nutriments: z.object({
      fiber_100g: amount,
      sugars_100g: amount.optional(),
      "saturated-fat_100g": amount,
      sodium_100g: amount,
      iron_100g: amount,
    }),
  }),
});

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Reads an Open Food Facts product (api v2). Sodium and iron come in grams per
 * 100 g and are converted to mg. Returns null when anything is missing or
 * invalid. OFF has no added sugars here, so that field is always null.
 */
export function parseOffProduct(json: unknown): ExtendedNutrients | null {
  const parsed = offProduct.safeParse(json);
  if (!parsed.success) {
    return null;
  }

  const n = parsed.data.product.nutriments;
  return {
    fiberG: n.fiber_100g,
    totalSugarsG: n.sugars_100g ?? null,
    addedSugarsG: null,
    satFatG: n["saturated-fat_100g"],
    sodiumMg: round3(n.sodium_100g * 1000),
    ironMg: round3(n.iron_100g * 1000),
  };
}

/**
 * Free sugars per 100 g by rule: none (whole foods) = 0, all (sugar, panela,
 * honey) = total sugars, added (processed foods) = added sugars, or total
 * sugars when the source does not report them.
 */
export function freeSugars(n: ExtendedNutrients, rule: FreeSugarsRule): number {
  if (rule === "none") {
    return 0;
  }

  const value =
    rule === "all" ? n.totalSugarsG : (n.addedSugarsG ?? n.totalSugarsG);
  if (value === null) {
    throw new Error(`The source reports no total sugars, needed by rule "${rule}"`);
  }
  return value;
}

export interface ClampInput {
  id: string;
  carbsG: number;
  fatG: number;
  fiberG: number;
  freeSugarsG: number;
  satFatG: number;
}

export interface ClampResult {
  values: { fiberG: number; freeSugarsG: number; satFatG: number };
  /** One line per value that had to be lowered. */
  clamps: string[];
}

/**
 * The legacy macros (carbs, fat) of the catalog are the reference, so the
 * extended fields from USDA/OFF are capped to them: fiber and free sugars to
 * carbs, saturated fat to fat. This keeps the table checks of public.foods
 * (fiber_g <= carbs_g, ...) true by construction. Each clamp is reported.
 */
export function clampToMacros(food: ClampInput): ClampResult {
  const clamps: string[] = [];
  const cap = (
    field: string,
    value: number,
    limit: number,
    limitName: string,
  ): number => {
    if (value > limit) {
      clamps.push(`${food.id}: ${field} ${value} -> ${limit} (${limitName})`);
      return limit;
    }
    return value;
  };

  return {
    values: {
      fiberG: cap("fiberG", food.fiberG, food.carbsG, "carbsG"),
      freeSugarsG: cap("freeSugarsG", food.freeSugarsG, food.carbsG, "carbsG"),
      satFatG: cap("satFatG", food.satFatG, food.fatG, "fatG"),
    },
    clamps,
  };
}

export interface ExtendedFields {
  fiberG: number;
  freeSugarsG: number;
  satFatG: number;
  sodiumMg: number;
  ironMg: number;
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * Turns parsed source nutrients into the five extended fields of a food, with
 * the precision of the table (numeric(5,2) and numeric(7,1)), the free sugars
 * rule of that food, and the clamp to its legacy macros.
 */
export function buildExtendedFields(
  food: { id: string; carbsG: number; fatG: number; freeSugarsRule: FreeSugarsRule },
  nutrients: ExtendedNutrients,
): { fields: ExtendedFields; clamps: string[] } {
  const { values, clamps } = clampToMacros({
    id: food.id,
    carbsG: food.carbsG,
    fatG: food.fatG,
    fiberG: round(nutrients.fiberG, 2),
    freeSugarsG: round(freeSugars(nutrients, food.freeSugarsRule), 2),
    satFatG: round(nutrients.satFatG, 2),
  });

  return {
    fields: {
      ...values,
      sodiumMg: round(nutrients.sodiumMg, 1),
      ironMg: round(nutrients.ironMg, 2),
    },
    clamps,
  };
}
