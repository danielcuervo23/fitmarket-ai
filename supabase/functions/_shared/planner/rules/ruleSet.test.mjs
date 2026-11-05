import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTargets } from "./targets.ts";
import {
  CHEAP_PROTEIN_IDS,
  LEGUME_IDS,
  buildRuleSet,
  isBlocker,
  isIronSource,
} from "./ruleSet.ts";
import { getIngredient } from "../../catalog.ts";

const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };

const rulesFor = (goals) => buildRuleSet(buildTargets(man, goals));
const codesOf = (set) => set.linear.map((r) => r.code);
const find = (set, code) => set.linear.find((r) => r.code === code);

test("base rules exist for every plan", () => {
  const codes = codesOf(rulesFor([]));
  for (const c of ["kcal_safety", "kcal_range", "protein_safety_max", "protein_min", "protein_max"]) {
    assert.ok(codes.includes(c), c);
  }
});

test("budget is a code only: the optimizer owns it, the rule set has no linear rule for it", () => {
  assert.ok(!codesOf(rulesFor(["healthy", "save"])).includes("budget"));
});

test("base kcal and protein rules carry the targets' bounds", () => {
  const set = rulesFor([]);
  const t = set.targets;
  const safety = find(set, "kcal_safety");
  assert.deepEqual([safety.level, safety.scope, safety.min, safety.max], [1, "day", t.kcalSafety.min, t.kcalSafety.max]);
  assert.deepEqual(safety.terms, { kcal: 1 });
  const range = find(set, "kcal_range");
  assert.deepEqual([range.level, range.min, range.max], [2, t.kcalRange.min, t.kcalRange.max]);
  const pmax = find(set, "protein_safety_max");
  assert.deepEqual([pmax.level, pmax.max, pmax.display], [1, t.proteinSafetyMaxG, { unit: "g_per_kg", target: 2.5 }]);
  const pmin = find(set, "protein_min");
  assert.deepEqual([pmin.level, pmin.min, pmin.display], [2, 70, { unit: "g_per_kg", target: 1 }]);
  assert.deepEqual([find(set, "protein_max").max, find(set, "protein_max").display.target], [140, 2]);
});

test("a zero-width kcal range keeps its min and uses the safety max, never an equality", () => {
  const t = { ...buildTargets(man, []), kcalRange: { min: 1500, max: 1500 }, kcalSafety: { min: 1500, max: 1700 } };
  const range = find(buildRuleSet(t), "kcal_range");
  assert.deepEqual([range.min, range.max], [1500, 1700]);
});

test("healthy adds the WHO rules at level 3", () => {
  const set = rulesFor(["healthy"]);
  const fv = find(set, "fruit_veg_min");
  assert.deepEqual([fv.level, fv.scope, fv.terms, fv.min], [3, "day", { fruitVeg: 1 }, 400]);
  const fiber = find(set, "fiber_min");
  assert.deepEqual([fiber.terms, fiber.min], [{ fiber: 1 }, 25]);
  const sodium = find(set, "sodium_max");
  assert.deepEqual([sodium.terms, sodium.max, sodium.display], [{ sodium: 1 }, 1999, { unit: "mg", target: 2000 }]);
  const sugar = find(set, "free_sugar_max");
  assert.deepEqual([sugar.terms, sugar.max, sugar.display], [{ freeSugars: 4, kcal: -0.099 }, 0, { unit: "pct_kcal", target: 10 }]);
  assert.equal(sugar.slackScale, set.targets.kcal);
  const fat = find(set, "fat_max");
  assert.deepEqual([fat.terms, fat.max], [{ fat: 9, kcal: -0.3 }, 0]);
  const sat = find(set, "sat_fat_max");
  assert.deepEqual([sat.terms, sat.max], [{ satFat: 9, kcal: -0.099 }, 0]);
  for (const r of [fv, fiber, sodium, sugar, fat, sat]) assert.equal(r.level, 3, r.code);
  assert.deepEqual(
    set.structural.map((s) => [s.code, s.min]).sort(),
    [["distinct_foods_week", 15], ["gaba_groups_day", 4], ["legumes_week", 2]],
  );
});

test("fat adds fruit/veg and fiber but not sodium", () => {
  const codes = codesOf(rulesFor(["fat"]));
  assert.ok(codes.includes("fruit_veg_min"));
  assert.ok(codes.includes("fiber_min"));
  assert.ok(!codes.includes("sodium_max"));
  assert.ok(!codes.includes("free_sugar_max"));
});

test("gaba_groups_day applies to every plan", () => {
  assert.deepEqual(rulesFor([]).structural, [{ code: "gaba_groups_day", level: 3, min: 4 }]);
});

