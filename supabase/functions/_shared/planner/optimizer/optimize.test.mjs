import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { STATIC_CATALOG, createCatalog } from "../../catalog.ts";
import { eligibleRecipes } from "../../recipes/eligibility.ts";
import { RECIPES } from "../../recipes/library.generated.ts";
import { DEFAULT_COOKING } from "../../recipes/types.ts";
import { weekCost } from "../build.ts";
import { __setLpSolverForTests, prepareLp } from "../lp.ts";
import { buildRestrictionRules } from "../restrictions.ts";
import { evaluateWeek } from "../rules/evaluate.ts";
import { buildRuleSet } from "../rules/ruleSet.ts";
import { buildTargets, householdFactor } from "../rules/targets.ts";
import { STATIC_PRICE_BOOK } from "../stores.ts";
import { DAYS, SLOTS } from "../types.ts";
import { OPTIMIZER_CPU_BUDGET_MS, batchGroups, createCpuBudget, optimizeWeek } from "./optimize.ts";

before(async () => {
  const wasm = () => readFile(new URL(import.meta.resolve("highs/runtime")));
  assert.equal(await prepareLp({ loadWasm: wasm }), true);
});

// ---- Tiny fixtures: hand-made foods, recipes and rules, so optima can be computed by hand.
//
// STATIC_PRICE_BOOK with no stores prices a food at its reference price (factor 1):
// pack 1 g at `price` COP per g, so whole packs never round the cost.

const micro = (over = {}) => ({
  fiberG: 0, freeSugarsG: 0, satFatG: 0, sodiumMg: 0, ironMg: 0, gabaGroup: null, isFruitVeg: false, ...over,
});
const food = (id, over = {}) => ({
  id, name: { es: id, en: id }, category: "otros", unit: "g", per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  tags: [], pack: 1, price: 1, priceSource: "estimate", micro: micro(), ...over,
});
/** a: 4 kcal and 0.2 g protein per g, 10 COP per g. z: nothing, 1 COP per g. */
const TINY_FOODS = [
  food("a", { per100: { kcal: 400, protein: 20, carbs: 0, fat: 0 }, price: 10 }),
  food("z"),
  food("caro", { per100: { kcal: 100, protein: 20, carbs: 0, fat: 0 }, price: 50 }),
  food("barato", { per100: { kcal: 100, protein: 20, carbs: 0, fat: 0 }, price: 5 }),
  food("huevito", { unit: "unit", gramsPerUnit: 100, per100: { kcal: 100, protein: 0, carbs: 0, fat: 0 }, price: 10 }),
];
const tinyCatalog = createCatalog(TINY_FOODS);

const tinyRecipe = (id, lines, over = {}) => ({
  id, status: "approved", source: "owner", name: { es: id, en: id }, slots: [...SLOTS], minutes: 10, level: "basic",
  appliances: [], batch: { ok: false, keepsDays: 1 }, lines, steps: { es: ["x"], en: ["x"] }, weekendOnly: false, ...over,
});
/** Breakfast: 100 g of a (protein role, scale 0.5–2). Other meals: 100 g of z (carb role, 0.5–2). */
const A_BREAKFAST = tinyRecipe("a_breakfast", [{ food: "a", qty: 100, role: "protein" }]);
const Z_MEAL = tinyRecipe("z_meal", [{ food: "z", qty: 100, role: "carb" }]);

const man = { age: 25, weightKg: 100, heightCm: 180, activity: "moderate", sex: "male" };
const tinyTargets = { ...buildTargets(man, ["healthy"]), weightKg: 100 };
const dayRule = (code, level, terms, bounds, unit = "kcal") => ({
  code, level, scope: "day", terms, ...bounds,
  slackScale: Math.abs(bounds.min ?? bounds.max) || tinyTargets.kcal,
  display: { unit, target: bounds.min ?? bounds.max },
});
const tinyRules = (...linear) => ({ targets: tinyTargets, linear, structural: [] });

const weekOf = (pick) => Object.fromEntries(DAYS.map((day) => [day, Object.fromEntries(SLOTS.map((slot) => [slot, pick(day, slot)]))]));
const recipesOf = (...list) => new Map(list.map((r) => [r.id, r]));

function tinyInput(over = {}) {
  return {
    recipeWeek: weekOf((day, slot) => (slot === "desayuno" ? "a_breakfast" : "z_meal")),
    recipes: recipesOf(A_BREAKFAST, Z_MEAL),
    rules: tinyRules(dayRule("kcal_safety", 1, { kcal: 1 }, { min: 600, max: 4000 })),
    catalog: tinyCatalog,
    prices: STATIC_PRICE_BOOK,
    stores: [],
    householdFactor: 1,
    budgetCop: 100_000,
    cooking: DEFAULT_COOKING,
    cpu: createCpuBudget(),
    diagnose: false,
    log: () => {},
    ...over,
  };
}

const qtyOf = (meal, id) => meal.items.find((item) => item.id === id)?.qty ?? 0;

// ---- CPU budget

test("createCpuBudget counts down and never goes below zero", () => {
  const cpu = createCpuBudget(100);
  assert.equal(cpu.left(), 100);
  cpu.spend(30);
  assert.equal(cpu.left(), 70);
  cpu.spend(500);
  assert.equal(cpu.left(), 0);
  assert.equal(createCpuBudget().left(), OPTIMIZER_CPU_BUDGET_MS);
  assert.equal(OPTIMIZER_CPU_BUDGET_MS, 900);
  assert.throws(() => createCpuBudget(-1), RangeError);
  assert.throws(() => createCpuBudget(Number.NaN), RangeError);
});

