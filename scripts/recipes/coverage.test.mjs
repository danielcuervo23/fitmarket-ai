// Coverage of the recipe library (Plan 2, Task 5).
//
// Proves, with the real eligibility code (resolveRecipe / recipeCoverage), that
// the library serves frequent restriction profiles and kitchens: vegetarian,
// vegan, lactose-, gluten-, fish- and pork-free; stove, microwave only or no
// cooking at all; 10-minute weekdays; batch cooking; cheap proteins; legumes,
// iron sources and 400 g of fruit and vegetables a day.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STATIC_CATALOG } from "../../supabase/functions/_shared/catalog.ts";
import { buildRestrictionRules } from "../../supabase/functions/_shared/planner/restrictions.ts";
import { STATIC_PRICE_BOOK } from "../../supabase/functions/_shared/planner/stores.ts";
import { SLOTS } from "../../supabase/functions/_shared/planner/types.ts";
import {
  eligibleRecipes,
  recipeCoverage,
  resolveRecipe,
} from "../../supabase/functions/_shared/recipes/eligibility.ts";
import { RECIPES } from "../../supabase/functions/_shared/recipes/library.generated.ts";
import { DEFAULT_COOKING } from "../../supabase/functions/_shared/recipes/types.ts";

const PROFILES = {
  none: [],
  vegetarian: ["vegetarian"],
  vegan: ["vegan"],
  lactose: ["lactose"],
  gluten: ["gluten"],
  fish: ["fish", "shellfish"],
  pork: ["pork"],
};

const KITCHENS = {
  default: {},
  quick10: { weekdayMinutes: 10 },
  microwave: { appliances: ["microondas"] },
  microwave10: { appliances: ["microondas"], weekdayMinutes: 10 },
  noCook: { appliances: [], weekdayMinutes: 10 },
};

const ctx = (restrictions, cooking = {}) => ({
  rules: buildRestrictionRules(restrictions, STATIC_CATALOG),
  catalog: STATIC_CATALOG,
  prices: STATIC_PRICE_BOOK,
  stores: [],
  cooking: { ...DEFAULT_COOKING, ...cooking },
});

const usable = (restrictions, cooking) => eligibleRecipes(RECIPES, ctx(restrictions, cooking));
const weekday = (restrictions, cooking) => usable(restrictions, cooking).filter((r) => !r.weekendOnly);

const LEGUMES = new Set(["lentejas", "frijol", "garbanzo", "arveja_seca"]);
const CHEAP_PROTEINS = ["huevo", "lentejas", "frijol", "garbanzo", "arveja_seca", "pernil_pollo", "sardina_lata"];
/** A legume or iron source only counts from 30 g in the meal. */
const MIN_SOURCE_GRAMS = 30;

const gramsOf = (food, qty) => {
  const ingredient = STATIC_CATALOG.get(food);
  return ingredient.unit === "unit" ? qty * ingredient.gramsPerUnit : qty;
};

const isIronSource = (food) => {
  const micro = STATIC_CATALOG.get(food).micro;
  return micro !== undefined && micro.ironMg >= 1.5 && ["proteicos", "frutas_verduras"].includes(micro.gabaGroup);
};

const hasLine = (recipe, predicate) =>
  recipe.lines.some((line) => predicate(line.food) && gramsOf(line.food, line.qty) >= MIN_SOURCE_GRAMS);

const fruitVegGrams = (recipe) =>
  recipe.lines
    .filter((line) => STATIC_CATALOG.get(line.food).micro?.isFruitVeg)
    .reduce((sum, line) => sum + gramsOf(line.food, line.qty), 0);

const count = (recipes, slot) => recipes.filter((recipe) => recipe.slots.includes(slot)).length;

// ---- The library itself

test("at least 48 recipes, all pending the owner's OK or approved", () => {
  assert.ok(RECIPES.length >= 48, `${RECIPES.length} recipes`);
  for (const recipe of RECIPES) {
    assert.ok(["pending_owner_ok", "approved"].includes(recipe.status), recipe.id);
    if (recipe.source === "ai_draft") assert.equal(recipe.status, "pending_owner_ok", recipe.id);
  }
});

test("every recipe has at most 6 steps", () => {
  for (const recipe of RECIPES) assert.ok(recipe.steps.es.length <= 6, `${recipe.id}: ${recipe.steps.es.length}`);
});

test("no recipe step mentions an appliance the recipe does not list", () => {
  const KEYWORDS = {
    horno: /\bhorno\b/i,
    microondas: /microondas/i,
    freidora_aire: /freidora/i,
    sandwichera: /sandwichera/i,
    olla_presion: /olla (a|de) presi[oó]n|olla express/i,
    olla_arrocera: /olla arrocera/i,
    licuadora: /licuadora|lic[uú]a/i,
  };
  for (const recipe of RECIPES) {
    for (const step of recipe.steps.es) {
      for (const [appliance, pattern] of Object.entries(KEYWORDS)) {
        if (pattern.test(step)) assert.ok(recipe.appliances.includes(appliance), `${recipe.id}: "${step}" needs ${appliance}`);
      }
    }
  }
});

