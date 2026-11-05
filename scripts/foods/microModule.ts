import { foodsFileSchema, type FoodJson } from "./foodSchema.ts";
import { clampToMacros } from "./nutrients.ts";

// Pure builder of supabase/functions/_shared/catalogMicro.generated.ts: the
// static copy of each food's micro-nutrients, used when the database cannot be
// read. Deterministic (sorted by id) and validated by the same schema as the
// seed. Values are clamped exactly like migration 012, so the static copy and
// the table always agree.

const MICRO_FIELDS = ["fiberG", "freeSugarsG", "satFatG", "sodiumMg", "ironMg"] as const;

function entry(food: FoodJson): string {
  const values = { ...food, ...clampToMacros(food).values };
  const numbers = MICRO_FIELDS.map((field) => `${field}: ${values[field]}`);
  const gaba = values.gabaGroup === null ? "null" : JSON.stringify(values.gabaGroup);

  return `  ${JSON.stringify(food.id)}: { ${numbers.join(", ")}, gabaGroup: ${gaba}, isFruitVeg: ${values.isFruitVeg} },`;
}

export function buildMicroModule(input: readonly unknown[]): string {
  const foods = foodsFileSchema
    .parse(input)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return [
    "// FitMarket AI: micronutrientes de cada alimento (copia estática, por 100 g / 100 ml).",
    "// GENERADO por scripts/foods/build-seed.ts a partir de data/foods/foods.json.",
    "// No editar a mano: cambia el JSON y vuelve a generar.",
    "",
    'import type { MicroNutrients } from "./catalog.ts";',
    "",
    "export const STATIC_MICRO: Readonly<Record<string, MicroNutrients>> = {",
    ...foods.map(entry),
    "};",
    "",
  ].join("\n");
}