test("an exhausted CPU budget starts no new solve and says why", () => {
  const r = optimizeWeek(tinyInput({ cpu: createCpuBudget(0) }));
  assert.equal(r.solves, 0);
  assert.equal(r.week, null);
  assert.equal(r.error, "cpu_exhausted");
});

// ---- Hand-checked optimum and slack

test("tiny model: the optimum cost matches the hand calculation", () => {
  // Breakfast must give 600 kcal a day: 150 g of a (scale 1.5) = 1500 COP a day.
  // The other three meals take the smallest z portion: 3 × 50 g × 1 COP = 150 COP a day.
  // Week: 7 × (1500 + 150) = 11 550 COP.
  const r = optimizeWeek(tinyInput());

  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.costCop - 11_550) < 1e-6, `${r.costCop}`);
  for (const day of DAYS) {
    assert.ok(Math.abs(qtyOf(r.week[day].desayuno, "a") - 150) < 1e-6);
    assert.ok(Math.abs(qtyOf(r.week[day].cena, "z") - 50) < 1e-6);
  }
  assert.deepEqual(r.shortfalls, []);
  assert.deepEqual(r.relaxations, []);
  assert.ok(r.solves >= 1);
});

test("a binding level-2 rule gives the expected slack and a 'what to change' in its unit", () => {
  // protein_min asks 50 g a day; the most breakfast can give is 200 g of a = 40 g protein.
  // Relative slack (50 − 40) / 50 = 0.2; the bound must drop 10 g = 0.1 g/kg for 100 kg.
  const r = optimizeWeek(tinyInput({
    rules: tinyRules(
      dayRule("kcal_safety", 1, { kcal: 1 }, { min: 600, max: 4000 }),
      dayRule("protein_min", 2, { protein: 1 }, { min: 50 }, "g_per_kg"),
    ),
  }));

  assert.equal(r.status, "relaxed");
  assert.deepEqual(r.relaxations, [{ rule: "protein_min", level: 2, sense: "min", unit: "g_per_kg", slack: 0.2, change: -0.1 }]);
  assert.ok(r.shortfalls.some((s) => s.rule === "protein_min"));
  assert.ok(Math.abs(r.costCop - (7 * 2000 + 7 * 150)) < 1e-6, `${r.costCop}`);
});

test("level 5 is never reported, neither as a shortfall nor as a relaxation", () => {
  const r = optimizeWeek(tinyInput({
    rules: tinyRules(
      dayRule("kcal_safety", 1, { kcal: 1 }, { min: 600, max: 4000 }),
      dayRule("cheap_protein_share", 5, { protein: 1 }, { min: 50 }, "g"),
    ),
  }));

  assert.equal(r.status, "optimal");
  assert.deepEqual(r.shortfalls, []);
  assert.deepEqual(r.relaxations, []);
});

// ---- Batch groups

test("batchGroups: without batch cooking every meal is its own group", () => {
  const groups = batchGroups(weekOf(() => "a_breakfast"), recipesOf(A_BREAKFAST), false);
  assert.equal(groups.size, 28);
  assert.equal(groups.get("lun.desayuno"), "lun.desayuno");
  assert.equal(new Set(groups.values()).size, 28);
});

test("batchGroups: consecutive days of a batch recipe share a group, up to keepsDays (max 3)", () => {
  const stew = tinyRecipe("stew", [{ food: "a", qty: 100, role: "protein" }], { batch: { ok: true, keepsDays: 4 } });
  const week = weekOf((day, slot) => (slot === "almuerzo" && day !== "vie" ? "stew" : "z_meal"));
  const groups = batchGroups(week, recipesOf(stew, Z_MEAL), true);

  assert.equal(groups.get("lun.almuerzo"), groups.get("mar.almuerzo"));
  assert.equal(groups.get("lun.almuerzo"), groups.get("mie.almuerzo"));
  assert.notEqual(groups.get("mie.almuerzo"), groups.get("jue.almuerzo"));
  // vie breaks the run; sab and dom start a new batch.
  assert.notEqual(groups.get("jue.almuerzo"), groups.get("sab.almuerzo"));
  assert.equal(groups.get("sab.almuerzo"), groups.get("dom.almuerzo"));
  // z_meal is not a batch recipe.
  assert.notEqual(groups.get("lun.cena"), groups.get("mar.cena"));
});

test("batchGroups: a weekend-only recipe is never grouped with a weekday", () => {
  const beans = tinyRecipe("beans", [{ food: "a", qty: 100, role: "protein" }], {
    batch: { ok: true, keepsDays: 3 }, weekendOnly: true,
  });
  const week = weekOf((day, slot) => (slot === "almuerzo" && ["vie", "sab", "dom"].includes(day) ? "beans" : "z_meal"));
  const groups = batchGroups(week, recipesOf(beans, Z_MEAL), true);

  assert.notEqual(groups.get("vie.almuerzo"), groups.get("sab.almuerzo"));
  assert.equal(groups.get("sab.almuerzo"), groups.get("dom.almuerzo"));
});

