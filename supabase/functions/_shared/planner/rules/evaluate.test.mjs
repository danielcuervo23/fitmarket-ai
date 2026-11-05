import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTargets } from "./targets.ts";
import { buildRuleSet } from "./ruleSet.ts";
import { evaluateWeek } from "./evaluate.ts";
import { createCatalog } from "../../catalog.ts";
import { DAYS } from "../types.ts";

const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };
const rulesFor = (goals) => buildRuleSet(buildTargets(man, goals));

// ---- Fixture catalog: synthetic numbers so the expected totals are easy to read.
const micro = (over = {}) => ({
  fiberG: 0, freeSugarsG: 0, satFatG: 0, sodiumMg: 0, ironMg: 0, gabaGroup: null, isFruitVeg: false, ...over,
});
const food = (id, per100, m) => ({
  id, name: { es: id, en: id }, category: "otros", unit: "g", per100, tags: [], pack: 100, price: 1,
  priceSource: "estimate", ...(m ? { micro: m } : {}),
});
const n = (kcal, protein, carbs, fat) => ({ kcal, protein, carbs, fat });

const FILLERS = Array.from({ length: 11 }, (_, i) => `f${i + 1}`);
const catalog = createCatalog([
  // 125 g: 500 kcal, 25 g protein, 5 g fiber, 125 mg sodium.
  food("cereal", n(400, 20, 70, 5), micro({ fiberG: 4, satFatG: 1, sodiumMg: 100, gabaGroup: "cereales_tuberculos" })),
  food("refinado", n(400, 20, 70, 5), micro({ satFatG: 1, sodiumMg: 100, gabaGroup: "cereales_tuberculos" })),
  // 250 g: 125 kcal, 5 g protein, 5 g fiber, 250 g fruit/veg.
  food("verdura", n(50, 2, 10, 0), micro({ fiberG: 2, sodiumMg: 10, gabaGroup: "frutas_verduras", isFruitVeg: true })),
  // 50 g: 150 kcal, 10 g protein, 5 g fiber.
  food("lentejas", n(300, 20, 50, 1), micro({ fiberG: 10, ironMg: 6, gabaGroup: "proteicos" })),
  // 200 g: 120 kcal, 6 g protein, 4 g sat fat.
  food("leche", n(60, 3, 5, 3), micro({ satFatG: 2, sodiumMg: 40, gabaGroup: "lacteos" })),
  food("sin_micro", n(400, 20, 70, 5)),
  food("salado", n(0, 0, 0, 0), micro({ sodiumMg: 40000 })),
  food("fibra", n(0, 0, 0, 0), micro({ fiberG: 100 })),
  ...FILLERS.map((id) => food(id, n(0, 0, 0, 0), micro())),
]);

const meal = (...items) => ({ name: { es: "x", en: "x" }, items: items.map(([id, qty]) => ({ id, qty })) });

// A day of 2520 kcal, 126 g protein, 35 g fiber, 500 g fruit/veg, 4 GABA groups.
const healthyDay = (overrides = {}) => ({
  desayuno: meal(["cereal", 125], ["leche", 200]),
  almuerzo: meal(["cereal", 125], ["verdura", 250], ["lentejas", 50]),
  cena: meal(["cereal", 125], ["verdura", 250]),
  snacks: meal(["cereal", 125], ...FILLERS.map((id) => [id, 1])),
  ...overrides,
});
const weekOf = (dayFor) => Object.fromEntries(DAYS.map((d, i) => [d, dayFor(d, i)]));
const healthyWeek = (dayFor = () => healthyDay()) => weekOf(dayFor);
const byRule = (shortfalls, code) => shortfalls.find((s) => s.rule === code);

test("a week that meets every healthy rule has no shortfalls", () => {
  assert.deepEqual(evaluateWeek(healthyWeek(), rulesFor(["healthy"]), catalog), []);
});

test("too little fiber reports fiber_min with achieved grams (worst day)", () => {
  const refined = healthyDay({
    desayuno: meal(["refinado", 125], ["leche", 200]),
    almuerzo: meal(["refinado", 125], ["verdura", 250], ["lentejas", 50]),
    cena: meal(["refinado", 125], ["verdura", 250]),
    snacks: meal(["refinado", 125], ...FILLERS.map((id) => [id, 1])),
  });
  const week = healthyWeek((d) => (d === "mar" ? refined : healthyDay()));
  const s = evaluateWeek(week, rulesFor(["healthy"]), catalog);
  assert.deepEqual(s, [{ rule: "fiber_min", level: 3, unit: "g", target: 25, achieved: 15 }]);
});

