import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG, getIngredient } from "../catalog.ts";
import { calcTargets } from "../nutrition.ts";
import {
  assemblePlan,
  dayNutrition,
  mealLine,
  complianceFromShortfalls,
  roundQty,
  totalsByIngredient,
  weekCost,
  weekStats,
} from "./build.ts";
import { explainRestriction } from "./restrictions.ts";
import { cheapestStore, carriedByAny } from "./stores.ts";
import { allowedCatalog, buildRestrictionRules } from "./restrictions.ts";
import { DAYS, SLOTS } from "./types.ts";
import { parseWeeklyPlanJson } from "../weeklyPlanSchema.ts";

const meal = (name, ...items) => ({
  name: { es: name, en: name },
  items: items.map(([id, qty]) => ({ id, qty })),
});

/** A plausible week an AI could return (every day the same, for simplicity). */
function sampleWeek(overrides = {}) {
  const day = {
    desayuno: meal("Avena con banano", ["avena", 60], ["banano", 1], ["leche_entera", 200]),
    almuerzo: meal("Arroz con pollo", ["arroz_blanco", 90], ["pechuga_pollo", 150], ["zanahoria", 80], ["aceite_vegetal", 8]),
    cena: meal("Huevos con arepa", ["huevo", 2], ["harina_maiz", 70], ["tomate_chonto", 80], ["queso_campesino", 40]),
    snacks: meal("Fruta", ["manzana", 1], ["mani", 20]),
    ...overrides,
  };

  return Object.fromEntries(DAYS.map((d) => [d, day]));
}