test("a weekend-only recipe on a weekday is rejected", () => {
  const beans = tinyRecipe("beans", [{ food: "a", qty: 100, role: "protein" }], { weekendOnly: true });
  const recipeWeek = weekOf((day, slot) => (slot === "desayuno" ? (day === "mar" ? "beans" : "a_breakfast") : "z_meal"));

  assert.throws(() => optimizeWeek(tinyInput({ recipeWeek, recipes: recipesOf(A_BREAKFAST, Z_MEAL, beans) })), RangeError);
});

test("batch meals share portions on consecutive days", () => {
  const stew = tinyRecipe("stew", [{ food: "a", qty: 100, role: "protein" }], { batch: { ok: true, keepsDays: 3 } });
  const recipeWeek = weekOf((day, slot) => (slot === "desayuno" ? "stew" : "z_meal"));
  const r = optimizeWeek(tinyInput({ recipeWeek, recipes: recipesOf(stew, Z_MEAL), cooking: { ...DEFAULT_COOKING, batch: true } }));

  assert.equal(r.status, "optimal");
  assert.deepEqual(r.week.lun.desayuno.items, r.week.mar.desayuno.items);
  assert.deepEqual(r.week.lun.desayuno.items, r.week.mie.desayuno.items);
});

// ---- Input validation

test("invalid input is rejected with a RangeError", () => {
  const ok = tinyInput();
  const cases = {
    "unknown recipe id": { recipeWeek: weekOf(() => "nope") },
    "missing day": { recipeWeek: { ...ok.recipeWeek, dom: undefined } },
    "negative budget": { budgetCop: -1 },
    "non-finite budget": { budgetCop: Infinity },
    "zero household": { householdFactor: 0 },
    "stores not a list": { stores: "D1" },
  };
  for (const [name, patch] of Object.entries(cases)) {
    assert.throws(() => optimizeWeek({ ...ok, ...patch }), RangeError, name);
  }
});

// ---- Rounding, budget and level-1 re-checks

const level1Misses = (week, rules) =>
  evaluateWeek(week, { ...rules, linear: rules.linear.filter((r) => r.level === 1), structural: [] }, tinyCatalog);
const EGGS = tinyRecipe("eggs", [{ food: "huevito", qty: 1, role: "protein" }]);
const Z_BULK = tinyRecipe("z_bulk", [{ food: "zbulk", qty: 100, role: "carb" }]);
const bulkCatalog = createCatalog([...TINY_FOODS, food("zbulk", { pack: 1000 })]);

test("rounding that breaks a level-1 rule tightens the bound and solves again", () => {
  // huevito: 100 kcal per unit, rounded to halves. kcal_safety 120-160: the LP picks 1.2 units,
  // which rounds to 1.0 (100 kcal, below the floor). Tightened by the 20 kcal rounding error,
  // the LP picks 1.4, which rounds to 1.5 (150 kcal): safe.
  const rules = tinyRules(dayRule("kcal_safety", 1, { kcal: 1 }, { min: 120, max: 160 }));
  const r = optimizeWeek(tinyInput({
    recipeWeek: weekOf((day, slot) => (slot === "desayuno" ? "eggs" : "z_meal")),
    recipes: recipesOf(EGGS, Z_MEAL),
    rules,
  }));

  assert.equal(r.status, "optimal");
  assert.ok(r.solves >= 2, `${r.solves}`);
  for (const day of DAYS) assert.equal(qtyOf(r.week[day].desayuno, "huevito"), 1.5);
  assert.deepEqual(level1Misses(r.week, rules), []);
});

test("a level-1 rule that rounding can never meet gives no plan, never an unsafe one", () => {
  // Halves only: 1.0 (100 kcal) or 1.5 (150 kcal); nothing lands in 120-140.
  const r = optimizeWeek(tinyInput({
    recipeWeek: weekOf((day, slot) => (slot === "desayuno" ? "eggs" : "z_meal")),
    recipes: recipesOf(EGGS, Z_MEAL),
    rules: tinyRules(dayRule("kcal_safety", 1, { kcal: 1 }, { min: 120, max: 140 })),
  }));

  assert.equal(r.week, null);
  assert.notEqual(r.status, "optimal");
});

const bulkInput = (budgetCop) => tinyInput({
  catalog: bulkCatalog,
  recipeWeek: weekOf((day, slot) => (slot === "desayuno" ? "a_breakfast" : "z_bulk")),
  recipes: recipesOf(A_BREAKFAST, Z_BULK),
  rules: tinyRules(
    dayRule("kcal_safety", 1, { kcal: 1 }, { min: 600, max: 4000 }),
    dayRule("protein_min", 2, { protein: 1 }, { min: 50 }, "g_per_kg"),
  ),
  budgetCop,
});

test("rounded plan never exceeds budget: whole packs over budget tighten the budget row", () => {
  // zbulk comes in 1000 g packs: the LP pays for 1050 g, the shop sells 2000 g.
  // protein_min cannot be met, so the LP spends the whole budget on a; the real total
  // is ~950 COP over, the budget row is tightened and the week solved again.
  const budgetCop = 13_100;
  const r = optimizeWeek(bulkInput(budgetCop));

  assert.equal(r.status, "relaxed");
  assert.ok(r.solves >= 2, `${r.solves}`);
  assert.ok(r.costCop <= budgetCop, `${r.costCop}`);
  assert.equal(weekCost(r.week, 1, [], bulkCatalog, STATIC_PRICE_BOOK), r.costCop);
});

