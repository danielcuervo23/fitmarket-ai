import assert from "node:assert/strict";
import { CATALOG, getIngredient } from "../catalog.ts";
import { calcTargets } from "../nutrition.ts";
import {
  assemblePlan,
  checkQuality,
  dayNutrition,
  fitToBudget,
  mealLine,
  normalizeWeek,
  weekCost,
  weekStats,
} from "./build.ts";
import { parseComposition } from "./compose.ts";
import { allowedCatalog, buildRestrictionRules } from "./restrictions.ts";
import { DAYS, SLOTS } from "./types.ts";

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
const ALL_IDS = new Set(CATALOG.map((i) => i.id));

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

  assert.ok(buildRestrictionRules(["peanuts"]).excludedIds.has("mani"));
  assert.ok(buildRestrictionRules(["nueces"]).excludedTags.has("tree_nut"));
}

// ----------------------------------------------------------------- parsing
{
  const raw = {
    days: DAYS.map((day) => ({
      day,
      desayuno: { name_es: "a", name_en: "a", items: [{ id: "avena", qty: 60 }, { id: "banano", qty: 1 }] },
      almuerzo: { name_es: "b", name_en: "b", items: [{ id: "arroz_blanco", qty: 90 }, { id: "lentejas", qty: 60 }] },
      cena: { name_es: "c", name_en: "c", items: [{ id: "huevo", qty: 2 }, { id: "papa", qty: 200 }] },
      snacks: { name_es: "d", name_en: "d", items: [{ id: "manzana", qty: 1 }] },
    })),
  };
  assert.equal(parseComposition(raw, ALL_IDS).issue, null);

  const unknown = structuredClone(raw);
  unknown.days[0].cena.items[0].id = "pizza";
  assert.deepEqual(parseComposition(unknown, ALL_IDS).issue, { code: "unknown_ingredient", id: "pizza" });

  const shortWeek = { days: raw.days.slice(0, 6) };
  assert.equal(parseComposition(shortWeek, ALL_IDS).issue.code, "wrong_days");

  const oneItem = structuredClone(raw);
  oneItem.days[2].desayuno.items = [{ id: "avena", qty: 60 }];
  assert.equal(parseComposition(oneItem, ALL_IDS).issue.code, "item_count");

  const negative = structuredClone(raw);
  negative.days[1].snacks.items[0].qty = -3;
  assert.equal(parseComposition(negative, ALL_IDS).issue.code, "bad_quantity");

  // A forbidden ingredient is "unknown" because it was never offered.
  const noEggs = new Set([...ALL_IDS].filter((id) => id !== "huevo"));
  assert.equal(parseComposition(raw, noEggs).issue.code, "unknown_ingredient");
}

// --------------------------------------------------------------- normalization
{
  const week = normalizeWeek(sampleWeek(), targets.kcal);
  for (const day of DAYS) {
    const kcal = dayNutrition(week, day).kcal;
    assert.ok(
      Math.abs(kcal - targets.kcal) / targets.kcal < 0.06,
      `${day}: ${Math.round(kcal)} kcal should be near ${targets.kcal}`,
    );
  }
  // Seasoning/oil lines are left as the AI wrote them.
  assert.equal(week.lun.almuerzo.items.find((i) => i.id === "aceite_vegetal").qty, 8);
}

// ------------------------------------------------------------- cost and fit
{
  const week = normalizeWeek(sampleWeek(), targets.kcal);
  const cost = weekCost(week, 1);
  assert.ok(cost > 20_000 && cost < 400_000, `weekly cost looks off: ${cost}`);

  // Household of 3 buys more (cost rises, though packs make it sub-linear).
  assert.ok(weekCost(week, 3) > cost * 1.5);

  // Fit: an expensive week gets cheaper, and swaps respect the allowed set.
  const expensive = sampleWeek({
    almuerzo: meal("Salmón", ["salmon", 160], ["arroz_integral", 80], ["brocoli", 100]),
    snacks: meal("Nueces", ["nueces", 30], ["fresa", 150]),
  });
  const before = weekCost(normalizeWeek(expensive, targets.kcal), 1);
  const fitted = fitToBudget(expensive, {
    budgetCop: Math.round(before * 0.7),
    householdSize: 1,
    targetKcal: targets.kcal,
    allowedIds: ALL_IDS,
  });
  assert.ok(fitted.cost < before, "fitting must lower the cost");
  assert.ok(fitted.swaps > 0);

  // Without a cheaper allowed substitute nothing changes (and it terminates).
  const noSubs = fitToBudget(sampleWeek(), {
    budgetCop: 1,
    householdSize: 1,
    targetKcal: targets.kcal,
    allowedIds: new Set(["pechuga_pollo"]),
  });
  assert.ok(noSubs.cost > 1);

  // Already within budget: untouched.
  const fine = fitToBudget(sampleWeek(), {
    budgetCop: 10_000_000,
    householdSize: 1,
    targetKcal: targets.kcal,
    allowedIds: ALL_IDS,
  });
  assert.equal(fine.swaps, 0);
}

