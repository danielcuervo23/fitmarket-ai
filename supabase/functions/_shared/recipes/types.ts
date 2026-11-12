import type { Day, Slot } from "../planner/types.ts";

// The recipe library format. Recipes live in data/recipes/*.json, are validated
// by scripts/recipes/recipeSchema.ts and compiled into library.generated.ts.

export type Appliance =
  | "estufa"
  | "microondas"
  | "olla_arrocera"
  | "freidora_aire"
  | "licuadora"
  | "horno"
  | "sandwichera"
  | "olla_presion";

export const APPLIANCES: readonly Appliance[] = [
  "estufa",
  "microondas",
  "olla_arrocera",
  "freidora_aire",
  "licuadora",
  "horno",
  "sandwichera",
  "olla_presion",
];

/** "Lo básico", "Me defiendo", "Me gusta cocinar" (in this order). */
export type CookingLevel = "basic" | "comfortable" | "enjoys";

export const COOKING_LEVELS: readonly CookingLevel[] = ["basic", "comfortable", "enjoys"];

/**
 * How the optimizer may treat a line: scale it by role, or keep it fixed (salt,
 * garlic). "condiment" is cooking oil: it may shrink to half, never grow (owner
 * decision 2026-11-12). Salt stays fixed: at 1 g a portion, whole-gram rounding
 * would undo any smaller amount.
 */
export type IngredientRole = "protein" | "carb" | "veg" | "fat" | "condiment" | "fixed";
export type ScalableRole = Exclude<IngredientRole, "fixed">;

export const SCALABLE_ROLES: readonly ScalableRole[] = ["protein", "carb", "veg", "fat", "condiment"];

export interface RecipeAlternative {
  food: string;
  qty: number;
  /** Dish name when this alternative is used on an `inName` line. */
  name?: { es: string; en: string };
}

export interface RecipeLine {
  food: string;
  /** Quantity for ONE adult serving, in the food's unit (g, ml or unit). */
  qty: number;
  role: IngredientRole;
  optional?: boolean;
  /** The food appears in the dish name, so every alternative brings its own name. */
  inName?: boolean;
  alternatives?: RecipeAlternative[];
}

export interface Recipe {
  id: string;
  status: "pending_owner_ok" | "approved";
  source: "ai_draft" | "owner";
  name: { es: string; en: string };
  slots: Slot[];
  minutes: number;
  level: CookingLevel;
  /** What the recipe needs (0..8). Empty means no cooking, so it fits every kitchen. */
  appliances: Appliance[];
  /** Can be cooked once for several days; keepsDays is 1..4. */
  batch: { ok: boolean; keepsDays: number };
  lines: RecipeLine[];
  /** Per-role scale range [min, max] overriding DEFAULT_ROLE_SCALE (never for condiment). */
  scale?: Partial<Record<ScalableRole, [number, number]>>;
  steps: { es: string[]; en: string[] };
}

export const DEFAULT_ROLE_SCALE: Readonly<Record<ScalableRole, readonly [number, number]>> = Object.freeze({
  protein: Object.freeze([0.5, 2] as const),
  carb: Object.freeze([0.5, 2] as const),
  veg: Object.freeze([0.75, 2.5] as const),
  fat: Object.freeze([0.5, 1.5] as const),
  condiment: Object.freeze([0.5, 1] as const),
});

export interface CookingPrefs {
  weekdayMinutes: 10 | 20 | 30;
  level: CookingLevel;
  appliances: Appliance[];
  batch: boolean;
}

/** Used when the profile has no cooking answers yet. Frozen: shared by every request. */
export const DEFAULT_COOKING: CookingPrefs = Object.freeze({
  weekdayMinutes: 20,
  level: "basic",
  appliances: Object.freeze(["estufa", "licuadora"]) as Appliance[],
  batch: false,
});

/** Recipe id per day and meal. */
export type RecipeWeek = Record<Day, Record<Slot, string>>;