test("no budget, however tight, ever yields a week above it", () => {
  for (const budgetCop of [5_000, 11_000, 12_500, 13_000, 14_000, 16_000, 30_000]) {
    const r = optimizeWeek(bulkInput(budgetCop));
    if (r.week !== null) assert.ok(weekCost(r.week, 1, [], bulkCatalog, STATIC_PRICE_BOOK) <= budgetCop, `${budgetCop}`);
  }
});

// ---- Alternatives

test("cheapest alternative is used when it removes the shortfall", () => {
  // caro and barato have the same nutrients; barato costs a tenth. With caro the budget
  // cannot reach protein_min; with barato it can.
  const bowl = tinyRecipe("bowl", [{ food: "caro", qty: 100, role: "protein", alternatives: [{ food: "barato", qty: 100 }] }]);
  const r = optimizeWeek(tinyInput({
    recipeWeek: weekOf((day, slot) => (slot === "desayuno" ? "bowl" : "z_meal")),
    recipes: recipesOf(bowl, Z_MEAL),
    rules: tinyRules(
      dayRule("kcal_safety", 1, { kcal: 1 }, { min: 50, max: 4000 }),
      dayRule("protein_min", 2, { protein: 1 }, { min: 30 }, "g_per_kg"),
    ),
    budgetCop: 30_000,
  }));

  assert.equal(r.status, "optimal");
  for (const day of DAYS) {
    assert.ok(qtyOf(r.week[day].desayuno, "barato") > 0);
    assert.equal(qtyOf(r.week[day].desayuno, "caro"), 0);
  }
});

// ---- Diagnosis

test("budget below the safety minimum: over_budget with requiredBudgetCop", () => {
  // Safety alone costs 11 550 COP (hand calculation above): rounded up to 12 000.
  const r = optimizeWeek(tinyInput({ budgetCop: 5_000, diagnose: true }));
  assert.equal(r.status, "over_budget");
  assert.equal(r.week, null);
  assert.equal(r.requiredBudgetCop, 12_000);

  const quick = optimizeWeek(tinyInput({ budgetCop: 5_000, diagnose: false }));
  assert.equal(quick.status, "over_budget");
  assert.equal(quick.requiredBudgetCop, null);
});

test("relaxed: requiredBudgetCop is the budget that meets every rule", () => {
  // kcal_safety needs 100 g of a a day; protein_min 36 g needs 180 g a day:
  // 7 x 180 x 10 + 7 x 150 = 13 650 COP, rounded up to 14 000.
  const r = optimizeWeek(tinyInput({
    rules: tinyRules(
      dayRule("kcal_safety", 1, { kcal: 1 }, { min: 400, max: 4000 }),
      dayRule("protein_min", 2, { protein: 1 }, { min: 36 }, "g_per_kg"),
    ),
    budgetCop: 10_000,
    diagnose: true,
  }));

  assert.equal(r.status, "relaxed");
  assert.ok(r.costCop <= 10_000);
  assert.equal(r.requiredBudgetCop, 14_000);
  assert.equal(r.relaxations[0].rule, "protein_min");
});

test("safety that no budget can meet is infeasible", () => {
  // 1000 kcal a day needs 250 g of a; breakfast tops out at 200 g.
  const r = optimizeWeek(tinyInput({
    rules: tinyRules(dayRule("kcal_safety", 1, { kcal: 1 }, { min: 1000, max: 4000 })),
    diagnose: true,
  }));
  assert.equal(r.status, "infeasible");
  assert.equal(r.week, null);
  assert.equal(r.requiredBudgetCop, null);
});

// ---- Shared CPU budget and solver errors

test("one CPU budget is shared: once spent, later calls start no solve", () => {
  let clock = 0;
  const now = () => (clock += 400); // every reading costs 400 ms
  const cpu = createCpuBudget(OPTIMIZER_CPU_BUDGET_MS);
  const first = optimizeWeek(tinyInput({ cpu, now }));
  const second = optimizeWeek(tinyInput({ cpu, now }));

  assert.ok(first.cpuMs >= OPTIMIZER_CPU_BUDGET_MS, `${first.cpuMs}`);
  assert.equal(cpu.left(), 0);
  assert.equal(second.solves, 0);
  assert.equal(second.error, "cpu_exhausted");
});

test("each solve gets min(budget left, 800 ms); a solver failure stops with solver_error", async () => {
  const limits = [];
  __setLpSolverForTests({ solve: (_text, options) => { limits.push(options.time_limit); return { Status: "garbage" }; } });
  try {
    const small = optimizeWeek(tinyInput({ cpu: createCpuBudget(300) }));
    const large = optimizeWeek(tinyInput({ cpu: createCpuBudget(5_000) }));

    assert.equal(small.error, "solver_error");
    assert.equal(small.week, null);
    assert.equal(large.solves, 1);
    assert.ok(limits[0] <= 0.3 && limits[0] > 0.2, `${limits[0]}`);
    assert.ok(limits[1] <= 0.8 && limits[1] > 0.7, `${limits[1]}`);
  } finally {
    __setLpSolverForTests(null);
    assert.equal(await prepareLp({ loadWasm: () => readFile(new URL(import.meta.resolve("highs/runtime"))) }), true);
  }
});