test("a week with one legume meal reports legumes_week 1 of 2", () => {
  const week = healthyWeek((d) =>
    d === "lun" ? healthyDay() : healthyDay({ almuerzo: meal(["cereal", 125], ["verdura", 250]) }),
  );
  const s = byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog), "legumes_week");
  assert.deepEqual(s, { rule: "legumes_week", level: 3, unit: "count", target: 2, achieved: 1 });
});

test("distinct_foods_week counts distinct ids across the week", () => {
  const week = healthyWeek(() => healthyDay({ snacks: meal(["cereal", 125]) }));
  const s = byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog), "distinct_foods_week");
  assert.deepEqual(s, { rule: "distinct_foods_week", level: 3, unit: "count", target: 15, achieved: 4 });
});

test("gaba_groups_day counts groups with at least 10 g", () => {
  const withMilk = (grams) => healthyWeek(() => healthyDay({ desayuno: meal(["cereal", 125], ["leche", grams]) }));
  const rules = rulesFor([]);
  assert.deepEqual(byRule(evaluateWeek(withMilk(9), rules, catalog), "gaba_groups_day"), {
    rule: "gaba_groups_day", level: 3, unit: "count", target: 4, achieved: 3,
  });
  assert.equal(byRule(evaluateWeek(withMilk(10), rules, catalog), "gaba_groups_day"), undefined);
});

// A day whose fiber is exactly `fiberG`: verdura 500 g (10 g) + lentejas 50 g (5 g) + "fibra" for the rest.
const fiberDay = (fiberG) => ({
  desayuno: meal(["refinado", 125], ["leche", 200]),
  almuerzo: meal(["refinado", 125], ["verdura", 250], ["lentejas", 50]),
  cena: meal(["refinado", 125], ["verdura", 250], ["fibra", fiberG - 15]),
  snacks: meal(["refinado", 125], ...FILLERS.map((id) => [id, 1])),
});

test("tolerance: 2 % under a minimum is not a shortfall", () => {
  const rules = rulesFor(["healthy"]);
  const at = (fiber) => byRule(evaluateWeek(healthyWeek(() => fiberDay(fiber)), rules, catalog), "fiber_min");
  assert.equal(at(25), undefined);
  assert.equal(at(24.6), undefined);
  assert.deepEqual(at(24.4), { rule: "fiber_min", level: 3, unit: "g", target: 25, achieved: 24.4 });
});

test("tolerance can be set: 0 reports any gap", () => {
  const week = healthyWeek(() => fiberDay(24.6));
  assert.equal(byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog, 0), "fiber_min")?.achieved, 24.6);
});

test("protein shortfall is reported in g/kg", () => {
  // 280 g of cereal a day: 56 g protein = 0.8 g/kg for 70 kg; target protein_min 1.0 g/kg.
  const week = weekOf(() => ({
    desayuno: meal(["cereal", 70]), almuerzo: meal(["cereal", 70]), cena: meal(["cereal", 70]), snacks: meal(["cereal", 70]),
  }));
  const s = byRule(evaluateWeek(week, rulesFor([]), catalog), "protein_min");
  assert.deepEqual(s, { rule: "protein_min", level: 2, unit: "g_per_kg", target: 1, achieved: 0.8 });
});

test("protein in g/kg uses the worst day, rounded to 2 decimals", () => {
  const day = (g) => ({
    desayuno: meal(["cereal", g]), almuerzo: meal(["cereal", 125]), cena: meal(["cereal", 125]), snacks: meal(["cereal", 125]),
  });
  // Worst day: 3 × 25 g + 20 % of 10 g = 77 g → 1.1 g/kg (others 100 g). Target 90 g → 1.29 g/kg.
  const week = weekOf((d) => (d === "jue" ? day(10) : day(125)));
  const t = buildTargets(man, []);
  const rules = buildRuleSet({ ...t, proteinG: { ...t.proteinG, min: 90 } });
  const s = byRule(evaluateWeek(week, rules, catalog), "protein_min");
  assert.equal(s.achieved, 1.1);
  assert.equal(s.target, 1.29);
});

