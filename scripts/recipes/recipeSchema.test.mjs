// Checks on the recipe files in data/recipes: the zod shape of one file and the
// cross-file rules (foods exist in foods.json, unit limits, unique ids, file name).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { foodIndex, recipeFileSchema, validateRecipeFiles, validateRecipes } from "./recipeSchema.ts";

const RECIPES_DIR = new URL("../../data/recipes/", import.meta.url);
const foods = JSON.parse(readFileSync(new URL("../../data/foods/foods.json", import.meta.url), "utf8"));
const { foodIds, foodUnits } = foodIndex(foods);

const fileNames = () => readdirSync(RECIPES_DIR).filter((name) => name.endsWith(".json")).sort();
const readRecipe = (name) => JSON.parse(readFileSync(new URL(name, RECIPES_DIR), "utf8"));
const loadAll = () => fileNames().map(readRecipe);
const base = () => readRecipe("lentejas_con_arroz.json");
const withLine = (recipe, line) => ({ ...recipe, lines: [...recipe.lines, line] });
const errorsOf = (recipe) => validateRecipes([recipe], foodIds, foodUnits);

const SEEDS = [
  "arroz_con_huevo_y_tomate.json",
  "avena_con_banano.json",
  "huevos_pericos_con_arepa.json",
  "lentejas_con_arroz.json",
  "pollo_guisado_con_papa.json",
  "yogur_con_fruta.json",
];

test("the six seed recipes exist and are valid", () => {
  for (const seed of SEEDS) assert.ok(fileNames().includes(seed), seed);
  assert.deepEqual(validateRecipes(loadAll(), foodIds, foodUnits), []);
});

test("every seed is an AI draft waiting for the owner's OK", () => {
  for (const recipe of loadAll()) {
    assert.equal(recipe.status, "pending_owner_ok", recipe.id);
    assert.equal(recipe.source, "ai_draft", recipe.id);
  }
});

test("lentejas_con_arroz names its swappable legume and pollo_guisado_con_papa is batch", () => {
  const lentejas = base();
  const legume = lentejas.lines.find((line) => line.food === "lentejas");
  assert.equal(legume.inName, true);
  assert.deepEqual(legume.alternatives.map((alt) => alt.food), ["frijol", "garbanzo"]);
  assert.deepEqual(legume.alternatives[0].name, { es: "Fríjoles con arroz", en: "Beans with rice" });
  assert.equal(readRecipe("pollo_guisado_con_papa.json").batch.ok, true);
});

test("unknown food is rejected with the recipe id", () => {
  assert.match(errorsOf(withLine(base(), { food: "caviar", qty: 10, role: "protein" }))[0], /lentejas_con_arroz.*caviar/);
});

test("unknown alternative food is rejected with the recipe id", () => {
  const recipe = withLine(base(), { food: "pasta", qty: 50, role: "carb", alternatives: [{ food: "trufa", qty: 5 }] });
  assert.match(errorsOf(recipe)[0], /lentejas_con_arroz.*trufa/);
});

test("an inName line needs a name on each alternative", () => {
  const recipe = base();
  const legume = recipe.lines.find((line) => line.food === "lentejas");
  delete legume.alternatives[1].name;
  assert.equal(recipeFileSchema.safeParse(recipe).success, false);
  assert.match(errorsOf(recipe)[0], /lentejas_con_arroz/);
});

test("alternatives must be distinct and different from the line food", () => {
  const same = base();
  same.lines[0].alternatives = [{ food: same.lines[0].food, qty: 70, name: { es: "a", en: "a" } }];
  assert.equal(recipeFileSchema.safeParse(same).success, false);
  const repeated = base();
  repeated.lines[0].alternatives = [
    { food: "frijol", qty: 70, name: { es: "a", en: "a" } },
    { food: "frijol", qty: 80, name: { es: "b", en: "b" } },
  ];
  assert.equal(recipeFileSchema.safeParse(repeated).success, false);
});