// ---- Realistic weeks: the recipe library, the static catalog and the static price book

const ALL_APPLIANCES = ["estufa", "microondas", "olla_arrocera", "freidora_aire", "licuadora", "horno", "sandwichera", "olla_presion"];
const KITCHEN = { weekdayMinutes: 30, level: "enjoys", appliances: ALL_APPLIANCES, batch: false };
const STORES5 = ["D1", "Ara", "Exito", "Jumbo", "Carulla"];
const resolved = new Map(eligibleRecipes(RECIPES, {
  rules: buildRestrictionRules([], STATIC_CATALOG), catalog: STATIC_CATALOG, prices: STATIC_PRICE_BOOK, stores: STORES5, cooking: KITCHEN,
}).map((r) => [r.id, r]));

const MENU = {
  desayuno: ["avena_con_banano", "huevos_pericos_con_arepa", "changua", "yogur_con_fruta", "tostadas_francesas_con_fruta", "arepa_con_queso", "batido_de_fresa_y_avena"],
  almuerzo: ["lentejas_con_arroz", "pollo_guisado_con_papa", "sopa_de_lentejas", "sopa_rapida_de_verduras_con_huevo", "pechuga_a_la_plancha_con_arepa", "garbanzos_guisados_con_papa", "frijoles_en_olla_a_presion"],
  cena: ["huevos_revueltos_con_espinaca", "sardinas_guisadas_con_arepa", "pasta_con_atun", "tilapia_con_arepa_y_ensalada", "tortilla_de_verduras_con_aguacate", "arroz_con_pollo", "pollo_salteado_con_quinua"],
  snacks: ["fruta_con_almendras", "sandwich_de_queso_y_tomate", "salpicon_de_frutas", "ensalada_de_frutas_con_mani", "palitos_de_verdura_con_guacamole", "pan_con_aguacate_y_tomate", "batido_de_banano_y_mani"],
};
const libraryWeek = weekOf((day, slot) => MENU[slot][DAYS.indexOf(day)]);
/**
 * The same 28 recipes arranged so no day stacks the fattest dishes (tortilla with avocado,
 * guacamole, peanut snacks): a week a person would plan for "healthy".
 */
const HEALTHY_MENU = {
  desayuno: ["tostadas_francesas_con_fruta", "changua", "avena_con_banano", "arepa_con_queso", "huevos_pericos_con_arepa", "yogur_con_fruta", "batido_de_fresa_y_avena"],
  almuerzo: ["sopa_rapida_de_verduras_con_huevo", "pechuga_a_la_plancha_con_arepa", "lentejas_con_arroz", "sopa_de_lentejas", "pollo_guisado_con_papa", "garbanzos_guisados_con_papa", "frijoles_en_olla_a_presion"],
  cena: ["pasta_con_atun", "sardinas_guisadas_con_arepa", "tortilla_de_verduras_con_aguacate", "pollo_salteado_con_quinua", "tilapia_con_arepa_y_ensalada", "arroz_con_pollo", "huevos_revueltos_con_espinaca"],
  snacks: ["ensalada_de_frutas_con_mani", "salpicon_de_frutas", "palitos_de_verdura_con_guacamole", "pan_con_aguacate_y_tomate", "batido_de_banano_y_mani", "fruta_con_almendras", "sandwich_de_queso_y_tomate"],
};
const healthyWeek = weekOf((day, slot) => HEALTHY_MENU[slot][DAYS.indexOf(day)]);

function libraryInput({ goals = ["healthy"], weightKg = 70, budgetCop = 400_000, householdSize = 1, stores = ["D1", "Exito"], ...over } = {}) {
  const profile = { age: 25, weightKg, heightCm: 175, activity: "moderate", sex: "male" };
  const targets = buildTargets(profile, goals);
  return {
    recipeWeek: libraryWeek,
    recipes: resolved,
    rules: buildRuleSet(targets),
    catalog: STATIC_CATALOG,
    prices: STATIC_PRICE_BOOK,
    stores,
    householdFactor: householdFactor(householdSize, targets.kcal),
    budgetCop,
    cooking: KITCHEN,
    cpu: createCpuBudget(),
    diagnose: false,
    log: () => {},
    ...over,
  };
}

const SOAK = new Set(["frijol", "garbanzo", "arveja_seca"]);
const WEEKDAYS = DAYS.slice(0, 5);

test("the library week fixtures are valid: 28 distinct recipes, weekend dishes only on the weekend", () => {
  for (const week of [libraryWeek, healthyWeek]) {
    const ids = DAYS.flatMap((day) => SLOTS.map((slot) => week[day][slot]));
    assert.equal(new Set(ids).size, 28);
    for (const id of ids) assert.ok(resolved.has(id), id);
    for (const day of WEEKDAYS) for (const slot of SLOTS) assert.equal(resolved.get(week[day][slot]).weekendOnly, false, `${day}.${slot}`);
  }
});