test("kcal over the safety max is a level 1 shortfall in kcal", () => {
  const week = weekOf(() => ({
    desayuno: meal(["cereal", 300]), almuerzo: meal(["cereal", 300]), cena: meal(["cereal", 300]), snacks: meal(["cereal", 300]),
  }));
  const rules = rulesFor([]);
  const s = byRule(evaluateWeek(week, rules, catalog), "kcal_safety");
  assert.deepEqual([s.level, s.unit, s.achieved], [1, "kcal", 4800]);
  assert.equal(s.target, rules.targets.kcalSafety.max);
});

test("share rules report the achieved percentage of kcal", () => {
  const fatty = food("grasa", n(900, 0, 0, 100), micro({ gabaGroup: "grasas" }));
  const cat = createCatalog([...catalog.all, fatty]);
  // healthyDay: 2520 kcal, 31.5 g fat. Plus 100 g of fat: 3420 kcal, 131.5 g → 1183.5 kcal → 34.61 %.
  const week = healthyWeek(() => healthyDay({ cena: meal(["cereal", 125], ["verdura", 250], ["grasa", 100]) }));
  const s = byRule(evaluateWeek(week, rulesFor(["healthy"]), cat), "fat_max");
  assert.deepEqual([s.unit, s.target, s.achieved], ["pct_kcal", 30, 34.61]);
});

test("sodium is checked against 1999 mg and shown with the 2000 mg target", () => {
  const week = healthyWeek(() => healthyDay({ cena: meal(["cereal", 125], ["verdura", 250], ["salado", 5]) }));
  // 630 + 2000 = 2630 mg.
  const s = byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog), "sodium_max");
  assert.deepEqual([s.unit, s.target, s.achieved], ["mg", 2000, 2630]);
});

test("meal rules report the worst meal among their slots", () => {
  const week = healthyWeek(() =>
    healthyDay({ desayuno: meal(["cereal", 60]) }), // 12 g protein, 2.4 g fiber
  );
  const s = evaluateWeek(week, rulesFor(["energy"]), catalog);
  assert.deepEqual(byRule(s, "breakfast_protein_min"), { rule: "breakfast_protein_min", level: 3, unit: "g", target: 15, achieved: 12 });
  assert.deepEqual(byRule(s, "breakfast_fiber_min"), { rule: "breakfast_fiber_min", level: 3, unit: "g", target: 3, achieved: 2.4 });
});

test("meal_kcal_share_max reports the biggest meal's share of its day", () => {
  // Lunch: cereal 500 g (2000) + verdura (125) + lentejas (150) = 2275 of a 4020 kcal day → 56.59 %.
  const week = healthyWeek(() => healthyDay({ almuerzo: meal(["cereal", 500], ["verdura", 250], ["lentejas", 50]) }));
  const s = byRule(evaluateWeek(week, rulesFor(["energy"]), catalog), "meal_kcal_share_max");
  assert.deepEqual([s.unit, s.target, s.achieved], ["pct_kcal", 40, 56.59]);
});

test("iron_sources_week counts meals with an iron source", () => {
  // healthyWeek has lentejas (iron source) at lunch every day: 7 meals.
  assert.equal(byRule(evaluateWeek(healthyWeek(), rulesFor(["energy"]), catalog), "iron_sources_week"), undefined);
  const week = healthyWeek((d, i) =>
    i < 4 ? healthyDay() : healthyDay({ almuerzo: meal(["cereal", 125], ["verdura", 250]) }),
  );
  assert.deepEqual(byRule(evaluateWeek(week, rulesFor(["energy"]), catalog), "iron_sources_week"), {
    rule: "iron_sources_week", level: 3, unit: "count", target: 5, achieved: 4,
  });
});

test("cheap_protein_share is a week rule in % of protein", () => {
  // Per day: 126 g protein, 10 g from lentejas → 7.94 %.
  const s = byRule(evaluateWeek(healthyWeek(), rulesFor(["save"]), catalog), "cheap_protein_share");
  assert.deepEqual([s.level, s.unit, s.target, s.achieved], [5, "pct_protein", 50, 7.94]);
});