test("steps in es and en must have the same count and <= 160 chars", () => {
  const uneven = base();
  uneven.steps.en = uneven.steps.en.slice(1);
  assert.equal(recipeFileSchema.safeParse(uneven).success, false);
  const long = base();
  long.steps.es[0] = "a".repeat(161);
  assert.equal(recipeFileSchema.safeParse(long).success, false);
  const many = base();
  many.steps = { es: Array(9).fill("Paso."), en: Array(9).fill("Step.") };
  assert.equal(recipeFileSchema.safeParse(many).success, false);
  const none = base();
  none.steps = { es: [], en: [] };
  assert.equal(recipeFileSchema.safeParse(none).success, false);
});

test("more than 4 units of a unit food is rejected", () => {
  assert.match(errorsOf(withLine(base(), { food: "huevo", qty: 5, role: "protein" }))[0], /lentejas_con_arroz.*huevo/);
  assert.deepEqual(errorsOf(withLine(base(), { food: "huevo", qty: 4, role: "protein" })), []);
  assert.deepEqual(errorsOf(withLine(base(), { food: "pasta", qty: 5, role: "carb" })), []);
});

test("file name must equal id", () => {
  const files = [{ fileName: "lentejas.json", data: base() }];
  assert.match(validateRecipeFiles(files, foodIds, foodUnits)[0], /lentejas\.json.*lentejas_con_arroz/);
  assert.deepEqual(validateRecipeFiles([{ fileName: "lentejas_con_arroz.json", data: base() }], foodIds, foodUnits), []);
});

test("two files with the same id are rejected", () => {
  assert.match(validateRecipes([base(), base()], foodIds, foodUnits)[0], /duplicate.*lentejas_con_arroz/);
});

test("id, slots, minutes, appliances and batch days are checked", () => {
  const cases = [
    (r) => { r.id = "Lentejas"; },
    (r) => { r.id = "ab"; },
    (r) => { r.slots = []; },
    (r) => { r.slots = ["almuerzo", "almuerzo"]; },
    (r) => { r.slots = ["onces"]; },
    (r) => { r.minutes = 0; },
    (r) => { r.minutes = 121; },
    (r) => { r.appliances = []; },
    (r) => { r.appliances = ["estufa", "estufa"]; },
    (r) => { r.appliances = ["fogon"]; },
    (r) => { r.batch = { ok: true, keepsDays: 5 }; },
    (r) => { r.batch = { ok: true, keepsDays: 0 }; },
    (r) => { r.level = "chef"; },
    (r) => { r.status = "approved_by_ai"; },
  ];
  for (const change of cases) {
    const recipe = base();
    change(recipe);
    assert.equal(recipeFileSchema.safeParse(recipe).success, false, change.toString());
  }
});

test("lines: 1 to 10, at least one scalable, positive quantities", () => {
  const cases = [
    (r) => { r.lines = []; },
    (r) => { r.lines = Array.from({ length: 11 }, () => ({ food: "sal", qty: 1, role: "fixed" })); },
    (r) => { r.lines = r.lines.map((line) => ({ food: line.food, qty: line.qty, role: "fixed" })); },
    (r) => { r.lines[0].qty = 0; },
    (r) => { r.lines[0].role = "sauce"; },
  ];
  for (const change of cases) {
    const recipe = base();
    change(recipe);
    assert.equal(recipeFileSchema.safeParse(recipe).success, false, change.toString());
  }
});

test("scale ranges must satisfy 0 < min <= 1 <= max <= 3", () => {
  const ok = base();
  ok.scale = { protein: [0.5, 2], veg: [1, 3] };
  assert.equal(recipeFileSchema.safeParse(ok).success, true);
  for (const range of [[0, 2], [1.2, 2], [0.5, 0.9], [0.5, 3.5]]) {
    const recipe = base();
    recipe.scale = { carb: range };
    assert.equal(recipeFileSchema.safeParse(recipe).success, false, JSON.stringify(range));
  }
  const fixed = base();
  fixed.scale = { fixed: [0.5, 2] };
  assert.equal(recipeFileSchema.safeParse(fixed).success, false);
});

test("unknown fields are rejected, not silently stripped", () => {
  const top = base();
  top.calories = 500;
  assert.equal(recipeFileSchema.safeParse(top).success, false);
  const line = base();
  line.lines[0].brand = "x";
  assert.equal(recipeFileSchema.safeParse(line).success, false);
});