// Healthy is reachable since the 2026-11-12 recipe change (less salt and oil; oil may halve).
test("generous budget: optimal, every healthy rule met, cost <= budget", () => {
  for (const weightKg of [60, 70, 85]) {
    const input = { ...libraryInput({ goals: ["healthy"], weightKg, budgetCop: 400_000 }), recipeWeek: healthyWeek };
    const r = optimizeWeek(input);

    assert.equal(r.status, "optimal", `${weightKg} kg: ${JSON.stringify(r.shortfalls)}`);
    assert.deepEqual(evaluateWeek(r.week, input.rules, STATIC_CATALOG), []);
    assert.ok(r.costCop <= 400_000);
    assert.equal(weekCost(r.week, input.householdFactor, input.stores, STATIC_CATALOG, STATIC_PRICE_BOOK), r.costCop);
  }
});

test("cost is the minimum: removing budget pressure never lowers it", () => {
  const healthy = (budgetCop) => ({ ...libraryInput({ goals: ["healthy"], budgetCop }), recipeWeek: healthyWeek });
  const withBudget = optimizeWeek(healthy(400_000));
  const unlimited = optimizeWeek(healthy(50_000_000));
  assert.equal(withBudget.status, "optimal");
  assert.equal(withBudget.costCop, unlimited.costCop);
});

// Regression: once the primary-choice week fit the budget with no LP slack, it beat a cheaper
// week (cheapest alternatives) that also met every rule after rounding, so a looser budget
// returned a pricier week (60 kg: 183 412 at 202 230, then 202 231 at 202 231 and above).
for (const [weightKg, tight, loose] of [[60, 202_230, 202_231], [80, 200_000, 250_000]]) {
  test(`${weightKg} kg: a looser budget never returns a pricier week that meets every rule`, () => {
    const atTight = optimizeWeek(libraryInput({ goals: [], weightKg, budgetCop: tight }));
    assert.equal(atTight.status, "optimal", JSON.stringify(atTight.shortfalls));
    for (const budgetCop of [loose, 400_000]) {
      const r = optimizeWeek(libraryInput({ goals: [], weightKg, budgetCop }));
      assert.equal(r.status, "optimal", JSON.stringify(r.shortfalls));
      assert.ok(r.costCop <= atTight.costCop, `budget ${budgetCop}: ${r.costCop} > ${atTight.costCop}`);
    }
  });
}

test("monotone: across a budget ladder the cost of a fully compliant week never rises", () => {
  for (const weightKg of [60, 80]) {
    let previous = Infinity;
    for (let budgetCop = 180_000; budgetCop <= 300_000; budgetCop += 10_000) {
      const input = libraryInput({ goals: [], weightKg, budgetCop });
      const r = optimizeWeek(input);
      if (r.status !== "optimal") continue;
      assert.deepEqual(evaluateWeek(r.week, input.rules, STATIC_CATALOG), []);
      assert.ok(r.costCop <= budgetCop);
      assert.ok(r.costCop <= previous, `${weightKg} kg, budget ${budgetCop}: ${r.costCop} > ${previous}`);
      previous = r.costCop;
    }
    assert.ok(previous < Infinity, `${weightKg} kg: no optimal week on the ladder`);
  }
});

test("library week below the safety minimum: over_budget with requiredBudgetCop", () => {
  const r = optimizeWeek(libraryInput({ goals: ["healthy"], budgetCop: 15_000, diagnose: true }));
  assert.equal(r.status, "over_budget");
  assert.equal(r.week, null);
  assert.ok(r.requiredBudgetCop > 15_000 && r.requiredBudgetCop % 1000 === 0, `${r.requiredBudgetCop}`);
});

test("save never appears as a shortfall", () => {
  for (const budgetCop of [60_000, 400_000]) {
    const r = optimizeWeek(libraryInput({ goals: ["save", "healthy"], budgetCop, diagnose: true }));
    assert.ok(r.shortfalls.every((s) => s.level < 5 && s.rule !== "cheap_protein_share"), JSON.stringify(r.shortfalls));
    assert.ok(r.relaxations.every((x) => x.level < 5));
  }
});

test("alternatives come only from the resolved recipe lines and never put a soak food on a weekday", () => {
  for (const budgetCop of [60_000, 90_000, 400_000]) {
    const r = optimizeWeek(libraryInput({ goals: ["muscle", "healthy"], weightKg: 90, budgetCop }));
    if (r.week === null) continue;
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const meal = r.week[day][slot];
        const recipe = resolved.get(libraryWeek[day][slot]);
        const allowed = new Set(recipe.lines.flatMap((line) => [line.food, ...(line.alternatives ?? []).map((a) => a.food)]));
        for (const item of meal.items) assert.ok(allowed.has(item.id), `${day}.${slot} ${item.id}`);
        if (WEEKDAYS.includes(day)) for (const item of meal.items) assert.ok(!SOAK.has(item.id), `${day}.${slot} ${item.id}`);
      }
    }
  }
});

test("same input, same week: a stored attempt can be re-solved without the AI step", () => {
  const a = optimizeWeek(libraryInput({ goals: ["muscle"], weightKg: 100, budgetCop: 120_000 }));
  const b = optimizeWeek(libraryInput({ goals: ["muscle"], weightKg: 100, budgetCop: 120_000 }));
  assert.equal(a.status, b.status);
  assert.equal(a.costCop, b.costCop);
  assert.deepEqual(a.week, b.week);
});

