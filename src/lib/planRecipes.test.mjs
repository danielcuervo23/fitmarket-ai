import assert from "node:assert/strict";
import {
  APPLIANCE_CODES,
  COOKING_LEVEL_CODES,
  NOTICE_CODES,
  RULE_CODES,
  complianceLines,
  hasUnknownNotices,
  isPartialPlan,
  knownAppliances,
  knownLevel,
  knownNotices,
  recipeForMeal,
} from "./planRecipes.ts";

const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
const day = { desayuno: ["a"], almuerzo: ["b"], cena: ["c"], snacks: ["d"] };

/** A plan saved before Plan 2: no recipe fields, no notices, no compliance. */
const oldPlan = {
  summary: { estimated_total_cop: 100000, estimated_daily_kcal: 2000 },
  weekly_menu: Object.fromEntries(DAYS.map((d) => [d, day])),
  shopping_list: [
    { name: "Huevos", quantity: "30", estimated_price_cop: 17000, category: "proteinas", store_id: "D1" },
  ],
};

const omelette = {
  name: { es: "Omelette de espinaca", en: "Spinach omelette" },
  minutes: 10,
  level: "basic",
  appliances: ["estufa"],
  batch: false,
  steps: { es: ["Bate los huevos.", "Cocina 3 minutos."], en: ["Beat the eggs.", "Cook 3 minutes."] },
};
const lentils = {
  name: { es: "Lentejas con arroz", en: "Lentils with rice" },
  minutes: 40,
  level: "comfortable",
  appliances: ["olla_presion", "estufa"],
  batch: true,
  steps: { es: ["Lava las lentejas."], en: ["Rinse the lentils."] },
};
const slots = { desayuno: "omelette_espinaca", almuerzo: "lentejas_arroz", cena: "lentejas_arroz", snacks: "omelette_espinaca" };

const newPlan = {
  ...oldPlan,
  meal_recipes: Object.fromEntries(DAYS.map((d) => [d, slots])),
  recipes: { omelette_espinaca: omelette, lentejas_arroz: lentils },
  notices: ["fat_blocked_minor", "see_professional"],
  compliance: { status: "full", unmet: [] },
};

const partial = (unmet, status = "partial") => ({ ...newPlan, compliance: { status, unmet } });

// --- Old plans: nothing new is shown ---
assert.equal(recipeForMeal(oldPlan, "lun", "almuerzo"), null);
assert.deepEqual(complianceLines(oldPlan), []);
assert.deepEqual(knownNotices(oldPlan), []);
assert.equal(hasUnknownNotices(oldPlan), false);
assert.equal(isPartialPlan(oldPlan), false);

// --- Recipe of a meal ---
assert.deepEqual(recipeForMeal(newPlan, "mar", "almuerzo"), { ...lentils, id: "lentejas_arroz" });
assert.deepEqual(recipeForMeal(newPlan, "dom", "desayuno"), { ...omelette, id: "omelette_espinaca" });
// A meal pointing to a recipe the plan does not describe shows no recipe.
assert.equal(
  recipeForMeal({ ...newPlan, recipes: { omelette_espinaca: omelette } }, "lun", "almuerzo"),
  null,
);
// meal_recipes without recipes (or the other way around): no recipe, no crash.
assert.equal(recipeForMeal({ ...oldPlan, meal_recipes: newPlan.meal_recipes }, "lun", "cena"), null);
assert.equal(recipeForMeal({ ...oldPlan, recipes: newPlan.recipes }, "lun", "cena"), null);
// Inherited object keys are never treated as recipe ids.
assert.equal(
  recipeForMeal(
    { ...newPlan, meal_recipes: { ...newPlan.meal_recipes, lun: { ...slots, cena: "constructor" } } },
    "lun",
    "cena",
  ),
  null,
);

// --- Cooking level and appliances: only codes the web has copy for ---
assert.deepEqual([...COOKING_LEVEL_CODES], ["basic", "comfortable", "enjoys"]);
assert.equal(knownLevel(omelette), "basic");
assert.equal(knownLevel({ ...omelette, level: "chef" }), null);
assert.deepEqual(knownAppliances(lentils), ["olla_presion", "estufa"]);
assert.deepEqual(knownAppliances({ ...lentils, appliances: ["estufa", "teletransportador"] }), ["estufa"]);
for (const a of ["estufa", "microondas", "olla_arrocera", "freidora_aire", "licuadora", "horno", "sandwichera", "olla_presion"]) {
  assert.ok(APPLIANCE_CODES.includes(a), a);
}

// --- Notices ---
assert.deepEqual(knownNotices(newPlan), ["fat_blocked_minor", "see_professional"]);
assert.equal(hasUnknownNotices(newPlan), false);
const withUnknown = { ...newPlan, notices: ["see_professional", "brand_new_notice", "see_professional"] };
assert.deepEqual(knownNotices(withUnknown), ["see_professional"], "unknown filtered, duplicates dropped");
assert.equal(hasUnknownNotices(withUnknown), true);
assert.deepEqual(knownNotices({ ...newPlan, notices: ["constructor", "toString"] }), []);
assert.deepEqual(
  [...NOTICE_CODES].sort(),
  [
    "deficit_capped_energy", "fat_blocked_low_bmi", "fat_blocked_minor", "fat_blocked_senior", "goals_blocked_health",
    "see_professional", "soak_friday_night", "soak_saturday_night",
  ],
);
// Soak reminders (owner decision 2026-11-11) have copy, so they never fall back to the generic line.
const soakPlan = { ...newPlan, notices: ["soak_friday_night", "soak_saturday_night"] };
assert.deepEqual(knownNotices(soakPlan), ["soak_friday_night", "soak_saturday_night"]);
assert.equal(hasUnknownNotices(soakPlan), false);