// ---------------------------------------------------------------- assembly
{
  const week = normalizeWeek(sampleWeek(), targets.kcal);
  const plan = assemblePlan(week, { householdSize: 2, stores: ["Exito", "D1"], targets });

  assert.equal(plan.summary.household_size, 2);
  assert.equal(plan.summary.estimated_total_cop, weekCost(week, 2));
  assert.equal(
    plan.shopping_list.reduce((sum, item) => sum + item.estimated_price_cop, 0),
    plan.summary.estimated_total_cop,
    "list total must equal the summary total",
  );
  assert.ok(Math.abs(plan.summary.estimated_daily_kcal - targets.kcal) < targets.kcal * 0.06);

  // Fresh food from the full-service store, pantry from the discount one.
  const chicken = plan.shopping_list.find((i) => i.name === "Pechuga de pollo");
  const rice = plan.shopping_list.find((i) => i.name === "Arroz blanco");
  assert.equal(chicken.store_id, "Exito");
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
  assert.ok(plan.weekly_menu.lun.desayuno.every((line) => /\d/.test(line)));
  assert.ok(plan.dish_names.lun.cena.es && plan.dish_names.lun.cena.en);
}

// ------------------------------------------------------------ quality gate
{
  // Our uniform sample repeats the same 13 foods every day: too little variety.
  const uniform = normalizeWeek(sampleWeek(), targets.kcal);
  assert.deepEqual(checkQuality(uniform, targets), { code: "low_variety", actual: 13 });

  // Three different day templates rotated over the week pass both gates.
  const templates = [
    {
      desayuno: meal("Avena con fruta", ["avena", 60], ["banano", 1], ["leche_entera", 200]),
      almuerzo: meal("Lentejas con arroz", ["lentejas", 80], ["arroz_blanco", 80], ["cebolla_cabezona", 40], ["zanahoria", 60]),
      cena: meal("Huevos pericos", ["huevo", 3], ["tomate_chonto", 80], ["harina_maiz", 60]),
      snacks: meal("Yogur", ["yogur_natural", 150], ["manzana", 1]),
    },
    {
      desayuno: meal("Arepa con queso", ["harina_maiz", 70], ["queso_campesino", 40], ["huevo", 2]),
      almuerzo: meal("Pollo con papa", ["pernil_pollo", 180], ["papa", 250], ["habichuela", 80]),
      cena: meal("Pasta con atún", ["pasta", 80], ["atun_lata", 80], ["pimenton", 0.5]),
      snacks: meal("Maní y fruta", ["mani", 25], ["naranja", 1]),
    },
    {
      desayuno: meal("Pan con huevo", ["pan_tajado", 70], ["huevo", 2], ["leche_entera", 200]),
      almuerzo: meal("Frijoles con plátano", ["frijol", 80], ["platano", 150], ["arroz_blanco", 70], ["repollo", 60]),
      cena: meal("Pescado con yuca", ["tilapia", 150], ["yuca", 200], ["ahuyama", 100]),
      snacks: meal("Papaya", ["papaya", 200], ["almendras", 15]),
    },
  ];
  const varied = normalizeWeek(
    Object.fromEntries(DAYS.map((d, i) => [d, templates[i % 3]])),
    targets.kcal,
  );
  assert.equal(checkQuality(varied, targets), null);

  const poor = normalizeWeek(
    sampleWeek({
      almuerzo: meal("Arroz", ["arroz_blanco", 120], ["zanahoria", 80]),
      cena: meal("Papa", ["papa", 400], ["tomate_chonto", 80]),
    }),
    targets.kcal,
  );
  const issue = checkQuality(poor, { ...targets, proteinG: 140 });
  assert.equal(issue.code, "low_protein");
  // A varied-enough week passes the variety gate; our uniform sample does not.
  assert.equal(weekStats(poor).distinctIngredients < 14, true);
}

console.log("planner: all checks passed");