test("energy adds breakfast and 40 % share rules", () => {
  const set = rulesFor(["energy"]);
  const share = find(set, "meal_kcal_share_max");
  assert.deepEqual(
    [share.level, share.scope, share.slots, share.terms, share.max, share.display],
    [3, "meal", ["desayuno", "almuerzo", "cena", "snacks"], { kcal: 1, dayKcal: -0.4 }, 0, { unit: "pct_kcal", target: 40 }],
  );
  const bp = find(set, "breakfast_protein_min");
  assert.deepEqual([bp.scope, bp.slots, bp.terms, bp.min], ["meal", ["desayuno"], { protein: 1 }, 15]);
  const bf = find(set, "breakfast_fiber_min");
  assert.deepEqual([bf.scope, bf.slots, bf.terms, bf.min], ["meal", ["desayuno"], { fiber: 1 }, 3]);
  assert.ok(codesOf(set).includes("free_sugar_max"));
  assert.ok(set.structural.some((s) => s.code === "iron_sources_week" && s.min === 5));
});

test("free_sugar_max appears once with healthy + energy", () => {
  const codes = codesOf(rulesFor(["healthy", "energy"]));
  assert.equal(codes.filter((c) => c === "free_sugar_max").length, 1);
});

test("fruit_veg_min appears once with healthy + fat", () => {
  const codes = codesOf(rulesFor(["healthy", "fat"]));
  assert.equal(codes.filter((c) => c === "fruit_veg_min").length, 1);
});

test("save adds an elastic level-5 cheap protein rule", () => {
  const r = find(rulesFor(["save"]), "cheap_protein_share");
  assert.deepEqual(
    [r.level, r.scope, r.terms, r.min, r.display],
    [5, "week", { cheapProtein: 1, protein: -0.5 }, 0, { unit: "pct_protein", target: 50 }],
  );
});

test("cheap_protein_share is never a blocker; levels 1 to 4 are", () => {
  const base = { unit: "g", target: 1, achieved: 0 };
  assert.equal(isBlocker({ ...base, rule: "cheap_protein_share", level: 5 }), false);
  assert.equal(isBlocker({ ...base, rule: "fiber_min", level: 3 }), true);
  assert.equal(isBlocker({ ...base, rule: "kcal_safety", level: 1 }), true);
});

test("muscle adds meal protein for three slots", () => {
  const r = rulesFor(["muscle"]).linear.find((x) => x.code === "meal_protein_muscle");
  assert.deepEqual([r.slots, r.min, r.max, r.level], [["desayuno", "almuerzo", "cena"], 20, 40, 2]);
});

test("muscle adds the protein floor (level 1) and carbs minimum (level 2) in g/kg", () => {
  const set = rulesFor(["muscle"]);
  const floor = find(set, "protein_muscle_floor");
  assert.deepEqual([floor.level, floor.min, floor.display], [1, 98, { unit: "g_per_kg", target: 1.4 }]);
  const carbs = find(set, "carbs_min_muscle");
  assert.deepEqual([carbs.level, carbs.terms, carbs.min, carbs.display], [2, { carbs: 1 }, 210, { unit: "g_per_kg", target: 3 }]);
  assert.ok(!codesOf(rulesFor([])).includes("protein_muscle_floor"));
});

test("goals blocked by targets do not add rules (health removes muscle)", () => {
  const set = buildRuleSet(buildTargets(man, ["muscle"], ["diabetes"]));
  assert.ok(!codesOf(set).includes("meal_protein_muscle"));
  assert.ok(!codesOf(set).includes("protein_muscle_floor"));
});

test("every linear rule has a positive slack scale", () => {
  for (const r of rulesFor(["healthy", "energy", "muscle", "save"]).linear) {
    assert.ok(r.slackScale > 0, r.code);
  }
});

test("legume and cheap protein ids are the spec's lists and exist in the catalog", () => {
  assert.deepEqual([...LEGUME_IDS].sort(), ["arveja_seca", "frijol", "garbanzo", "lentejas"]);
  assert.deepEqual(
    [...CHEAP_PROTEIN_IDS].sort(),
    ["arveja_seca", "frijol", "garbanzo", "huevo", "lentejas", "pernil_pollo", "sardina_lata"],
  );
  for (const id of [...LEGUME_IDS, ...CHEAP_PROTEIN_IDS]) assert.ok(getIngredient(id), id);
});

test("iron source: iron >= 1.5 mg/100 g in proteicos or frutas_verduras; no micro means no", () => {
  const food = (micro) => ({ id: "x", micro });
  const m = { fiberG: 0, freeSugarsG: 0, satFatG: 0, sodiumMg: 0, isFruitVeg: false };
  assert.equal(isIronSource(food({ ...m, ironMg: 1.5, gabaGroup: "proteicos" })), true);
  assert.equal(isIronSource(food({ ...m, ironMg: 2, gabaGroup: "frutas_verduras" })), true);
  assert.equal(isIronSource(food({ ...m, ironMg: 1.49, gabaGroup: "proteicos" })), false);
  assert.equal(isIronSource(food({ ...m, ironMg: 4, gabaGroup: "cereales_tuberculos" })), false);
  assert.equal(isIronSource(food(undefined)), false);
});
