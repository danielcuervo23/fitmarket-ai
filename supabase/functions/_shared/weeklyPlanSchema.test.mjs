import assert from "node:assert/strict";
import test from "node:test";
import { parseWeeklyPlanJson } from "./weeklyPlanSchema.ts";

const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
const SLOTS = ["desayuno", "almuerzo", "cena", "snacks"];
const perMeal = (value) =>
  Object.fromEntries(DAYS.map((day) => [day, Object.fromEntries(SLOTS.map((slot) => [slot, value(day, slot)]))]));

/** A plan as saved before Plan 2: no recipes, notices, compliance or library version. */
const oldPlanFixture = Object.freeze({
  summary: { estimated_total_cop: 180000, estimated_daily_kcal: 2100, savings_note: "Compra en D1" },
  weekly_menu: perMeal(() => ["80 g de avena en hojuelas"]),
  shopping_list: [
    { name: "Avena en hojuelas", quantity: "500 g", estimated_price_cop: 4500, category: "granos", store_id: "D1" },
  ],
});

const recipeInfo = {
  name: { es: "Arroz con pollo", en: "Chicken and rice" },
  minutes: 25,
  level: "basic",
  appliances: ["estufa"],
  batch: true,
  steps: { es: ["Lava el arroz.", "Cocina el pollo."], en: ["Rinse the rice.", "Cook the chicken."] },
};

function newPlan(overrides = {}) {
  return {
    ...structuredClone(oldPlanFixture),
    summary: { ...oldPlanFixture.summary, recipe_library_version: "634ec86b4f72" },
    meal_recipes: perMeal(() => "arroz_con_pollo"),
    recipes: { arroz_con_pollo: structuredClone(recipeInfo) },
    notices: ["fat_blocked_minor"],
    compliance: {
      status: "partial",
      unmet: [
        { rule: "protein_min", target: 90, achieved: 77, unit: "g" },
        { rule: "iodine_min", target: 150, achieved: 60, unit: "ug", unmeasurable: true },
      ],
    },
    ...overrides,
  };
}

test("an old plan without the new fields still parses", () => {
  const { data, error } = parseWeeklyPlanJson(structuredClone(oldPlanFixture));
  assert.equal(error, null);
  assert.ok(data);
  assert.equal(data.recipes, undefined);
  assert.equal(data.notices, undefined);
  assert.equal(data.compliance, undefined);
});

test("a plan with recipes, notices and compliance parses", () => {
  const { data, error } = parseWeeklyPlanJson(newPlan());
  assert.equal(error, null);
  assert.equal(data.summary.recipe_library_version, "634ec86b4f72");
  assert.equal(data.meal_recipes.mie.cena, "arroz_con_pollo");
  assert.deepEqual(data.recipes.arroz_con_pollo, recipeInfo);
  assert.deepEqual(data.notices, ["fat_blocked_minor"]);
  assert.equal(data.compliance.status, "partial");
  assert.equal(data.compliance.unmet.length, 2);
});

test("an unmeasurable rule keeps its flag, so it never reads as met", () => {
  const { data } = parseWeeklyPlanJson(newPlan());
  const [measured, unmeasured] = data.compliance.unmet;
  assert.equal(measured.unmeasurable, undefined);
  assert.equal(unmeasured.unmeasurable, true);
});

test("an unknown notice or rule code still parses (forward compatible)", () => {
  const { data, error } = parseWeeklyPlanJson(
    newPlan({
      notices: ["some_future_notice_2030"],
      compliance: {
        status: "partial",
        unmet: [{ rule: "omega3_future_min", target: 1, achieved: 0.5, unit: "future_unit", note: "extra" }],
      },
    }),
  );
  assert.equal(error, null);
  assert.deepEqual(data.notices, ["some_future_notice_2030"]);
  assert.equal(data.compliance.unmet[0].rule, "omega3_future_min");
});

test("an unknown appliance or level in a recipe still parses (forward compatible)", () => {
  const plan = newPlan();
  plan.recipes.arroz_con_pollo.appliances = ["robot_cocina"];
  plan.recipes.arroz_con_pollo.level = "chef";
  assert.equal(parseWeeklyPlanJson(plan).error, null);
});

test("a step longer than 200 chars is rejected", () => {
  const plan = newPlan();
  plan.recipes.arroz_con_pollo.steps.es[0] = "a".repeat(201);
  assert.equal(parseWeeklyPlanJson(plan).data, null);
});

test("recipe details outside their limits are rejected", () => {
  const bad = [
    (p) => (p.recipes.arroz_con_pollo.minutes = 0),
    (p) => (p.recipes.arroz_con_pollo.minutes = 241),
    (p) => (p.recipes.arroz_con_pollo.minutes = 12.5),
    (p) => (p.recipes.arroz_con_pollo.steps.en = []),
    (p) => (p.recipes.arroz_con_pollo.steps.en = Array(9).fill("Stir.")),
    (p) => (p.recipes["Bad-Id"] = structuredClone(recipeInfo)),
    (p) => (p.recipes = Object.fromEntries(Array.from({ length: 29 }, (_, i) => [`receta_${i}`, structuredClone(recipeInfo)]))),
    (p) => (p.meal_recipes.lun.cena = "x"),
    (p) => (p.notices = [""]),
    (p) => (p.notices = ["n".repeat(41)]),
    (p) => (p.compliance.unmet[0].rule = "r".repeat(41)),
    (p) => (p.compliance.unmet[0].unit = ""),
  ];
  for (const [index, mutate] of bad.entries()) {
    const plan = newPlan();
    mutate(plan);
    assert.equal(parseWeeklyPlanJson(plan).data, null, `case ${index} should be rejected`);
  }
});

test("28 distinct recipes, one per meal, are accepted", () => {
  const ids = DAYS.flatMap((day) => SLOTS.map((slot) => `${day}_${slot}`));
  const plan = newPlan({
    meal_recipes: perMeal((day, slot) => `${day}_${slot}`),
    recipes: Object.fromEntries(ids.map((id) => [id, structuredClone(recipeInfo)])),
  });
  assert.equal(parseWeeklyPlanJson(plan).error, null);
});