// --- Every rule code of Task 3 has copy ---
for (const code of [
  "kcal_safety", "protein_safety_max", "protein_muscle_floor", "budget",
  "kcal_range", "protein_min", "protein_max", "carbs_min_muscle", "meal_protein_muscle",
  "fruit_veg_min", "fiber_min", "free_sugar_max", "sodium_max", "fat_max", "sat_fat_max",
  "legumes_week", "distinct_foods_week", "gaba_groups_day", "meal_kcal_share_max",
  "breakfast_protein_min", "breakfast_fiber_min", "iron_sources_week", "cheap_protein_share",
]) {
  assert.ok(RULE_CODES.includes(code), code);
}

// --- Compliance: full plans show no warning ---
assert.equal(isPartialPlan(newPlan), false);
assert.deepEqual(complianceLines(newPlan), []);
// Status "full" wins even if a stray unmet entry is present.
assert.deepEqual(complianceLines(partial([{ rule: "protein_min", target: 1.6, achieved: 1.2, unit: "g_per_kg" }], "full")), []);

// --- Partial plans: percent of the target ---
assert.equal(isPartialPlan(partial([])), true);
assert.deepEqual(
  complianceLines(partial([{ rule: "protein_min", target: 2, achieved: 1.7, unit: "g_per_kg" }])),
  [{ rule: "protein_min", kind: "percent", percent: 85, achieved: 1.7, target: 2 }],
);
// Any status other than "full" is partial (a future server may send new ones).
assert.equal(isPartialPlan(partial([], "almost")), true);
assert.equal(
  complianceLines(partial([{ rule: "fiber_min", target: 25, achieved: 20, unit: "g" }], "almost"))[0].percent,
  80,
);

// Unmeasurable rules are never shown as a percent.
assert.deepEqual(
  complianceLines(partial([{ rule: "sodium_max", target: 1999, achieved: 1200, unit: "mg", unmeasurable: true }])),
  [{ rule: "sodium_max", kind: "unmeasurable" }],
);
// unmeasurable: false is a normal measured rule.
assert.equal(
  complianceLines(partial([{ rule: "fiber_min", target: 25, achieved: 20, unit: "g", unmeasurable: false }]))[0].kind,
  "percent",
);

// target 0 (or a non-finite result) never divides by zero.
assert.deepEqual(
  complianceLines(partial([{ rule: "fiber_min", target: 0, achieved: 5, unit: "g" }])),
  [{ rule: "fiber_min", kind: "notReached" }],
);

// Unknown rule codes collapse into one generic line, after the known ones.
assert.deepEqual(
  complianceLines(partial([
    { rule: "new_rule_a", target: 3, achieved: 1, unit: "count" },
    { rule: "fiber_min", target: 25, achieved: 20, unit: "g" },
    { rule: "new_rule_b", target: 3, achieved: 1, unit: "zz" },
    { rule: "constructor", target: 3, achieved: 1, unit: "count" },
  ])),
  [
    { rule: "fiber_min", kind: "percent", percent: 80, achieved: 20, target: 25 },
    { rule: "", kind: "unknown" },
  ],
);

// A partial plan without any unmet entry still explains itself.
assert.deepEqual(complianceLines(partial([])), [{ rule: "", kind: "unknown" }]);

// Level 5 rules are never reported, even if a server sends them.
assert.deepEqual(
  complianceLines(partial([{ rule: "cheap_protein_share", target: 50, achieved: 30, unit: "pct_protein" }])),
  [{ rule: "", kind: "unknown" }],
);

// --- Untrusted shapes: malformed data never crashes and never shows half a recipe ---
const broken = (info) => ({ ...newPlan, recipes: { ...newPlan.recipes, lentejas_arroz: info } });
for (const info of [
  null,
  "lentejas",
  { ...lentils, name: "Lentejas" },
  { ...lentils, minutes: "40" },
  { ...lentils, minutes: Number.NaN },
  { ...lentils, minutes: 0 },
  { ...lentils, minutes: -5 },
  { ...lentils, appliances: "estufa" },
  { ...lentils, steps: { es: "Lava las lentejas.", en: ["Rinse."] } },
  { ...lentils, steps: { es: [1, 2], en: ["Rinse."] } },
  { ...lentils, batch: "yes" },
]) {
  assert.equal(recipeForMeal(broken(info), "lun", "almuerzo"), null, JSON.stringify(info));
}
assert.deepEqual(knownNotices({ ...newPlan, notices: "see_professional" }), []);
assert.equal(hasUnknownNotices({ ...newPlan, notices: "see_professional" }), false);
assert.deepEqual(complianceLines({ ...newPlan, compliance: { status: "partial", unmet: "x" } }), [
  { rule: "", kind: "unknown" },
]);
assert.deepEqual(
  complianceLines(partial([null, { rule: "fiber_min", target: "25", achieved: 20, unit: "g" }])),
  [{ rule: "fiber_min", kind: "notReached" }, { rule: "", kind: "unknown" }],
);
assert.equal(isPartialPlan({ ...newPlan, compliance: null }), false);

console.log("planRecipes: all checks passed");
