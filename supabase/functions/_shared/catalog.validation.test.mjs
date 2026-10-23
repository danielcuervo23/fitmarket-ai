import assert from "node:assert/strict";
import {
  CATALOG,
  costOf,
  getIngredient,
  gramsOf,
  nutritionOf,
} from "./catalog.ts";

const VALID_TAGS = new Set([
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
]);

// Unique ids, both languages present.
const ids = CATALOG.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, "ingredient ids must be unique");

for (const item of CATALOG) {
  const label = item.id;

  assert.ok(item.name.es && item.name.en, `${label}: needs es and en names`);
  assert.ok(item.price > 0, `${label}: price must be positive`);
  assert.ok(item.pack > 0, `${label}: pack must be positive`);
  // Per g/ml prices are tens of pesos; per-unit prices (eggs, fruit) are
  // hundreds or thousands. A mix-up of the two is the typo worth catching.
  const maxPrice = item.unit === "unit" ? 6000 : 200;
  assert.ok(item.price <= maxPrice, `${label}: price per ${item.unit} looks wrong`);

  for (const tag of item.tags) {
    assert.ok(VALID_TAGS.has(tag), `${label}: unknown tag ${tag}`);
  }

  if (item.unit === "unit") {
    assert.ok(item.gramsPerUnit > 0, `${label}: unit foods need gramsPerUnit`);
  }

  // Atwater check: calories must roughly match the macros (4/4/9 kcal per g).
  // Catches typos in the nutrition table. Fibre and water explain small gaps.
  const { kcal, protein, carbs, fat } = item.per100;
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  const gap = Math.abs(kcal - fromMacros);
  const allowed = Math.max(8, kcal * 0.15);

  assert.ok(
    gap <= allowed,
    `${label}: ${kcal} kcal vs ${fromMacros.toFixed(0)} kcal from macros`,
  );
}

// Dietary tags that the restriction rules rely on.
assert.ok(getIngredient("leche_entera").tags.includes("lactose"));
assert.ok(!getIngredient("leche_deslactosada").tags.includes("lactose"));
assert.ok(getIngredient("leche_deslactosada").tags.includes("dairy"));
assert.ok(getIngredient("lomo_cerdo").tags.includes("pork"));
assert.ok(getIngredient("lomo_cerdo").tags.includes("meat"));
assert.ok(getIngredient("pasta").tags.includes("gluten"));
assert.ok(getIngredient("mani").tags.includes("peanut"));
assert.ok(getIngredient("almendras").tags.includes("tree_nut"));

// Nutrition of a known quantity: 2 eggs = 100 g -> 143 kcal.
assert.equal(gramsOf(getIngredient("huevo"), 2), 100);
assert.equal(Math.round(nutritionOf(getIngredient("huevo"), 2).kcal), 143);

// Cost is for whole packs: 2 eggs still costs a full 12-egg carton...
assert.equal(costOf(getIngredient("huevo"), 2), 12 * 650);
// ...100 g of rice costs a whole 500 g bag, and 600 g costs two bags.
assert.equal(costOf(getIngredient("arroz_blanco"), 100), 500 * 3.6);
assert.equal(costOf(getIngredient("arroz_blanco"), 600), 1000 * 3.6);
assert.equal(costOf(getIngredient("arroz_blanco"), 0), 0);

console.log(`catalog: ${CATALOG.length} ingredients, all checks passed`);
