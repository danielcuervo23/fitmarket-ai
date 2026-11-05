import assert from "node:assert/strict";
import test from "node:test";
import { STATIC_CATALOG } from "../catalog.ts";
import { buildRestrictionRules } from "../planner/restrictions.ts";
import { resolveRecipe } from "./eligibility.ts";
import { expandMeal, lineQty, primaryChoice, recipeName } from "./expand.ts";
import { RECIPES } from "./library.generated.ts";
import { DEFAULT_COOKING } from "./types.ts";

const byId = (id) => RECIPES.find((recipe) => recipe.id === id);

const ctx = (excludedIds = []) => {
  const rules = buildRestrictionRules([], STATIC_CATALOG);
  excludedIds.forEach((id) => rules.excludedIds.add(id));
  return {
    rules,
    catalog: STATIC_CATALOG,
    prices: { carries: () => true, quote: () => { throw new Error("unused"); } },
    stores: [],
    cooking: DEFAULT_COOKING,
  };
};

const r = resolveRecipe(byId("lentejas_con_arroz"), ctx());
const pollo = resolveRecipe(byId("pollo_guisado_con_papa"), ctx());
const qtyOf = (meal, id) => meal.items.find((item) => item.id === id)?.qty;

test("primaryChoice picks the food of every line", () => {
  const choice = primaryChoice(r);

  assert.equal(Object.keys(choice).length, r.lines.length);
  r.lines.forEach((line, index) => assert.equal(choice[index], line.food));
});

test("expandMeal scales each role and keeps fixed lines", () => {
  const meal = expandMeal(r, primaryChoice(r), { protein: 1.5, carb: 1 });

  assert.deepEqual(meal.items.find((i) => i.id === "lentejas").qty, 105);
  assert.equal(meal.items.find((i) => i.id === "sal").qty, 2);
  assert.equal(qtyOf(meal, "arroz_blanco"), 70);
  assert.equal(qtyOf(meal, "zanahoria"), 40); // veg not given: scale 1
  assert.equal(meal.recipeId, "lentejas_con_arroz");
  assert.deepEqual(meal.name, { es: "Lentejas con arroz", en: "Lentils with rice" });
  assert.deepEqual(meal.items.map((item) => item.id), r.lines.map((line) => line.food));
});

test("expandMeal does not round (the optimizer rounds later)", () => {
  const meal = expandMeal(r, primaryChoice(r), { veg: 1.13 });

  assert.equal(qtyOf(meal, "zanahoria"), 40 * 1.13);
});

test("fixed lines ignore any scale", () => {
  const meal = expandMeal(r, primaryChoice(r), { protein: 2, carb: 2, veg: 2, fat: 2 });

  assert.equal(qtyOf(meal, "sal"), 2);
  assert.equal(qtyOf(meal, "ajo"), 3);
});

test("choosing an alternative changes the name when the line is inName", () => {
  const meal = expandMeal(r, { ...primaryChoice(r), 0: "garbanzo" }, { protein: 2 });

  assert.deepEqual(meal.name, { es: "Garbanzos con arroz", en: "Chickpeas with rice" });
  assert.equal(qtyOf(meal, "garbanzo"), 140);
  assert.equal(qtyOf(meal, "lentejas"), undefined);
  assert.deepEqual(recipeName(r, { ...primaryChoice(r), 0: "frijol" }).es, "Fríjoles con arroz");
});

test("choosing an alternative of a non-inName line keeps the name", () => {
  const meal = expandMeal(pollo, { ...primaryChoice(pollo), 0: "pechuga_pollo" }, {});

  assert.deepEqual(meal.name, byId("pollo_guisado_con_papa").name);
  assert.equal(qtyOf(meal, "pechuga_pollo"), 130);
  assert.equal(qtyOf(meal, "pernil_pollo"), undefined);
});

test("an inName swap on a later line also renames (papa criolla)", () => {
  const meal = expandMeal(pollo, { ...primaryChoice(pollo), 1: "papa_criolla" }, {});

  assert.equal(meal.name.es, "Pollo guisado con papa criolla");
});

test("a primary replaced during eligibility keeps its alternative's name", () => {
  const swapped = resolveRecipe(byId("lentejas_con_arroz"), ctx(["lentejas"]));

  assert.equal(expandMeal(swapped, primaryChoice(swapped), {}).name.es, "Fríjoles con arroz");
  assert.equal(expandMeal(swapped, { 0: "garbanzo" }, {}).name.es, "Garbanzos con arroz");
});

test("a food that is not an option of its line is ignored, never served", () => {
  const swapped = resolveRecipe(byId("lentejas_con_arroz"), ctx(["lentejas"]));
  const meal = expandMeal(swapped, { 0: "lentejas", 1: "pechuga_pollo" }, {});

  assert.equal(qtyOf(meal, "lentejas"), undefined);
  assert.equal(qtyOf(meal, "pechuga_pollo"), undefined);
  assert.equal(qtyOf(meal, "frijol"), 70);
  assert.equal(qtyOf(meal, "arroz_blanco"), 70);
});

test("lineQty gives the base qty of the line or of the alternative", () => {
  assert.equal(lineQty(pollo, 0, "pernil_pollo"), 150);
  assert.equal(lineQty(pollo, 0, "pechuga_pollo"), 130);
  assert.throws(() => lineQty(pollo, 0, "lentejas"), /pollo_guisado_con_papa/);
  assert.throws(() => lineQty(pollo, 99, "papa"), /pollo_guisado_con_papa/);
});

test("two lines resolving to the same food become one item", () => {
  const twice = {
    ...r,
    lines: [
      { food: "tomate_chonto", qty: 50, role: "veg" },
      { food: "tomate_chonto", qty: 10, role: "fixed" },
    ],
  };

  assert.deepEqual(expandMeal(twice, primaryChoice(twice), { veg: 2 }).items, [{ id: "tomate_chonto", qty: 110 }]);
});

test("expandMeal returns new objects and leaves the recipe untouched", () => {
  const before = JSON.stringify(r);
  const meal = expandMeal(r, primaryChoice(r), { protein: 2 });

  meal.items[0].qty = 0;
  meal.name.es = "x";
  assert.equal(JSON.stringify(r), before);
});

test("a stray 'fixed' scale never scales fixed lines", () => {
  assert.equal(qtyOf(expandMeal(r, primaryChoice(r), { fixed: 3 }), "sal"), 2);
});

test("an alternative's name is ignored on a line that is not inName", () => {
  const named = {
    ...pollo,
    lines: pollo.lines.map((line, index) =>
      index === 0 ? { ...line, alternatives: [{ food: "pechuga_pollo", qty: 130, name: { es: "Otro", en: "Other" } }] } : line,
    ),
  };

  assert.equal(recipeName(named, { 0: "pechuga_pollo" }).es, "Pollo guisado con papa");
});

test("the name of a chosen alternative is a copy (library names are frozen)", () => {
  const meal = expandMeal(r, { 0: "garbanzo" }, {});

  meal.name.es = "x";
  assert.equal(recipeName(r, { 0: "garbanzo" }).es, "Garbanzos con arroz");
});
