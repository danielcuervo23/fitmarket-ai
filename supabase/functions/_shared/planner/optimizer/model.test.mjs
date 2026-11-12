import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { STATIC_CATALOG, nutritionOf } from "../../catalog.ts";
import { resolveRecipe } from "../../recipes/eligibility.ts";
import { primaryChoice } from "../../recipes/expand.ts";
import { RECIPES } from "../../recipes/library.generated.ts";
import { DEFAULT_COOKING } from "../../recipes/types.ts";
import { LP_MAX_CONSTRAINTS, LP_MAX_VARIABLES, prepareLp, solveLp } from "../lp.ts";
import { buildRestrictionRules } from "../restrictions.ts";
import { buildRuleSet } from "../rules/ruleSet.ts";
import { buildTargets } from "../rules/targets.ts";
import { STATIC_PRICE_BOOK } from "../stores.ts";
import { DAYS, SLOTS } from "../types.ts";
import { PENALTY, buildModel } from "./model.ts";

// ---- Fixtures: the seed recipes, the static catalog and the static price book.

const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };
const rulesFor = (goals) => buildRuleSet(buildTargets(man, goals));

const ctx = {
  rules: buildRestrictionRules([], STATIC_CATALOG),
  catalog: STATIC_CATALOG,
  prices: STATIC_PRICE_BOOK,
  stores: [],
  cooking: { ...DEFAULT_COOKING, weekdayMinutes: 30 },
};
const recipe = (id) => {
  const resolved = resolveRecipe(RECIPES.find((r) => r.id === id), ctx);
  assert.ok(resolved, id);
  return resolved;
};

const MENU = {
  desayuno: recipe("avena_con_banano"),
  almuerzo: recipe("lentejas_con_arroz"),
  cena: recipe("pollo_guisado_con_papa"),
  snacks: recipe("yogur_con_fruta"),
};

const STORES = ["D1", "Exito"];

/** Every day the same menu; each meal is its own group unless `groupOf` says otherwise. */
function weekMeals(groupOf = (day, slot) => `${day}.${slot}`) {
  return DAYS.flatMap((day) =>
    SLOTS.map((slot) => ({ day, slot, recipe: MENU[slot], choice: primaryChoice(MENU[slot]), group: groupOf(day, slot) })),
  );
}

function offersFor(meals) {
  const offers = new Map();
  for (const meal of meals) {
    for (const line of meal.recipe.lines) {
      for (const food of [line.food, ...(line.alternatives ?? []).map((alt) => alt.food)]) {
        offers.set(food, STATIC_PRICE_BOOK.packOffer(STATIC_CATALOG.get(food), STORES));
      }
    }
  }
  return offers;
}

function input(over = {}) {
  const meals = over.meals ?? weekMeals();
  return {
    meals,
    rules: rulesFor(over.goals ?? ["healthy"]),
    catalog: STATIC_CATALOG,
    offers: over.offers ?? offersFor(meals),
    householdFactor: 1,
    budgetCop: 200_000,
    mode: "elastic",
    ...over,
  };
}

