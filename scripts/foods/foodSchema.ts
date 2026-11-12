import { z } from "zod";

// Shape of one entry of data/foods/foods.json. The file is the source of truth
// for the foods table: build-seed.ts turns it into migration 012.

const id = z.string().regex(/^[a-z0-9_]{2,40}$/);
const nonNegative = z.number().finite().min(0);

const base = z.object({
  id,
  nameEs: z.string().min(1).max(80),
  nameEn: z.string().min(1).max(80),
  pluralEs: z.string().min(1).max(80).optional(),
  pluralEn: z.string().min(1).max(80).optional(),
  category: z.enum([
    "proteinas",
    "frutas_verduras",
    "lacteos",
    "granos",
    "bebidas",
    "condimentos",
    "otros",
  ]),
  unit: z.enum(["g", "ml", "unit"]),
  wholeUnits: z.boolean(),
  gramsPerUnit: z.number().positive().max(99999).optional(),
  tags: z.array(
    z.enum([
      "lactose",
      "dairy",
      "egg",
      "gluten",
      "peanut",
      "tree_nut",
      "fish",
      "shellfish",
      "pork",
      "meat",
      "honey",
    ]),
  ),
  kcal: z.number().min(0).max(900),
  proteinG: z.number().min(0).max(100),
  carbsG: z.number().min(0).max(100),
  fatG: z.number().min(0).max(100),
  gabaGroup: z
    .enum([
      "cereales_tuberculos",
      "frutas_verduras",
      "lacteos",
      "proteicos",
      "grasas",
      "azucares",
    ])
    .nullable(),
  isFruitVeg: z.boolean(),
  defaultPack: z.number().positive(),
  refPriceCop: z.number().positive(),
  refPriceSource: z.enum(["sample", "estimate"]),
  nutritionSource: z.enum(["usda", "off"]),
  nutritionRef: z.string().regex(/^\d{1,14}$/),
  freeSugarsRule: z.enum(["none", "all", "added"]),
  /** Why a value is missing or was derived (human readable, optional). */
  nutritionNote: z.string().optional(),
  /**
   * Dried legume that must soak overnight before cooking (fríjol, garbanzo,
   * arveja seca; never lentejas or canned food). Recipes with it are weekend-only.
   */
  needsSoaking: z.literal(true).optional(),
});

const extended = z.object({
  fiberG: nonNegative.max(100),
  freeSugarsG: nonNegative.max(100),
  satFatG: nonNegative.max(100),
  sodiumMg: nonNegative.max(40000),
  ironMg: nonNegative.max(100),
});

/** A food with all its fields (what the seed needs). */
export const foodSchema = base.merge(extended);

/** A food whose extended fields may still be empty (before fetch-nutrition). */
export const draftFoodSchema = base.merge(extended.partial());

export const foodsFileSchema = z.array(foodSchema);
export const draftFoodsFileSchema = z.array(draftFoodSchema);

export type FoodJson = z.infer<typeof foodSchema>;
export type DraftFoodJson = z.infer<typeof draftFoodSchema>;