test("worst case stays inside the CPU budget and returns a result", () => {
  // Wall-clock time: the median of 3 runs keeps one slow run on a busy machine from failing it.
  const runs = [1, 2, 3].map(() => optimizeWeek(libraryInput({
    goals: ["fat", "muscle", "healthy", "energy", "save", "family"], householdSize: 6, stores: STORES5, budgetCop: 250_000,
    cpu: createCpuBudget(OPTIMIZER_CPU_BUDGET_MS), diagnose: true,
  })));
  const median = runs.map((r) => r.cpuMs).sort((x, y) => x - y)[1];
  console.log(`worst case: ${runs[0].status}, ${runs[0].solves} solves, median ${median.toFixed(1)} ms`);
  assert.ok(median <= OPTIMIZER_CPU_BUDGET_MS + 150, `${median}`);
  for (const r of runs) assert.ok(r.status);
});

// A small menu that shares ingredients (fewer whole packs) for an 80 kg muscle goal.
const rotate = (list) => (day) => list[DAYS.indexOf(day) % list.length];
const COMPACT = {
  desayuno: rotate(["huevos_pericos_con_arepa", "arepa_con_queso"]),
  almuerzo: rotate(["lentejas_con_arroz", "arroz_con_huevo_y_tomate"]),
  cena: rotate(["pechuga_a_la_plancha_con_arepa", "huevos_revueltos_con_espinaca"]),
  snacks: rotate(["batido_de_banano_y_mani", "arepa_con_queso"]),
};
const compactWeek = weekOf((day, slot) => COMPACT[slot](day));
const compactInput = (budgetCop, over = {}) =>
  ({ ...libraryInput({ goals: ["muscle"], weightKg: 80, budgetCop, ...over }), recipeWeek: compactWeek });

test("a budget the cheapest safe week fits is never answered with over_budget", () => {
  const safe = optimizeWeek(compactInput(100_000, { diagnose: true }));
  assert.equal(safe.status, "over_budget");
  const safetyCost = safe.requiredBudgetCop; // the cheapest safe week, rounded up to 1000

  for (let budgetCop = safetyCost + 1_000; budgetCop <= safetyCost + 16_000; budgetCop += 2_500) {
    const r = optimizeWeek(compactInput(budgetCop));
    assert.notEqual(r.status, "over_budget", `${budgetCop}`);
    assert.ok(r.week !== null && r.costCop <= budgetCop, `${budgetCop}: ${r.costCop}`);
  }
});

test("a level-2 rule the LP met but rounding broke is tightened and solved again", () => {
  // kcal_range 120-160 (level 2): the LP picks 1.2 units of huevito, which rounds to 1.0 (100 kcal,
  // 17 % short). Tightened by the rounding error, 1.4 rounds to 1.5: met.
  const r = optimizeWeek(tinyInput({
    recipeWeek: weekOf((day, slot) => (slot === "desayuno" ? "eggs" : "z_meal")),
    recipes: recipesOf(EGGS, Z_MEAL),
    rules: tinyRules(
      dayRule("kcal_safety", 1, { kcal: 1 }, { min: 50, max: 4000 }),
      dayRule("kcal_range", 2, { kcal: 1 }, { min: 120, max: 160 }),
    ),
  }));

  assert.equal(r.status, "optimal", JSON.stringify(r.shortfalls));
  for (const day of DAYS) assert.equal(qtyOf(r.week[day].desayuno, "huevito"), 1.5);
});

test("tight budget for a muscle goal: relaxed with a protein_min shortfall and its 'what to change'", () => {
  // The plan's 100 kg example, reachable since protein-dense lines may grow to 2.5x (owner decision
  // 2026-11-12), and the 75 kg user this test used before (same budget). Re-measured with the egg cap
  // (at most 6 eggs a meal): some budgets return the cheapest safe week, which carries no relaxations.
  for (const [weightKg, budgetCop] of [[100, 160_000], [75, 120_000]]) {
    const r = optimizeWeek(compactInput(budgetCop, { weightKg, diagnose: true }));
    const label = `${weightKg} kg`;

    assert.equal(r.status, "relaxed", label);
    assert.ok(r.shortfalls.some((s) => s.rule === "protein_min" && s.unit === "g_per_kg"), `${label} ${JSON.stringify(r.shortfalls)}`);
    assert.ok(r.relaxations.some((x) => x.rule === "protein_min" && x.unit === "g_per_kg" && x.change < 0), `${label} ${JSON.stringify(r.relaxations)}`);
    assert.ok(r.costCop <= budgetCop, label);
    // Whole eggs round one meal over the 40 g meal maximum even without a budget: money is not
    // the whole fix, so no required budget is offered.
    assert.equal(r.requiredBudgetCop, null, label);
  }
});

test("tight budget: relaxed, with a required budget that works", () => {
  // A 60 kg maintenance user: between the cheapest week this budget allows and the week that meets
  // every rule (184 000 COP). Re-measured after the 2026-11-12 salt, oil and protein-cap changes.
  const input = (budgetCop) => libraryInput({ goals: [], weightKg: 60, budgetCop, diagnose: true });
  const r = optimizeWeek(input(177_500));

  assert.equal(r.status, "relaxed", r.status);
  assert.ok(r.shortfalls.some((s) => s.rule === "kcal_range"), JSON.stringify(r.shortfalls));
  assert.ok(r.costCop <= 177_500);
  assert.ok(r.requiredBudgetCop > 177_500 && r.requiredBudgetCop % 1000 === 0, `${r.requiredBudgetCop}`);
  const richer = optimizeWeek({ ...input(r.requiredBudgetCop), diagnose: false });
  assert.ok(richer.week !== null && !richer.shortfalls.some((s) => s.rule === "kcal_range"), JSON.stringify(richer.shortfalls));
});