const woman = { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" };
const targets = calcTargets(woman, ["healthy"]);
const STORES = ["Exito", "D1"];

// ---------------------------------------------------------------- restrictions
{
  const vegan = buildRestrictionRules(["vegan"]);
  const allowed = new Set(allowedCatalog(vegan).map((i) => i.id));
  for (const forbidden of ["huevo", "leche_entera", "pechuga_pollo", "atun_lata", "miel", "queso_campesino", "mantequilla"]) {
    assert.ok(!allowed.has(forbidden), `vegan must exclude ${forbidden}`);
  }
  for (const fine of ["lentejas", "arroz_blanco", "banano", "aceite_vegetal"]) {
    assert.ok(allowed.has(fine), `vegan must allow ${fine}`);
  }

  const lactose = buildRestrictionRules(["lactose"]);
  const lactoseAllowed = new Set(allowedCatalog(lactose).map((i) => i.id));
  assert.ok(!lactoseAllowed.has("leche_entera"));
  assert.ok(lactoseAllowed.has("leche_deslactosada"), "lactose-free milk is fine");
  assert.ok(lactoseAllowed.has("huevo"), "eggs have no lactose");

  const vegetarian = buildRestrictionRules(["vegetarian"]);
  const vegAllowed = new Set(allowedCatalog(vegetarian).map((i) => i.id));
  assert.ok(vegAllowed.has("huevo") && vegAllowed.has("queso_campesino"));
  assert.ok(!vegAllowed.has("atun_lata") && !vegAllowed.has("lomo_cerdo"));

  // Free text is matched against the catalog, in Spanish or English.
  const free = buildRestrictionRules(["cilantro", "Pollo", "soya"]);
  assert.ok(free.excludedIds.has("cilantro"));
  assert.ok(free.excludedIds.has("pechuga_pollo") && free.excludedIds.has("pernil_pollo"));
  assert.ok(!free.excludedIds.has("lomo_cerdo"), "'pollo' must not exclude pork");
  assert.deepEqual(free.unmatchedText, ["soya"]);

  // In Colombia "granos" are the pulses (frijol, lentejas, garbanzo, arveja),
  // not rice, pasta, oats, bread or arepas.
  const grains = buildRestrictionRules(["granos"]);
  assert.deepEqual([...grains.excludedIds].sort(), ["arveja_seca", "frijol", "garbanzo", "lentejas"]);
  assert.deepEqual(grains.unmatchedText, []);
  const legumes = buildRestrictionRules(["Legumbres"]);
  assert.deepEqual([...legumes.excludedIds].sort(), [...grains.excludedIds].sort());
  const cereals = buildRestrictionRules(["cereales"]);
  assert.ok(cereals.excludedIds.has("avena") && !cereals.excludedIds.has("lentejas"));

  // Colombian and regional names, plurals and typos are understood.
  const ids = (text) => explainRestriction(text).ingredients.map((i) => i.id);
  assert.deepEqual(ids("auyama"), ["ahuyama"]);
  assert.deepEqual(ids("Aguacte"), ["aguacate"], "one typo is forgiven");
  assert.deepEqual(ids("cuajada"), ["queso_campesino"]);
  assert.deepEqual(ids("cebolla larga"), ["cebolla_junca"], "all words must fit when they can");
  assert.deepEqual(ids("tomate"), ["tomate_chonto"], "tomate is not tomate de árbol");
  assert.ok(ids("papas").includes("papa") && ids("papas").includes("papa_criolla"));
  assert.ok(ids("verduras").includes("zanahoria") && !ids("verduras").includes("mango"));
  assert.ok(ids("frutas").includes("mango") && !ids("frutas").includes("zanahoria"));
  assert.ok(ids("huevos").includes("huevo") && ids("Huevos").length === 1);
  assert.equal(explainRestriction("agua").matched, false, "generic words exclude nothing");
  assert.equal(explainRestriction("zzzz").matched, false);

  assert.ok(buildRestrictionRules(["peanuts"]).excludedIds.has("mani"));
  assert.ok(buildRestrictionRules(["nueces"]).excludedTags.has("tree_nut"));
}

// --------------------------------------------------------------------- cost
{
  const week = sampleWeek();
  const cost = weekCost(week, 1, STORES);
  assert.ok(cost > 20_000 && cost < 400_000, `weekly cost looks off: ${cost}`);

  // Household of 3 buys more (cost rises, though packs make it sub-linear).
  assert.ok(weekCost(week, 3, STORES) > cost * 1.5);
}

// ---------------------------------------------------------------- assembly
{
  const week = sampleWeek();
  const plan = assemblePlan(week, { householdSize: 2, stores: ["Exito", "D1"], targets });

  assert.equal(plan.summary.household_size, 2);
  assert.equal(plan.summary.estimated_total_cop, weekCost(week, 2, STORES));
  assert.equal(
    plan.shopping_list.reduce((sum, item) => sum + item.estimated_price_cop, 0),
    plan.summary.estimated_total_cop,
    "list total must equal the summary total",
  );
  assert.equal(plan.summary.estimated_daily_kcal, weekStats(week).avgKcal);
  assert.equal(
    plan.summary.estimated_daily_kcal,
    Math.round(DAYS.reduce((sum, day) => sum + dayNutrition(week, day).kcal, 0) / 7),
  );

  // Everything comes from the cheaper of the user's stores (here D1 beats Exito).
  const chicken = plan.shopping_list.find((i) => i.name === "Pechuga de pollo");
  const rice = plan.shopping_list.find((i) => i.name === "Arroz blanco");
  assert.equal(chicken.store_id, "D1");
  assert.equal(rice.store_id, "D1");
  assert.ok(chicken.name_en && rice.name_en);

  // Purchase quantities are whole packs: rice is bought in 500 g bags.
  assert.match(rice.quantity, /^(\d+(\.\d)? kg|\d+ g)$/);

  // Lines are readable in both languages and keep a number the checks need.
  assert.equal(mealLine(getIngredient("avena"), 60, "es"), "60 g de avena en hojuelas");
  assert.equal(mealLine(getIngredient("avena"), 60, "en"), "60 g rolled oats");
  assert.equal(mealLine(getIngredient("huevo"), 2, "es"), "2 huevos");
  assert.equal(mealLine(getIngredient("huevo"), 1, "en"), "1 egg");
  assert.equal(mealLine(getIngredient("aguacate"), 0.5, "es"), "1/2 aguacate");
  assert.equal(mealLine(getIngredient("aguacate"), 1.5, "es"), "1,5 aguacates");
  assert.equal(mealLine(getIngredient("aguacate"), 1.5, "en"), "1.5 avocados");
  assert.ok(plan.weekly_menu.lun.desayuno.every((line) => /\d/.test(line)));
  assert.ok(plan.dish_names.lun.cena.es && plan.dish_names.lun.cena.en);
}

// ------------------------------------------------------------------- stores
{
  // The user's complaint: eggs must not be bought at Jumbo when D1 is cheaper.
  const eggs = getIngredient("huevo");
  assert.equal(cheapestStore(eggs, ["Jumbo", "D1"]).store, "D1");
  assert.equal(cheapestStore(eggs, ["D1", "Ara", "Jumbo"]).store, "D1");

  // Fresh produce is cheapest at Ara, so Ara gets used when it is selected.
  assert.equal(cheapestStore(getIngredient("tomate_chonto"), ["D1", "Ara", "Jumbo"]).store, "Ara");

  // Foods the discount chains do not stock fall back to a store that has them.
  assert.equal(cheapestStore(getIngredient("salmon"), ["D1", "Ara", "Jumbo"]).store, "Jumbo");
  assert.equal(carriedByAny(["D1", "Ara"], "salmon"), false);
  assert.equal(carriedByAny(["D1", "Jumbo"], "salmon"), true);

  // A plan with all three stores uses more than one of them.
  const week = sampleWeek();
  const plan = assemblePlan(week, { householdSize: 1, stores: ["D1", "Ara", "Jumbo"], targets });
  const used = new Set(plan.shopping_list.map((item) => item.store_id));
  assert.ok(used.has("D1") && used.has("Ara"), "D1 and Ara should both be used");
  assert.ok(!used.has("Jumbo"), "nothing here needs the expensive store");
  assert.equal(
    plan.shopping_list.reduce((s, i) => s + i.estimated_price_cop, 0),
    weekCost(week, 1, ["D1", "Ara", "Jumbo"]),
  );

  // Buying at the cheaper stores really costs less than at Jumbo alone.
  assert.ok(weekCost(week, 1, ["D1", "Ara"]) < weekCost(week, 1, ["Jumbo"]));
}

// ---------------------------------------------------------------- plan output (recipes, notices, compliance)
const recipeOf = (id, es) => ({
  id,
  status: "pending_owner_ok",
  source: "ai_draft",
  name: { es, en: `${es} (en)` },
  slots: ["desayuno", "almuerzo", "cena", "snacks"],
  minutes: 15,
  level: "basic",
  appliances: ["estufa"],
  batch: { ok: true, keepsDays: 3 },
  lines: [{ food: "huevo", qty: 2, role: "protein" }],
  steps: { es: ["Paso uno."], en: ["Step one."] },
  weekendOnly: false,
});

const RECIPE_IDS = { desayuno: "avena_banano", almuerzo: "arroz_pollo", cena: "huevos_arepa", snacks: "fruta_mani" };
const LIBRARY = new Map(
  [...Object.values(RECIPE_IDS), "receta_no_usada"].map((id) => [id, recipeOf(id, `Receta ${id}`)]),
);

function recipeWeek() {
  const week = structuredClone(sampleWeek());
  for (const day of DAYS) for (const slot of SLOTS) week[day][slot].recipeId = RECIPE_IDS[slot];
  return week;
}

test("roundQty is exported and rounds like the plan does", () => {
  assert.equal(roundQty(getIngredient("huevo"), 1.4), 1);
  assert.equal(roundQty(getIngredient("arroz_blanco"), 87), 85);
});

test("an assembled plan without recipe options has none of the new fields", () => {
  const plan = assemblePlan(recipeWeek(), { householdSize: 1, stores: STORES, targets });
  for (const key of ["meal_recipes", "recipes", "notices", "compliance"]) assert.ok(!(key in plan), key);
  assert.ok(!("recipe_library_version" in plan.summary));
});

test("assemblePlan embeds only the recipes used and their names", () => {
  const plan = assemblePlan(recipeWeek(), { householdSize: 1, stores: STORES, targets, recipes: LIBRARY });
  assert.deepEqual(Object.keys(plan.recipes).sort(), Object.values(RECIPE_IDS).sort());
  assert.equal(plan.meal_recipes.vie.almuerzo, "arroz_pollo");
  assert.deepEqual(plan.recipes.arroz_pollo, {
    name: { es: "Receta arroz_pollo", en: "Receta arroz_pollo (en)" },
    minutes: 15,
    level: "basic",
    appliances: ["estufa"],
    batch: true,
    steps: { es: ["Paso uno."], en: ["Step one."] },
  });
  assert.match(plan.summary.recipe_library_version, /^[0-9a-f]{12}$/);
});

test("recipe details are copies: changing the plan never touches the library", () => {
  const plan = assemblePlan(recipeWeek(), { householdSize: 1, stores: STORES, targets, recipes: LIBRARY });
  plan.recipes.arroz_pollo.steps.es.push("x");
  plan.recipes.arroz_pollo.appliances.push("horno");
  assert.deepEqual(LIBRARY.get("arroz_pollo").steps.es, ["Paso uno."]);
  assert.deepEqual(LIBRARY.get("arroz_pollo").appliances, ["estufa"]);
});

test("a week with a meal outside the recipe map carries no recipe fields", () => {
  const week = recipeWeek();
  delete week.mar.cena.recipeId;
  const plan = assemblePlan(week, { householdSize: 1, stores: STORES, targets, recipes: LIBRARY });
  assert.ok(!("meal_recipes" in plan) && !("recipes" in plan));
});

test("notices and compliance are passed into the plan", () => {
  const compliance = { status: "full", unmet: [] };
  const plan = assemblePlan(recipeWeek(), {
    householdSize: 1, stores: STORES, targets, notices: ["fat_blocked_minor"], compliance,
  });
  assert.deepEqual(plan.notices, ["fat_blocked_minor"]);
  assert.deepEqual(plan.compliance, compliance);
});

test("a compliance marked full but with unmet rules is reported as partial", () => {
  const unmet = [{ rule: "iodine_min", target: 150, achieved: 60, unit: "ug", unmeasurable: true }];
  const plan = assemblePlan(recipeWeek(), { householdSize: 1, stores: STORES, targets, compliance: { status: "full", unmet } });
  assert.equal(plan.compliance.status, "partial");
  assert.deepEqual(plan.compliance.unmet, unmet);
});

test("complianceFromShortfalls: no shortfalls is full", () => {
  assert.deepEqual(complianceFromShortfalls([]), { status: "full", unmet: [] });
});

test("complianceFromShortfalls: unmeasurable rules are unmet and flagged, never met", () => {
  const compliance = complianceFromShortfalls([
    { rule: "protein_min", level: 3, unit: "g", target: 90, achieved: 77 },
    { rule: "fiber_min", level: 4, unit: "g", target: 25, achieved: 20, unmeasurable: true },
  ]);
  assert.deepEqual(compliance, {
    status: "partial",
    unmet: [
      { rule: "protein_min", target: 90, achieved: 77, unit: "g" },
      { rule: "fiber_min", target: 25, achieved: 20, unit: "g", unmeasurable: true },
    ],
  });
});

test("shopping quantities use the household factor", () => {
  const week = recipeWeek();
  const asked = new Map();
  const prices = {
    carries: () => true,
    quote(ingredient, qty, stores) {
      asked.set(ingredient.id, qty);
      return { store: stores[0], packs: Math.ceil(qty / ingredient.pack), packSize: ingredient.pack, costCop: 1000, source: "estimate" };
    },
  };
  const plan = assemblePlan(week, { householdSize: 2, householdFactor: 1.8, stores: STORES, targets, prices });
  const perPerson = totalsByIngredient(week, 1);
  for (const [id, qty] of perPerson) assert.ok(Math.abs(asked.get(id) - qty * 1.8) < 1e-9, id);
  assert.equal(plan.summary.household_size, 2, "the summary keeps the number of people");
});

test("without a household factor, shopping is for householdSize portions", () => {
  const week = recipeWeek();
  const plan = assemblePlan(week, { householdSize: 3, stores: STORES, targets });
  assert.equal(plan.summary.estimated_total_cop, weekCost(week, 3, STORES));
});

test("an assembled plan with recipes, notices and compliance passes the shared schema", () => {
  const plan = assemblePlan(recipeWeek(), {
    householdSize: 2, householdFactor: 1.8, stores: STORES, targets, recipes: LIBRARY,
    notices: ["see_professional"],
    compliance: complianceFromShortfalls([{ rule: "fiber_min", level: 4, unit: "g", target: 25, achieved: 20, unmeasurable: true }]),
  });
  const { data, error } = parseWeeklyPlanJson(JSON.parse(JSON.stringify(plan)));
  assert.equal(error, null);
  assert.equal(data.compliance.unmet[0].unmeasurable, true);
  assert.equal(Object.keys(data.recipes).length, 4);
});

test("complianceFromShortfalls: level 5 is never reported", () => {
  assert.deepEqual(
    complianceFromShortfalls([{ rule: "cheap_protein_share", level: 5, unit: "%", target: 50, achieved: 30 }]),
    { status: "full", unmet: [] },
  );
});

test("a plan whose only shortfall is level 5 is full with nothing unmet", () => {
  const compliance = complianceFromShortfalls([{ rule: "cheap_protein_share", level: 5, unit: "%", target: 50, achieved: 30 }]);
  const plan = assemblePlan(recipeWeek(), { householdSize: 1, stores: STORES, targets, compliance });
  assert.deepEqual(plan.compliance, { status: "full", unmet: [] });
});

test("assemblePlan derives the status from the unmet rules: none left means full", () => {
  const plan = assemblePlan(recipeWeek(), { householdSize: 1, stores: STORES, targets, compliance: { status: "partial", unmet: [] } });
  assert.deepEqual(plan.compliance, { status: "full", unmet: [] });
});

test("weekCost with a household factor equals the assembled shopping total", () => {
  const week = recipeWeek();
  const plan = assemblePlan(week, { householdSize: 2, householdFactor: 1.8, stores: STORES, targets });
  assert.equal(weekCost(week, 1.8, STORES), plan.summary.estimated_total_cop);
  assert.notEqual(weekCost(week, 1.8, STORES), weekCost(week, 2, STORES), "the factor really matters here");
});

console.log("planner: all checks passed");