// A step must work for every food the line can swap to. Simple check: for each
// line with alternatives, the primary food's catalog name (singular or plural,
// ignoring accents and case) must not appear in any step. A name that is also
// part of an alternative's name ("papa" in "papa criolla") is generic, so it is
// allowed. Steps should say "la fruta", "la grasa", "los granos" instead.
const plain = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const namesOf = (food) => {
  const ingredient = STATIC_CATALOG.get(food);
  return [ingredient.name.es, ingredient.plural?.es, food.replaceAll("_", " ")]
    .filter(Boolean)
    .map((name) => plain(name.replace(/\s*\(.*\)\s*/g, " ").trim()));
};

const mentions = (text, name) => {
  const stem = name.replace(/e?s$/, "");
  return new RegExp(`\\b(${name}|${stem}|${stem}s|${stem}es)\\b`).test(plain(text));
};

test("no step names the primary food of a line that has alternatives", () => {
  const problems = [];
  for (const recipe of RECIPES) {
    for (const line of recipe.lines) {
      const alternatives = line.alternatives ?? [];
      if (alternatives.length === 0) continue;
      const altNames = alternatives.flatMap((alt) => namesOf(alt.food));
      const names = namesOf(line.food).filter((name) => !altNames.some((alt) => mentions(alt, name)));
      for (const step of recipe.steps.es) {
        const hit = names.find((name) => mentions(step, name));
        if (hit) problems.push(`${recipe.id}: "${hit}" in "${step}"`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

// Lunch and dinner must feed: at least 15 g of protein at base portions.
// Optional lines are left out (the user may skip them). Nutrition comes from
// data/foods/foods.json (protein per 100 g or 100 ml; unit foods use gramsPerUnit).
const MIN_MAIN_MEAL_PROTEIN_G = 15;
const FOODS = new Map(
  JSON.parse(readFileSync(new URL("../../data/foods/foods.json", import.meta.url), "utf8")).map((food) => [food.id, food]),
);

const baseProtein = (recipe) =>
  recipe.lines
    .filter((line) => !line.optional)
    .reduce((sum, line) => {
      const food = FOODS.get(line.food);
      const grams = food.unit === "unit" ? line.qty * food.gramsPerUnit : line.qty;
      return sum + (grams * food.proteinG) / 100;
    }, 0);

test("every lunch or dinner recipe gives at least 15 g protein at base portions", () => {
  const low = RECIPES.filter((r) => r.slots.includes("almuerzo") || r.slots.includes("cena"))
    .filter((r) => baseProtein(r) < MIN_MAIN_MEAL_PROTEIN_G)
    .map((r) => `${r.id}: ${baseProtein(r).toFixed(1)} g`);
  assert.deepEqual(low, []);
});

test("at least 12 batch-friendly lunch or dinner recipes", () => {
  const batch = RECIPES.filter((r) => r.batch.ok && (r.slots.includes("almuerzo") || r.slots.includes("cena")));
  assert.ok(batch.length >= 12, `${batch.length}`);
});

test("every slot has at least one weekend recipe of 30-60 minutes", () => {
  for (const slot of SLOTS) {
    assert.ok(RECIPES.some((r) => r.slots.includes(slot) && r.minutes >= 30 && r.minutes <= 60), slot);
  }
});

test("at least 70 % of recipes are basic, <= 20 min and need only estufa/licuadora", () => {
  const simple = RECIPES.filter(
    (r) => r.level === "basic" && r.minutes <= 20 && r.appliances.every((a) => a === "estufa" || a === "licuadora"),
  );
  assert.ok(simple.length >= 0.7 * RECIPES.length, `${simple.length} of ${RECIPES.length}`);
});

// ---- Restriction profiles with the default kitchen (stove + blender, basic, 20 minutes)

for (const [name, restrictions] of Object.entries(PROFILES)) {
  for (const slot of SLOTS) {
    test(`${name} has enough ${slot} recipes with the default kitchen`, () => {
      const n = RECIPES.filter((r) => r.slots.includes(slot) && resolveRecipe(r, ctx(restrictions))?.weekendOnly === false).length;
      assert.ok(n >= (name === "vegan" || slot === "snacks" ? 3 : 4), `${n}`);
    });
  }
}

// ---- Kitchens: recipeCoverage must be ok (>= 3 weekday recipes in every slot)

const MUST_COVER = [
  ...Object.keys(PROFILES).flatMap((profile) => [
    [profile, "default"],
    [profile, "quick10"],
    [profile, "microwave"],
  ]),
  ["none", "microwave10"],
  ["vegetarian", "microwave10"],
  ["vegan", "microwave10"],
  ["lactose", "microwave10"],
  ["gluten", "microwave10"],
  ["none", "noCook"],
  ["vegetarian", "noCook"],
];

for (const [profile, kitchen] of MUST_COVER) {
  test(`${profile} + ${kitchen} kitchen: at least 3 weekday recipes in every slot`, () => {
    const coverage = recipeCoverage(usable(PROFILES[profile], KITCHENS[kitchen]));
    assert.equal(coverage.ok, true, JSON.stringify(coverage.availableRecipes));
  });
}

test("lactose + gluten + fish-free at 10 minutes with the default kitchen is covered", () => {
  const coverage = recipeCoverage(usable(["lactose", "gluten", "fish", "shellfish"], KITCHENS.quick10));
  assert.equal(coverage.ok, true, JSON.stringify(coverage.availableRecipes));
});

// Known gaps (Review Focus 2): with no stove at all, too few breakfasts or lunches
// stay for these profiles (the catalog has no canned legumes or gluten-free
// bread). They must come back as restrictions_too_strict with counts per slot,
// never as a crash or an empty slot without a code.
const KNOWN_GAPS = [
  [["vegan"], "noCook"],
  [["gluten"], "noCook"],
  [["lactose", "gluten", "fish", "shellfish"], "microwave"],
  [["lactose", "gluten", "fish", "shellfish"], "microwave10"],
  [["lactose", "gluten", "fish", "shellfish"], "noCook"],
];

// Pinned on purpose: when a recipe closes one of these gaps this test fails, so
// the gap moves to MUST_COVER and docs/RECIPES.md is updated with it.
for (const [restrictions, kitchen] of KNOWN_GAPS) {
  test(`known gap ${restrictions.join("+")} + ${kitchen}: still open, reported as restrictions_too_strict with counts`, () => {
    const coverage = recipeCoverage(usable(restrictions, KITCHENS[kitchen]));
    assert.equal(coverage.ok, false, `gap closed: move it to MUST_COVER and update docs/RECIPES.md (${JSON.stringify(coverage.availableRecipes)})`);
    assert.equal(coverage.code, "restrictions_too_strict");
    assert.deepEqual(Object.keys(coverage.availableRecipes).sort(), [...SLOTS].sort());
  });
}

// ---- Nutrition the rules ask for

test("each cheap protein is the main food (>= 30 g or 1 egg) of a recipe, and offered in at least 2", () => {
  const offers = (recipe, food) =>
    recipe.lines.some((line) =>
      [line, ...(line.alternatives ?? [])].some((use) => use.food === food && gramsOf(food, use.qty) >= MIN_SOURCE_GRAMS),
    );
  for (const food of CHEAP_PROTEINS) {
    assert.ok(RECIPES.some((r) => hasLine(r, (f) => f === food)), `${food} is never the main food`);
    const n = RECIPES.filter((r) => offers(r, food)).length;
    assert.ok(n >= 2, `${food}: ${n}`);
  }
});

test("lunch and dinner recipes with a real legume portion are plentiful", () => {
  const legumeMeals = RECIPES.filter(
    (r) => (r.slots.includes("almuerzo") || r.slots.includes("cena")) && hasLine(r, (f) => LEGUMES.has(f)),
  );
  assert.ok(legumeMeals.length >= 6, `${legumeMeals.length}`);
});

for (const [name, restrictions] of Object.entries(PROFILES)) {
  test(`${name}: at least 2 lunch/dinner recipes with a legume (any day)`, () => {
    const n = usable(restrictions, {}).filter(
      (r) => (r.slots.includes("almuerzo") || r.slots.includes("cena")) && hasLine(r, (f) => LEGUMES.has(f)),
    ).length;
    assert.ok(n >= 2, `${n}`);
  });

  test(`${name}: at least 5 recipes with an iron source (any day)`, () => {
    const n = usable(restrictions, {}).filter((r) => hasLine(r, isIronSource)).length;
    assert.ok(n >= 5, `${n}`);
  });

  test(`${name}: weekday recipes can reach 400 g of fruit and vegetables a day at base portions`, () => {
    const recipes = weekday(restrictions, {});
    const best = (slot, skip) =>
      Math.max(0, ...recipes.filter((r) => r.slots.includes(slot) && r.id !== skip).map(fruitVegGrams));
    const bestLunch = recipes.filter((r) => r.slots.includes("almuerzo")).sort((a, b) => fruitVegGrams(b) - fruitVegGrams(a))[0];
    const total = best("desayuno") + (bestLunch ? fruitVegGrams(bestLunch) : 0) + best("cena", bestLunch?.id) + best("snacks");
    assert.ok(total >= 400, `${total} g`);
  });
}

test("counts per slot are reported for the default kitchen", () => {
  for (const slot of SLOTS) assert.ok(count(RECIPES, slot) >= 10, `${slot}: ${count(RECIPES, slot)}`);
});
