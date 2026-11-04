// Checks on data/foods/foods.json (source of truth) and on the generated seed
// migration 012. Strict: no tolerance, because the table in migration 011 has
// check (fiber_g <= carbs_g) and the like.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CATALOG } from "../../supabase/functions/_shared/catalog.ts";
import { buildSeedSql } from "./seedSql.ts";

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const foods = JSON.parse(read("../../data/foods/foods.json"));
const byId = new Map(foods.map((food) => [food.id, food]));
const catalogById = new Map(CATALOG.map((item) => [item.id, item]));

const EXTENDED = [
  "fiberG",
  "freeSugarsG",
  "satFatG",
  "sodiumMg",
  "ironMg",
];

test("same ids as the static catalog", () => {
  assert.deepEqual(
    foods.map((food) => food.id).sort(),
    CATALOG.map((item) => item.id).sort(),
  );
});

test("legacy fields are unchanged", () => {
  for (const food of foods) {
    const item = catalogById.get(food.id);
    assert.ok(item, `${food.id} is not in the catalog`);
    assert.equal(food.nameEs, item.name.es, `${food.id} nameEs`);
    assert.equal(food.nameEn, item.name.en, `${food.id} nameEn`);
    assert.equal(food.pluralEs, item.plural?.es, `${food.id} pluralEs`);
    assert.equal(food.pluralEn, item.plural?.en, `${food.id} pluralEn`);
    assert.equal(food.category, item.category, `${food.id} category`);
    assert.equal(food.unit, item.unit, `${food.id} unit`);
    assert.equal(food.wholeUnits, item.wholeUnits ?? false, `${food.id} wholeUnits`);
    assert.equal(food.gramsPerUnit, item.gramsPerUnit, `${food.id} gramsPerUnit`);
    assert.deepEqual(food.tags, item.tags, `${food.id} tags`);
    assert.equal(food.kcal, item.per100.kcal, `${food.id} kcal`);
    assert.equal(food.proteinG, item.per100.protein, `${food.id} proteinG`);
    assert.equal(food.carbsG, item.per100.carbs, `${food.id} carbsG`);
    assert.equal(food.fatG, item.per100.fat, `${food.id} fatG`);
    assert.equal(food.defaultPack, item.pack, `${food.id} defaultPack`);
    assert.equal(food.refPriceCop, item.price, `${food.id} refPriceCop`);
    assert.equal(food.refPriceSource, item.priceSource, `${food.id} refPriceSource`);
  }
});

test("extended nutrition is plausible and satisfies the table checks", () => {
  for (const food of foods) {
    for (const field of EXTENDED) {
      assert.ok(
        Number.isFinite(food[field]) && food[field] >= 0,
        `${food.id}.${field} must be a finite number >= 0`,
      );
    }
    assert.ok(food.fiberG <= food.carbsG, `${food.id} fiberG <= carbsG`);
    assert.ok(food.freeSugarsG <= food.carbsG, `${food.id} freeSugarsG <= carbsG`);
    assert.ok(food.satFatG <= food.fatG, `${food.id} satFatG <= fatG`);
  }
  assert.ok(byId.get("sal").sodiumMg > 30000);
  assert.ok(byId.get("sal").sodiumMg <= 40000);
  assert.ok(byId.get("azucar").freeSugarsG > 95);
});

test("whole fruit has no free sugars", () => {
  const fruit = [
    "banano", "manzana", "naranja", "mandarina", "pera", "aguacate", "papaya",
    "pina", "mango", "guayaba", "fresa", "mora", "tomate_arbol", "maracuya",
  ];
  for (const id of fruit) {
    assert.equal(byId.get(id).freeSugarsG, 0, id);
  }
});

test("GABA group and fruit/veg flag", () => {
  for (const id of ["papa", "papa_criolla", "yuca", "platano"]) {
    assert.equal(byId.get(id).gabaGroup, "cereales_tuberculos", id);
    assert.equal(byId.get(id).isFruitVeg, false, id);
  }
  const starchy = new Set(["papa", "papa_criolla", "yuca", "platano"]);
  for (const food of foods) {
    if (food.category === "frutas_verduras" && !starchy.has(food.id)) {
      assert.equal(food.isFruitVeg, true, food.id);
    }
  }
  for (const id of ["ajo", "cilantro"]) {
    assert.equal(byId.get(id).isFruitVeg, true, id);
  }
  for (const id of ["lentejas", "frijol", "garbanzo", "arveja_seca"]) {
    assert.equal(byId.get(id).gabaGroup, "proteicos", id);
  }
  assert.equal(byId.get("sal").gabaGroup, null);
});

test("every food cites its source", () => {
  for (const food of foods) {
    assert.ok(["usda", "off"].includes(food.nutritionSource), food.id);
    const pattern = food.nutritionSource === "usda" ? /^\d+$/ : /^\d{8,14}$/;
    assert.match(food.nutritionRef, pattern, food.id);
  }
});

test("seed migration is generated from foods.json", () => {
  assert.equal(
    buildSeedSql(foods),
    read("../../supabase/migrations/012_seed_foods.sql").replaceAll("
", "
"),
  );
});

test("the seed builder clamps extended values that would break the table checks", () => {
  const broken = structuredClone(byId.get("miel"));
  broken.fiberG = broken.carbsG + 5;
  broken.freeSugarsG = broken.carbsG + 5;
  broken.satFatG = broken.fatG + 5;
  const sql = buildSeedSql([broken]);
  const clean = buildSeedSql([{ ...broken, fiberG: broken.carbsG, freeSugarsG: broken.carbsG, satFatG: broken.fatG }]);
  assert.equal(sql, clean);
});

test("seed is deterministic, idempotent and quotes safely", () => {
  const sql = buildSeedSql(foods);
  assert.equal(sql, buildSeedSql([...foods].reverse()));
  assert.match(sql, /on conflict \(id\) do update set/);
  const odd = { ...structuredClone(byId.get("sal")), nameEs: "Sal d'o\ro" };
  assert.match(buildSeedSql([odd]), /'Sal d''o\ro'/);
});