// Owner decision 2026-11-12: protein-dense lines may reach 2.5x, so a 100 kg muscle user gets a week
// that meets the level-1 floor (1.4 g/kg = 140 g a day) with realistic menus and a generous budget.
test("100 kg muscle user with a generous budget: a week at or above the protein floor, never infeasible", () => {
  for (const [name, input] of [
    ["compact", compactInput(10_000_000, { weightKg: 100, diagnose: true })],
    ["library", libraryInput({ goals: ["muscle"], weightKg: 100, budgetCop: 10_000_000, diagnose: true })],
  ]) {
    const r = optimizeWeek(input);
    assert.notEqual(r.status, "infeasible", name);
    assert.ok(r.week !== null, name);
    const floor = input.rules.linear.filter((rule) => rule.level === 1);
    assert.deepEqual(evaluateWeek(r.week, { ...input.rules, linear: floor, structural: [] }, STATIC_CATALOG), [], name);
  }
});

test("75 kg muscle user with a generous budget: still optimal with every rule met", () => {
  const input = compactInput(10_000_000, { weightKg: 75 });
  const r = optimizeWeek(input);
  assert.equal(r.status, "optimal", JSON.stringify(r.shortfalls));
  assert.deepEqual(evaluateWeek(r.week, input.rules, STATIC_CATALOG), []);
});

test("a muscle goal no portion can reach is infeasible, never a week below the protein floor", () => {
  const r = optimizeWeek(compactInput(10_000_000, { weightKg: 160, diagnose: true }));
  assert.equal(r.status, "infeasible");
  assert.equal(r.week, null);
});

// ---- Review fixes

const reloadSolver = async () => {
  __setLpSolverForTests(null);
  assert.equal(await prepareLp({ loadWasm: () => readFile(new URL(import.meta.resolve("highs/runtime"))) }), true);
};

test("a solve that hits its time limit stops the optimizer with cpu_exhausted, never a proven verdict", async () => {
  __setLpSolverForTests({ solve: () => ({ Status: "Time limit reached" }) });
  try {
    const r = optimizeWeek(tinyInput({ diagnose: true }));
    assert.equal(r.error, "cpu_exhausted");
    assert.equal(r.status, "infeasible");
    assert.equal(r.week, null);
    assert.equal(r.requiredBudgetCop, null);
    assert.equal(r.solves, 1);
  } finally {
    await reloadSolver();
  }
});

test("a budget spent during the safety solve answers infeasible with cpu_exhausted, not over_budget", () => {
  // Safety alone is out of reach (1000 kcal needs 250 g, breakfast tops out at 200 g). The
  // elastic solve runs; the budget is gone before the safety solve. Each solve reads left() twice.
  let reads = 0;
  const cpu = { left: () => (reads++ < 2 ? 800 : 0), spend: () => {} };
  const r = optimizeWeek(tinyInput({
    rules: tinyRules(dayRule("kcal_safety", 1, { kcal: 1 }, { min: 1000, max: 4000 })),
    cpu,
    diagnose: true,
  }));

  assert.equal(r.solves, 1);
  assert.equal(r.error, "cpu_exhausted");
  assert.equal(r.status, "infeasible");
  assert.equal(r.week, null);
});

test("requiredBudgetCop is null when even the unbudgeted week still misses a rule", () => {
  // Same money clash as the relaxed test above, plus a rule no budget fixes: 15 distinct foods
  // from a menu of two. The strict solve finds a week, but it still misses distinct_foods_week.
  const rules = {
    ...tinyRules(
      dayRule("kcal_safety", 1, { kcal: 1 }, { min: 400, max: 4000 }),
      dayRule("protein_min", 2, { protein: 1 }, { min: 36 }, "g_per_kg"),
    ),
    structural: [{ code: "distinct_foods_week", level: 3, min: 15 }],
  };
  const r = optimizeWeek(tinyInput({ rules, budgetCop: 10_000, diagnose: true }));

  assert.equal(r.status, "relaxed");
  assert.ok(r.shortfalls.some((s) => s.rule === "distinct_foods_week"));
  assert.equal(r.requiredBudgetCop, null);
});

test("malformed recipes, rules, catalog or prices are rejected with a RangeError", () => {
  const ok = tinyInput();
  const cases = {
    "recipes not a Map": { recipes: Object.fromEntries(ok.recipes) },
    "rules missing": { rules: null },
    "rules without linear list": { rules: { ...ok.rules, linear: "x" } },
    "rules without structural list": { rules: { ...ok.rules, structural: undefined } },
    "rules without a weight": { rules: { ...ok.rules, targets: { ...ok.rules.targets, weightKg: 0 } } },
    "catalog without get": { catalog: {} },
    "prices without packOffer": { prices: { quote: STATIC_PRICE_BOOK.quote, carries: STATIC_PRICE_BOOK.carries } },
    "prices without quote": { prices: { packOffer: STATIC_PRICE_BOOK.packOffer } },
  };
  for (const [name, patch] of Object.entries(cases)) {
    assert.throws(() => optimizeWeek({ ...ok, ...patch }), RangeError, name);
  }
});
