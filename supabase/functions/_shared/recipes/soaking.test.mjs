// Owner decision 2026-11-11: dried legumes that must soak overnight (fríjol,
// garbanzo, arveja seca; never lentejas) are cooked only on Saturday or Sunday.
import assert from "node:assert/strict";
import test from "node:test";
import { STATIC_CATALOG } from "../catalog.ts";
import { buildRestrictionRules } from "../planner/restrictions.ts";
import { eligibleRecipes, needsSoaking, resolveRecipe, soakFoodsOf } from "./eligibility.ts";
import { RECIPES, SOAK_FOODS } from "./library.generated.ts";
import { DEFAULT_COOKING } from "./types.ts";

const byId = (id) => RECIPES.find((recipe) => recipe.id === id);
const lentejas = byId("lentejas_con_arroz");

const carriesAll = (notCarried = []) => ({
  carries: (_store, food) => !notCarried.includes(food),
  quote: () => {
    throw new Error("quote is not used by eligibility");
  },
});

/** 30 means "30 or more": weekday cap 45 min, so lentejas_con_arroz (45 min) fits a weekday. */
const ctx = ({ excludedIds = [], stores = [], notCarried = [], cooking = { weekdayMinutes: 30 } } = {}) => {
  const rules = buildRestrictionRules([], STATIC_CATALOG);
  excludedIds.forEach((id) => rules.excludedIds.add(id));
  return { rules, catalog: STATIC_CATALOG, prices: carriesAll(notCarried), stores, cooking: { ...DEFAULT_COOKING, ...cooking } };
};

/** lentejas_con_arroz with fríjol as the main food: 45 min, so time alone would allow a weekday. */
const frijolesConArroz = {
  ...lentejas,
  id: "test_frijoles_con_arroz",
  lines: lentejas.lines.map((line, index) => (index === 0 ? { food: "frijol", qty: 70, role: "protein" } : line)),
};

const allFoods = (recipe) => recipe.lines.flatMap((l) => [l.food, ...(l.alternatives ?? []).map((a) => a.food)]);

test("only dried fríjol, garbanzo and arveja seca need soaking (not lentejas)", () => {
  assert.deepEqual([...SOAK_FOODS].sort(), ["arveja_seca", "frijol", "garbanzo"]);
  assert.equal(needsSoaking("frijol"), true);
  assert.equal(needsSoaking("lentejas"), false);
});

test("(a) a soak recipe is never usable on a weekday, even when its time fits", () => {
  const resolved = resolveRecipe(frijolesConArroz, ctx());
  assert.equal(resolved.weekendOnly, true);
});

test("(b) a soak recipe stays usable on Saturday and Sunday", () => {
  const resolved = resolveRecipe(frijolesConArroz, ctx());
  assert.notEqual(resolved, null);
  assert.deepEqual(soakFoodsOf(resolved), ["frijol"]);
  for (const id of ["frijoles_en_olla_a_presion", "garbanzos_guisados_con_papa", "sopa_de_arveja_seca"]) {
    const library = resolveRecipe(byId(id), ctx({ cooking: { weekdayMinutes: 30, level: "comfortable", appliances: ["estufa", "olla_presion"] } }));
    assert.equal(library?.weekendOnly, true, id);
  }
});

test("(c) a soak alternative is never swapped in on a weekday", () => {
  // Lentejas usable: the recipe stays weekday-capable and loses its soak alternatives.
  const weekday = resolveRecipe(lentejas, ctx());
  assert.equal(weekday.weekendOnly, false);
  assert.ok(allFoods(weekday).every((food) => !needsSoaking(food)), allFoods(weekday).join(","));

  // Lentejas unusable: fríjol comes in, and then the recipe is weekend-only.
  const swapped = resolveRecipe(lentejas, ctx({ excludedIds: ["lentejas"] }));
  assert.equal(swapped.lines[0].food, "frijol");
  assert.equal(swapped.weekendOnly, true);
  assert.deepEqual(soakFoodsOf(swapped), ["frijol"]);

  // Same when the store does not sell lentejas.
  const store = resolveRecipe(lentejas, ctx({ stores: ["d1"], notCarried: ["lentejas"] }));
  assert.equal(store.weekendOnly, true);
});

test("(c) no weekday-capable recipe of the library carries a soak food, in any kitchen", () => {
  const kitchens = [
    {},
    { weekdayMinutes: 10 },
    { weekdayMinutes: 30, level: "enjoys", appliances: ["estufa", "olla_presion", "microondas", "licuadora", "horno"] },
  ];
  for (const cooking of kitchens) {
    for (const recipe of eligibleRecipes(RECIPES, ctx({ cooking }))) {
      if (recipe.weekendOnly) continue;
      assert.ok(allFoods(recipe).every((food) => !needsSoaking(food)), `${recipe.id}: ${allFoods(recipe).join(",")}`);
    }
  }
});

test("(e) lentejas are unaffected: weekday-capable with lentejas as the main food", () => {
  const resolved = resolveRecipe(lentejas, ctx());
  assert.equal(resolved.lines[0].food, "lentejas");
  assert.equal(resolved.weekendOnly, false);
  assert.deepEqual(soakFoodsOf(resolved), []);
  assert.equal(resolveRecipe(byId("sopa_de_lentejas"), ctx()).weekendOnly, false);
});
