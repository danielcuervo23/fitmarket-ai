// Generates supabase/migrations/012_seed_foods.sql from data/foods/foods.json.
// Usage: node scripts/foods/build-seed.ts
// Logs every extended value that had to be clamped to the legacy macros.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { foodsFileSchema } from "./foodSchema.ts";
import { buildSeedSql, seedClamps } from "./seedSql.ts";

const FOODS_PATH = fileURLToPath(
  new URL("../../data/foods/foods.json", import.meta.url),
);
const OUT_PATH = fileURLToPath(
  new URL("../../supabase/migrations/012_seed_foods.sql", import.meta.url),
);

const foods = foodsFileSchema.parse(JSON.parse(readFileSync(FOODS_PATH, "utf8")));

const clamps = seedClamps(foods);
clamps.forEach((line) => console.log(`clamp ${line}`));

writeFileSync(OUT_PATH, buildSeedSql(foods));
console.log(`Wrote ${OUT_PATH} (${foods.length} foods, ${clamps.length} clamps)`);
