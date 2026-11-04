import { foodsFileSchema, type FoodJson } from "./foodSchema.ts";
import { clampToMacros } from "./nutrients.ts";

// Pure builder of migration 012. Deterministic (sorted by id) and safe to
// re-run: every row is an upsert on the primary key. Values go through the
// schema first, strings are quoted by `text`, numbers are finite by schema.

const COLUMNS = [
  "id",
  "name_es",
  "name_en",
  "plural_es",
  "plural_en",
  "shopping_category",
  "unit",
  "whole_units",
  "grams_per_unit",
  "diet_tags",
  "kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "free_sugars_g",
  "sat_fat_g",
  "sodium_mg",
  "iron_mg",
  "gaba_group",
  "is_fruit_veg",
  "default_pack",
  "ref_price_cop",
  "ref_price_source",
  "nutrition_source",
  "nutrition_ref",
] as const;

const text = (value: string | null | undefined): string =>
  value === null || value === undefined
    ? "null"
    : `'${value.replaceAll("'", "''")}'`;

const num = (value: number | undefined): string =>
  value === undefined ? "null" : String(value);

const bool = (value: boolean): string => (value ? "true" : "false");

const tags = (value: readonly string[]): string =>
  value.length === 0
    ? "'{}'::text[]"
    : `array[${value.map((tag) => text(tag)).join(", ")}]::text[]`;

/** Extended fields capped to the legacy macros, so the table checks always hold. */
function clamped(food: FoodJson): FoodJson {
  return { ...food, ...clampToMacros(food).values };
}

/** Clamps that building the seed would apply (empty when foods.json is clean). */
export function seedClamps(foods: readonly FoodJson[]): string[] {
  return foods.flatMap((food) => clampToMacros(food).clamps);
}

function row(food: FoodJson): string {
  const values = [
    text(food.id),
    text(food.nameEs),
    text(food.nameEn),
    text(food.pluralEs),
    text(food.pluralEn),
    text(food.category),
    text(food.unit),
    bool(food.wholeUnits),
    num(food.gramsPerUnit),
    tags(food.tags),
    num(food.kcal),
    num(food.proteinG),
    num(food.carbsG),
    num(food.fatG),
    num(food.fiberG),
    num(food.freeSugarsG),
    num(food.satFatG),
    num(food.sodiumMg),
    num(food.ironMg),
    text(food.gabaGroup),
    bool(food.isFruitVeg),
    num(food.defaultPack),
    num(food.refPriceCop),
    text(food.refPriceSource),
    text(food.nutritionSource),
    text(food.nutritionRef),
  ];
  return `  (${values.join(", ")})`;
}

export function buildSeedSql(input: readonly unknown[]): string {
  const foods = foodsFileSchema
    .parse(input)
    .map(clamped)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const updates = COLUMNS.filter((column) => column !== "id")
    .map((column) => `  ${column} = excluded.${column}`)
    .join(",\n");

  return [
    "-- FitMarket AI: carga inicial del catálogo de alimentos (public.foods).",
    "-- GENERADO por scripts/foods/build-seed.ts a partir de data/foods/foods.json.",
    "-- No editar a mano: cambia el JSON y vuelve a generar.",
    "-- Nutrición ampliada: USDA FoodData Central (dominio público) y Open Food Facts (ODbL).",
    "-- Ver docs/DATA_SOURCES.md. Idempotente: se puede ejecutar más de una vez.",
    "",
    `insert into public.foods (${COLUMNS.join(", ")})`,
    "values",
    `${foods.map(row).join(",\n")}`,
    "on conflict (id) do update set",
    `${updates};`,
    "",
  ].join("\n");
}
