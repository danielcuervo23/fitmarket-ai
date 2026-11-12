// Salt and cooking oil in the recipe files (owner decision 2026-11-12: less salt
// and oil, the health rules stay as they are).
//
// - Salt: at most 1 g per portion (whole grams are the smallest amount a plan
//   shows), and none where a salty food already seasons the dish (canned tuna or
//   sardines, or 40 g or more of cheese).
// - Cooking oil: at most 5 ml per portion, role "condiment" so the optimizer may
//   use less (down to half), never more.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DEFAULT_ROLE_SCALE } from "../../supabase/functions/_shared/recipes/types.ts";
import { recipeFileSchema } from "./recipeSchema.ts";

const RECIPES_DIR = new URL("../../data/recipes/", import.meta.url);
const recipes = readdirSync(RECIPES_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(new URL(name, RECIPES_DIR), "utf8")));

const OILS = new Set(["aceite_vegetal", "aceite_oliva"]);
const SALTY = new Set(["atun_lata", "sardina_lata"]);
const CHEESES = new Set(["queso_campesino", "queso_mozzarella"]);
const foodsOf = (line) => [line.food, ...(line.alternatives ?? []).map((alt) => alt.food)];

test("salt: at most 1 g per portion, and always a fixed line", () => {
  for (const recipe of recipes) {
    for (const line of recipe.lines.filter((l) => l.food === "sal")) {
      assert.ok(line.qty <= 1, `${recipe.id}: ${line.qty} g of salt`);
      assert.equal(line.role, "fixed", recipe.id);
    }
  }
});

test("no added salt where canned fish or 40 g of cheese already season the dish", () => {
  for (const recipe of recipes) {
    const salty = recipe.lines.some(
      (line) => foodsOf(line).some((food) => SALTY.has(food)) || (CHEESES.has(line.food) && line.qty >= 40),
    );
    if (salty) assert.ok(!recipe.lines.some((line) => line.food === "sal"), recipe.id);
  }
});

test("cooking oil: at most 5 ml per portion, role condiment", () => {
  let oilLines = 0;
  for (const recipe of recipes) {
    for (const line of recipe.lines.filter((l) => OILS.has(l.food))) {
      oilLines += 1;
      assert.equal(line.role, "condiment", recipe.id);
      for (const qty of [line.qty, ...(line.alternatives ?? []).map((alt) => alt.qty)]) {
        assert.ok(qty <= 5, `${recipe.id}: ${qty} ml of oil`);
      }
    }
  }
  assert.ok(oilLines >= 25, `${oilLines}`);
});

test("a condiment may shrink to half, never grow; a recipe cannot override that", () => {
  assert.deepEqual([...DEFAULT_ROLE_SCALE.condiment], [0.5, 1]);
  const recipe = structuredClone(recipes.find((r) => r.id === "lentejas_con_arroz"));
  assert.equal(recipeFileSchema.safeParse(recipe).success, true);
  recipe.scale = { condiment: [0.5, 2] };
  assert.equal(recipeFileSchema.safeParse(recipe).success, false);
});