test("missing micro data: a minimum not yet met by measured foods is unmeasurable, never met", () => {
  const week = healthyWeek(() => healthyDay({ desayuno: meal(["sin_micro", 125], ["leche", 200]) }));
  const s = byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog), "fiber_min");
  // Measured fiber without the breakfast cereal: 30 g >= 25, so it is met whatever the cereal has.
  assert.equal(s, undefined);
  // Measured part 20 g (verdura 10 + lentejas 5 + snack cereal 5): cannot tell.
  const low = healthyWeek(() =>
    healthyDay({
      desayuno: meal(["sin_micro", 125], ["leche", 200]),
      almuerzo: meal(["sin_micro", 125], ["verdura", 250], ["lentejas", 50]),
      cena: meal(["sin_micro", 125], ["verdura", 250]),
    }),
  );
  assert.deepEqual(byRule(evaluateWeek(low, rulesFor(["healthy"]), catalog), "fiber_min"), {
    rule: "fiber_min", level: 3, unit: "g", target: 25, achieved: 20, unmeasurable: true,
  });
});

test("missing micro data: a maximum already broken by measured foods is a plain shortfall", () => {
  const week = healthyWeek(() =>
    healthyDay({ cena: meal(["sin_micro", 125], ["verdura", 250], ["salado", 5]) }),
  );
  assert.deepEqual(byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog), "sodium_max"), {
    rule: "sodium_max", level: 3, unit: "mg", target: 2000, achieved: 2505,
  });
});

test("missing micro data: a maximum within bounds on measured foods is unmeasurable", () => {
  const week = healthyWeek(() => healthyDay({ cena: meal(["sin_micro", 125], ["verdura", 250]) }));
  const s = evaluateWeek(week, rulesFor(["healthy"]), catalog);
  assert.deepEqual(byRule(s, "sodium_max"), { rule: "sodium_max", level: 3, unit: "mg", target: 2000, achieved: 505, unmeasurable: true });
  assert.equal(byRule(s, "sat_fat_max")?.unmeasurable, true);
  assert.equal(byRule(s, "free_sugar_max")?.unmeasurable, true);
  // Macro rules do not need micro data.
  assert.equal(byRule(s, "kcal_range"), undefined);
  assert.equal(byRule(s, "fat_max"), undefined);
});

test("missing micro data: structural rules settled by measured foods stay met, else unmeasurable", () => {
  const rules = rulesFor([]);
  // The cereal group is unknown on breakfast, but 4 groups are still measured.
  const met = healthyWeek(() => healthyDay({ desayuno: meal(["sin_micro", 125], ["leche", 200]) }));
  assert.equal(byRule(evaluateWeek(met, rules, catalog), "gaba_groups_day"), undefined);
  // Without milk only 3 groups are measured and one food is unknown.
  const unsure = healthyWeek(() => healthyDay({ desayuno: meal(["sin_micro", 125]) }));
  assert.deepEqual(byRule(evaluateWeek(unsure, rules, catalog), "gaba_groups_day"), {
    rule: "gaba_groups_day", level: 3, unit: "count", target: 4, achieved: 3, unmeasurable: true,
  });
});

test("an id missing from the catalog never crashes and never passes as met", () => {
  const week = healthyWeek(() => healthyDay({ cena: meal(["no_existe", 125], ["verdura", 250]) }));
  const s = evaluateWeek(week, rulesFor(["healthy"]), catalog);
  assert.equal(byRule(s, "kcal_range")?.unmeasurable, true);
  assert.equal(byRule(s, "fat_max")?.unmeasurable, true);
});

test("evaluation is pure: the week is not modified", () => {
  const week = healthyWeek();
  const copy = structuredClone(week);
  evaluateWeek(week, rulesFor(["healthy", "energy", "save", "muscle"]), catalog);
  assert.deepEqual(week, copy);
});

test("lines with quantity 0 are not on the menu", () => {
  // Lentejas at 0 g on every day but Monday: one legume meal, not seven.
  const week = healthyWeek((d) =>
    d === "lun" ? healthyDay() : healthyDay({ almuerzo: meal(["cereal", 125], ["verdura", 250], ["lentejas", 0]) }),
  );
  const s = byRule(evaluateWeek(week, rulesFor(["healthy"]), catalog), "legumes_week");
  assert.equal(s?.achieved, 1);
});