const slackKeys = (built, code) => [...built.slacks.keys()].filter((key) => key.startsWith(`s|${code}|`));
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} != ${expected}`);

// ---- Scale variables

test("one scale variable per group and role; batch meals share it", () => {
  const batchDays = new Set(["lun", "mar", "mie"]);
  const built = buildModel(input({
    meals: weekMeals((day, slot) => (slot === "almuerzo" && batchDays.has(day) ? "lentejas_batch" : `${day}.${slot}`)),
  }));
  const { variables, constraints } = built.model;

  // avena_con_banano has carb, protein and veg lines (panela is fixed) and no fat line.
  for (const role of ["carb", "protein", "veg"]) assert.ok(variables[`x|lun.desayuno|${role}`], role);
  assert.equal(variables["x|lun.desayuno|fat"], undefined);
  assert.equal(built.scaleVar("lun.desayuno", "carb"), "x|lun.desayuno|carb");

  // The three batch lunches share one variable per role; no per-day lunch variable exists for them.
  assert.ok(variables["x|lentejas_batch|protein"]);
  for (const day of batchDays) assert.equal(variables[`x|${day}.almuerzo|protein`], undefined);
  assert.ok(variables["x|jue.almuerzo|protein"]);

  // Bounds are rows named after the variable, from DEFAULT_ROLE_SCALE.
  assert.deepEqual(constraints["x|lentejas_batch|protein"], { min: 0.5, max: 2 });
  assert.deepEqual(constraints["x|lun.desayuno|veg"], { min: 0.75, max: 2.5 });
  assert.equal(variables["x|lentejas_batch|protein"]["x|lentejas_batch|protein"], 1);

  // The shared variable feeds three days of eating (70 g lentejas each) into the pack row.
  near(variables["x|lentejas_batch|protein"]["pack|lentejas"], -3 * 70);
  near(variables["x|jue.almuerzo|protein"]["pack|lentejas"], -70);
});

test("a recipe scale override replaces the default bounds", () => {
  const custom = { ...MENU.cena, scale: { protein: [0.8, 1.2] } };
  const meals = weekMeals().map((meal) => (meal.slot === "cena" ? { ...meal, recipe: custom } : meal));
  const built = buildModel(input({ meals }));

  assert.deepEqual(built.model.constraints["x|lun.cena|protein"], { min: 0.8, max: 1.2 });
  assert.deepEqual(built.model.constraints["x|lun.cena|carb"], { min: 0.5, max: 2 });
});

test("the chosen alternative is the food that enters the model", () => {
  const lentejas = MENU.almuerzo;
  const index = lentejas.lines.findIndex((line) => line.food === "lentejas");
  const meals = weekMeals().map((meal) =>
    meal.slot === "almuerzo" ? { ...meal, choice: { ...meal.choice, [index]: "frijol" } } : meal);
  const built = buildModel(input({ meals }));
  const frijolQty = lentejas.lines[index].alternatives.find((alt) => alt.food === "frijol").qty;

  assert.equal(built.model.variables["p|lentejas"], undefined);
  near(built.model.variables["x|lun.almuerzo|protein"]["pack|frijol"], -frijolQty);
  assert.equal(built.packVar("frijol"), "p|frijol");
});

// ---- Fixed lines, packs and budget

test("fixed lines move to the right-hand side", () => {
  const rules = rulesFor(["healthy"]);
  const built = buildModel(input({ rules }));
  const { constraints, variables } = built.model;

  // sal is fixed in lentejas (2 g) and pollo (2 g): 4 g a day, 28 g a week, no scale variable touches it.
  assert.deepEqual(constraints["pack|sal"], { min: 28 });
  assert.equal(Object.keys(variables).filter((name) => variables[name]["pack|sal"] !== undefined).join(), "p|sal");

  // The day's fixed kcal (panela, ajo, sal, cilantro) is subtracted from the kcal bounds.
  const fixedKcal = [["panela", 5], ["ajo", 6], ["sal", 4], ["cilantro", 10]]
    .reduce((sum, [id, qty]) => sum + nutritionOf(STATIC_CATALOG.get(id), qty).kcal, 0);
  const safety = rules.linear.find((rule) => rule.code === "kcal_safety");
  near(constraints["r|kcal_safety|lun|-"].min, safety.min - fixedKcal, "min");
  near(constraints["r|kcal_safety|lun|-"].max, safety.max - fixedKcal, "max");
});

test("one pack variable per food, priced in thousands of COP, covering what is eaten", () => {
  const meals = weekMeals();
  const offers = offersFor(meals);
  const built = buildModel(input({ meals, offers }));
  const offer = offers.get("arroz_blanco");

  assert.deepEqual(built.model.variables["p|arroz_blanco"], {
    cost: offer.packPriceCop / 1000,
    "pack|arroz_blanco": offer.packSize,
    budget: offer.packPriceCop,
  });
  // Foods only offered as unused alternatives (frijol, garbanzo) get no pack variable.
  assert.equal(built.model.variables["p|frijol"], undefined);
});

test("householdFactor multiplies the pack requirement", () => {
  const one = buildModel(input({ householdFactor: 1 })).model;
  const many = buildModel(input({ householdFactor: 2.5 })).model;

  near(many.variables["x|lun.almuerzo|protein"]["pack|lentejas"], 2.5 * one.variables["x|lun.almuerzo|protein"]["pack|lentejas"]);
  near(many.constraints["pack|sal"].min, 2.5 * one.constraints["pack|sal"].min);
  // Rules measure the user's own portion: nutrient rows do not change.
  assert.deepEqual(many.constraints["r|fiber_min|lun|-"], one.constraints["r|fiber_min|lun|-"]);
  const kcalRow = "r|kcal_safety|lun|-";
  assert.ok(one.variables["x|lun.almuerzo|protein"][kcalRow] > 0);
  assert.equal(many.variables["x|lun.almuerzo|protein"][kcalRow], one.variables["x|lun.almuerzo|protein"][kcalRow]);
});

test("budget row is hard in every mode; level-1 rules have no slack", () => {
  for (const mode of ["elastic", "strict", "safety_only"]) {
    const built = buildModel(input({ mode, goals: ["muscle", "healthy", "save"], budgetCop: 95_000 }));
    const { constraints, variables } = built.model;

    assert.deepEqual(constraints.budget, { max: 95_000 }, mode);
    assert.ok(Object.keys(variables).every((name) => !name.startsWith("s|") || built.slacks.has(name)), mode);
    assert.ok([...built.slacks.values()].every((info) => info.rule.level > 1), mode);
    for (const code of ["kcal_safety", "protein_safety_max", "protein_muscle_floor"]) {
      assert.ok(constraints[`r|${code}|lun|-`], `${mode} ${code}`);
      assert.equal(slackKeys(built, code).length, 0, `${mode} ${code}`);
    }
  }
});

test("no budget row when the budget is null", () => {
  const built = buildModel(input({ budgetCop: null }));

  assert.equal(built.model.constraints.budget, undefined);
  assert.ok(Object.values(built.model.variables).every((coefs) => coefs.budget === undefined));
});

// ---- Modes and slacks

test("elastic mode adds one slack per day rule per day with its penalty", () => {
  const b = buildModel(input({ mode: "elastic" }));

  assert.equal(slackKeys(b, "fiber_min").length, 7);
  assert.equal(b.model.variables["s|fiber_min|lun|-"].cost, PENALTY[3]);
  // The slack is relative: its coefficient is the rule's slackScale (25 g of fiber).
  assert.equal(b.model.variables["s|fiber_min|lun|-"]["r|fiber_min|lun|-"], 25);
  assert.deepEqual(b.slacks.get("s|fiber_min|lun|-"), {
    rule: b.slacks.get("s|fiber_min|lun|-").rule,
    day: "lun",
    sense: "min",
  });
  assert.equal(b.slacks.get("s|fiber_min|lun|-").rule.code, "fiber_min");
  // A max rule's slack loosens the bound: negative coefficient.
  assert.equal(b.model.variables["s|sodium_max|mar|-"]["r|sodium_max|mar|-"], -1999);
  assert.equal(b.slacks.get("s|sodium_max|mar|-").sense, "max");
});

test("a two-sided rule gets one slack per side", () => {
  const b = buildModel(input({ goals: [] }));
  const range = b.slacks.get("s|kcal_range|lun|-|min");

  assert.equal(range.sense, "min");
  assert.equal(b.slacks.get("s|kcal_range|lun|-|max").sense, "max");
  assert.equal(slackKeys(b, "kcal_range").length, 14);
  assert.equal(b.model.variables["s|kcal_range|lun|-|min"].cost, PENALTY[2]);
});

test("meal rules get one instance per day and slot, week rules one per week", () => {
  const b = buildModel(input({ goals: ["muscle", "save"] }));

  // desayuno, almuerzo and cena, both sides, seven days.
  assert.equal(slackKeys(b, "meal_protein_muscle").length, 7 * 3 * 2);
  assert.ok(b.slacks.has("s|meal_protein_muscle|lun|desayuno|min"));
  assert.ok(!b.slacks.has("s|meal_protein_muscle|lun|snacks|min"));
  assert.deepEqual(slackKeys(b, "cheap_protein_share"), ["s|cheap_protein_share|-|-"]);
  assert.equal(b.model.variables["s|cheap_protein_share|-|-"].cost, PENALTY[5]);
  assert.deepEqual(b.slacks.get("s|cheap_protein_share|-|-").sense, "min");
});

test("meal kcal share includes the whole day's kcal on the right side", () => {
  const b = buildModel(input({ goals: ["energy"] }));
  const lunchRow = "r|meal_kcal_share_max|lun|almuerzo";
  const { variables } = b.model;
  const kcal = (name) => variables[name]["r|kcal_safety|lun|-"];

  // Lunch's own variable: kcal − 0.4·kcal. Breakfast's variable only enters through the day: −0.4·kcal.
  near(variables["x|lun.almuerzo|carb"][lunchRow], 0.6 * kcal("x|lun.almuerzo|carb"));
  near(variables["x|lun.desayuno|carb"][lunchRow], -0.4 * kcal("x|lun.desayuno|carb"));
  assert.equal(variables["x|mar.desayuno|carb"][lunchRow], undefined);
  assert.equal(slackKeys(b, "meal_kcal_share_max").length, 28);
});

test("strict mode has no slack except cheap_protein_share", () => {
  const b = buildModel(input({ mode: "strict", goals: ["healthy", "save"] }));

  assert.deepEqual([...b.slacks.keys()], ["s|cheap_protein_share|-|-"]);
  const fiber = b.model.constraints["r|fiber_min|lun|-"];
  near(fiber.min, 25 - fixedFiber());
  assert.equal(fiber.max, undefined);
});

test("safety_only keeps level 1 and drops levels 2 to 5", () => {
  const b = buildModel(input({ mode: "safety_only", goals: ["healthy", "save"] }));
  const rows = Object.keys(b.model.constraints).filter((name) => name.startsWith("r|"));

  assert.equal(b.slacks.size, 0);
  assert.deepEqual([...new Set(rows.map((name) => name.split("|")[1]))].sort(), ["kcal_safety", "protein_safety_max"]);
});

// Fixed fiber of a day of MENU (panela, ajo, sal, cilantro).
function fixedFiber() {
  return [["panela", 5], ["ajo", 6], ["sal", 4], ["cilantro", 10]]
    .reduce((sum, [id, qty]) => sum + STATIC_CATALOG.get(id).micro.fiberG * qty / 100, 0);
}

// ---- Determinism, validation and safety of names

test("building twice gives the same model, key order included", () => {
  const a = buildModel(input({ goals: ["muscle", "healthy", "energy", "save"] }));
  const b = buildModel(input({ goals: ["muscle", "healthy", "energy", "save"] }));

  assert.equal(JSON.stringify(a.model), JSON.stringify(b.model));
  assert.deepEqual([...a.slacks.keys()], [...b.slacks.keys()]);
});

test("buildModel never changes its input", () => {
  const given = input();
  const snapshot = JSON.stringify({ ...given, rules: given.rules, offers: [...given.offers] });
  buildModel(given);

  assert.equal(JSON.stringify({ ...given, rules: given.rules, offers: [...given.offers] }), snapshot);
});

test("invalid input is rejected with a RangeError", () => {
  const ok = input();
  const firstLunch = ok.meals.findIndex((meal) => meal.slot === "almuerzo");
  const withMeal = (patch) => ok.meals.map((meal, i) => (i === firstLunch ? { ...meal, ...patch } : meal));
  const cases = {
    "non-finite household": { householdFactor: Number.NaN },
    "zero household": { householdFactor: 0 },
    "negative budget": { budgetCop: -1 },
    "infinite budget": { budgetCop: Infinity },
    "unknown mode": { mode: "loose" },
    "no meals": { meals: [] },
    "duplicate meal": { meals: [...ok.meals, ok.meals[0]] },
    "unknown day": { meals: withMeal({ day: "lunes" }) },
    "unknown slot": { meals: withMeal({ slot: "brunch" }) },
    "unsafe group name": { meals: withMeal({ group: "a|b" }) },
    "choice not an option of the line": { meals: withMeal({ choice: { ...ok.meals[firstLunch].choice, 0: "salmon" } }) },
    "group with two recipes": { meals: withMeal({ group: "lun.desayuno" }) },
    "missing pack offer": { offers: new Map([...ok.offers].filter(([food]) => food !== "lentejas")) },
    "pack size zero": { offers: new Map([...ok.offers, ["lentejas", { store: "D1", packSize: 0, packPriceCop: 100 }]]) },
    "negative pack price": { offers: new Map([...ok.offers, ["lentejas", { store: "D1", packSize: 500, packPriceCop: -5 }]]) },
    "food not in catalog": {
      catalog: { get: (id) => (id === "lentejas" ? undefined : STATIC_CATALOG.get(id)) },
    },
  };

  for (const [name, patch] of Object.entries(cases)) {
    assert.throws(() => buildModel({ ...ok, ...patch }), RangeError, name);
  }
});

test("a group repeated with a different choice is rejected", () => {
  const ok = input({ meals: weekMeals((day, slot) => (slot === "almuerzo" && day !== "dom" ? "batch" : `${day}.${slot}`)) });
  const index = MENU.almuerzo.lines.findIndex((line) => line.food === "lentejas");
  const meals = ok.meals.map((meal) =>
    meal.day === "mar" && meal.slot === "almuerzo" ? { ...meal, choice: { ...meal.choice, [index]: "frijol" } } : meal);

  assert.throws(() => buildModel({ ...ok, meals }), RangeError);
});

test("names in the model come only from ids, groups, codes, days and slots", () => {
  const b = buildModel(input({ goals: ["muscle", "healthy", "energy", "save"] }));
  const names = [
    ...Object.keys(b.model.constraints),
    ...Object.keys(b.model.variables),
    ...Object.values(b.model.variables).flatMap((coefs) => Object.keys(coefs)),
  ];

  for (const name of names) assert.match(name, /^[a-z0-9_.|-]+$/, name);
});

// ---- Realistic week: size, build time and a real solve

const ALL_GOALS = ["muscle", "healthy", "energy", "save"];

test("a realistic week stays small and builds fast", () => {
  const built = buildModel(input({ goals: ALL_GOALS, householdFactor: 3.4 }));
  const vars = Object.keys(built.model.variables).length;
  const rows = Object.keys(built.model.constraints).length;
  const runs = 20;
  const start = performance.now();
  for (let i = 0; i < runs; i++) buildModel(input({ goals: ALL_GOALS, householdFactor: 3.4 }));
  const perBuildMs = (performance.now() - start) / runs;

  console.log(`model size: ${vars} variables, ${rows} rows, ${built.slacks.size} slacks; build ${perBuildMs.toFixed(2)} ms`);
  assert.ok(vars < LP_MAX_VARIABLES / 2, `${vars} variables`);
  assert.ok(rows < LP_MAX_CONSTRAINTS / 2, `${rows} rows`);
  assert.ok(perBuildMs < 20, `${perBuildMs} ms`);
});

before(async () => {
  const wasm = () => readFile(new URL(import.meta.resolve("highs/runtime")));
  assert.equal(await prepareLp({ loadWasm: wasm }), true);
});

test("the built model solves: elastic with a generous budget is feasible and inside every bound", () => {
  const built = buildModel(input({ goals: ["healthy"], budgetCop: 400_000 }));
  const solution = solveLp(built.model);

  assert.equal(solution.feasible, true, solution.error);
  for (const [name, bounds] of Object.entries(built.model.constraints)) {
    if (!name.startsWith("x|")) continue;
    assert.ok(solution.values[name] >= bounds.min - 1e-6 && solution.values[name] <= bounds.max + 1e-6, name);
  }
  const spent = Object.entries(built.model.variables)
    .reduce((sum, [name, coefs]) => sum + (coefs.budget ?? 0) * solution.values[name], 0);
  assert.ok(spent <= 400_000 + 1e-6, `${spent}`);
});

test("strict mode with an impossible budget is infeasible, never a plan above budget", () => {
  const solution = solveLp(buildModel(input({ mode: "strict", budgetCop: 1_000 })).model);

  assert.equal(solution.feasible, false);
});
