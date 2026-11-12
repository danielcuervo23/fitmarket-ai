import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STATIC_CATALOG, createCatalog } from "../catalog.ts";
import { buildRestrictionRules, isAllowed } from "../planner/restrictions.ts";
import { SLOTS } from "../planner/types.ts";
import {
  MIN_RECIPES_PER_SLOT,
  WEEKEND_MAX_MINUTES,
  countBySlot,
  eligibleRecipes,
  recipeCoverage,
  resolveRecipe,
  weekdayMinutesCap,
} from "./eligibility.ts";
import { primaryChoice, recipeName } from "./expand.ts";
import { RECIPES } from "./library.generated.ts";
import { DEFAULT_COOKING } from "./types.ts";

const byId = (id) => RECIPES.find((recipe) => recipe.id === id);

/**
 * The 6 seed recipes, read from their JSON files and deep-frozen. Tests that
 * count recipes use this fixed set, so adding library recipes cannot change
 * them; the live library's coverage is tested in scripts/recipes/coverage.test.mjs.
 */
const SEED_IDS = [
  "arroz_con_huevo_y_tomate",
  "avena_con_banano",
  "huevos_pericos_con_arepa",
  "lentejas_con_arroz",
  "pollo_guisado_con_papa",
  "yogur_con_fruta",
];
const deepFreeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const SEED_RECIPES = deepFreeze(
  SEED_IDS.map((id) => JSON.parse(readFileSync(new URL(`../../../../data/recipes/${id}.json`, import.meta.url), "utf8"))),
);
const lentejas = byId("lentejas_con_arroz");
const pericos = byId("huevos_pericos_con_arepa");
const yogur = byId("yogur_con_fruta");
const pollo = byId("pollo_guisado_con_papa");

/** Only the stores listed here lack the listed foods; everything else is carried. */
const fakePrices = (notCarried = {}) => ({
  carries: (store, food) => !(notCarried[store] ?? []).includes(food),
  quote: () => {
    throw new Error("quote is not used by eligibility");
  },
});

function ctx({
  restrictions = [],
  excludedIds = [],
  catalog = STATIC_CATALOG,
  stores = [],
  notCarried = {},
  cooking = {},
} = {}) {
  const rules = buildRestrictionRules(restrictions, catalog);
  excludedIds.forEach((id) => rules.excludedIds.add(id));

  return {
    rules,
    catalog,
    prices: fakePrices(notCarried),
    stores,
    cooking: { ...DEFAULT_COOKING, ...cooking },
  };
}

/** A test-only recipe built on lentejas_con_arroz (never edits library data). */
const fixture = (overrides) => ({ ...lentejas, ...overrides });

const foodsOf = (recipe) =>
  recipe.lines.flatMap((line) => [line.food, ...(line.alternatives ?? []).map((alt) => alt.food)]);

test("weekday minute caps: 10 -> 10, 20 -> 20, 30 means 30+ -> 45", () => {
  assert.equal(weekdayMinutesCap(10), 10);
  assert.equal(weekdayMinutesCap(20), 20);
  assert.equal(weekdayMinutesCap(30), 45);
  assert.equal(WEEKEND_MAX_MINUTES, 60);
  assert.equal(MIN_RECIPES_PER_SLOT, 3);
});

test("vegan drops recipes with egg and swaps nothing into meat", () => {
  const context = ctx({ restrictions: ["vegan"] });
  const ids = eligibleRecipes(RECIPES, context).map((recipe) => recipe.id);

  assert.ok(!ids.includes("huevos_pericos_con_arepa"));
  assert.ok(!ids.includes("arroz_con_huevo_y_tomate"));
  assert.ok(!ids.includes("pollo_guisado_con_papa"));
  assert.ok(!ids.includes("yogur_con_fruta"));
  assert.ok(ids.includes("lentejas_con_arroz"));

  for (const recipe of eligibleRecipes(RECIPES, context)) {
    for (const food of foodsOf(recipe)) {
      assert.ok(isAllowed(STATIC_CATALOG.get(food), context.rules), `${recipe.id}: ${food}`);
    }
  }
});

test("a forbidden primary is replaced by its first allowed alternative", () => {
  const r = resolveRecipe(lentejas, ctx({ excludedIds: ["lentejas"] }));

  assert.equal(r.lines[0].food, "frijol");
  assert.equal(r.lines[0].qty, 70);
  assert.deepEqual(r.lines[0].alternatives.map((alt) => alt.food), ["garbanzo"]);
  assert.deepEqual(recipeName(r, primaryChoice(r)).es, "Fríjoles con arroz");
  assert.deepEqual(recipeName(r, primaryChoice(r)).en, "Beans with rice");
});

test("an unusable alternative is removed, the primary stays", () => {
  const r = resolveRecipe(lentejas, ctx({ excludedIds: ["frijol"] }));

  assert.equal(r.lines[0].food, "lentejas");
  assert.deepEqual(r.lines[0].alternatives.map((alt) => alt.food), ["garbanzo"]);
  assert.equal(recipeName(r, primaryChoice(r)).es, "Lentejas con arroz");
});

test("a required line with no usable food makes the recipe ineligible", () => {
  assert.equal(resolveRecipe(lentejas, ctx({ excludedIds: ["lentejas", "frijol", "garbanzo"] })), null);
  assert.equal(resolveRecipe(pericos, ctx({ restrictions: ["vegan"] })), null);
});

test("a forbidden optional line (cilantro) is dropped, the recipe stays", () => {
  const r = resolveRecipe(lentejas, ctx({ restrictions: ["cilantro"] }));

  assert.ok(r);
  assert.ok(!foodsOf(r).includes("cilantro"));
  assert.equal(r.lines.length, lentejas.lines.length - 1);
});

test("a recipe left with only fixed lines is ineligible", () => {
  const onlyOptional = fixture({
    id: "solo_fijos",
    lines: [
      { food: "lentejas", qty: 70, role: "protein", optional: true },
      { food: "sal", qty: 1, role: "fixed" },
    ],
  });

  assert.equal(resolveRecipe(onlyOptional, ctx({ excludedIds: ["lentejas"] })), null);
});

test("a recipe needing horno is excluded with the default kitchen", () => {
  const horneado = fixture({ id: "horneado", appliances: ["horno"], minutes: 15 });

  assert.equal(resolveRecipe(horneado, ctx()), null);
  assert.ok(resolveRecipe(horneado, ctx({ cooking: { appliances: ["horno"] } })));
});

test("a no-cook recipe (no appliances) fits any kitchen", () => {
  assert.deepEqual(yogur.appliances, []);
  assert.ok(resolveRecipe(yogur, ctx({ cooking: { appliances: ["microondas"] } })));
});

test("35-minute basic recipe is weekendOnly with the 20-minute default", () => {
  const r = resolveRecipe(fixture({ id: "treinta_y_cinco", minutes: 35 }), ctx());

  assert.equal(r.weekendOnly, true);
  assert.equal(resolveRecipe(pericos, ctx()).weekendOnly, false);
  assert.equal(resolveRecipe(fixture({ id: "largo", minutes: 61 }), ctx()), null);
});

test("an 'enjoys' recipe is excluded for a basic cook even on weekends", () => {
  const enjoys = fixture({ id: "elaborado", level: "enjoys", minutes: 15 });
  const comfortable = fixture({ id: "intermedio", level: "comfortable", minutes: 15 });

  assert.equal(resolveRecipe(enjoys, ctx()), null);
  assert.equal(resolveRecipe(comfortable, ctx()).weekendOnly, true);
  assert.equal(resolveRecipe(enjoys, ctx({ cooking: { level: "comfortable" } })).weekendOnly, true);
  assert.equal(resolveRecipe(enjoys, ctx({ cooking: { level: "enjoys" } })).weekendOnly, false);
});

test("30 means up to 45 minutes on weekdays", () => {
  const cooking = { weekdayMinutes: 30 };

  assert.equal(resolveRecipe(lentejas, ctx({ cooking })).weekendOnly, false); // 45 min
  assert.equal(resolveRecipe(fixture({ id: "cuarenta_seis", minutes: 46 }), ctx({ cooking })).weekendOnly, true);
});

test("a food no selected store carries makes its line unusable", () => {
  const notCarried = { D1: ["lentejas"], Ara: ["lentejas"] };

  const r = resolveRecipe(lentejas, ctx({ stores: ["D1", "Ara"], notCarried }));
  assert.equal(r.lines[0].food, "frijol");

  const oneStoreHasIt = resolveRecipe(lentejas, ctx({ stores: ["D1", "Exito"], notCarried }));
  assert.equal(oneStoreHasIt.lines[0].food, "lentejas");

  const noStores = resolveRecipe(lentejas, ctx({ stores: [], notCarried }));
  assert.equal(noStores.lines[0].food, "lentejas");
});

test("a food without micro-nutrient data is unusable, never a crash", () => {
  const noMicro = (ids) =>
    createCatalog(
      STATIC_CATALOG.all.map((food) => {
        if (!ids.includes(food.id)) return food;
        const { micro: _ignored, ...rest } = food;
        return rest;
      }),
    );

  const withoutCilantro = resolveRecipe(lentejas, ctx({ catalog: noMicro(["cilantro"]) }));
  assert.ok(!foodsOf(withoutCilantro).includes("cilantro"));

  assert.equal(resolveRecipe(lentejas, ctx({ catalog: noMicro(["zanahoria"]) })), null);
});

test("a food missing from the catalog is unusable", () => {
  const catalog = createCatalog(STATIC_CATALOG.all.filter((food) => food.id !== "lentejas"));

  assert.equal(resolveRecipe(lentejas, ctx({ catalog })).lines[0].food, "frijol");
});

test("library data is never mutated (it is deep-frozen)", () => {
  const before = JSON.stringify(RECIPES);

  const r = resolveRecipe(lentejas, ctx({ excludedIds: ["lentejas", "cilantro"] }));
  eligibleRecipes(RECIPES, ctx({ restrictions: ["vegan", "gluten"] }));

  assert.notEqual(r, lentejas);
  assert.equal(JSON.stringify(RECIPES), before);
  assert.equal(lentejas.lines[0].food, "lentejas");
  assert.deepEqual(DEFAULT_COOKING.appliances, ["estufa", "licuadora"]);
});

test("countBySlot counts slot membership and always has every slot", () => {
  const counts = countBySlot(eligibleRecipes(SEED_RECIPES, ctx({ cooking: { weekdayMinutes: 30 } })));

  assert.deepEqual(Object.keys(counts).sort(), [...SLOTS].sort());
  assert.equal(counts.desayuno, 3); // avena, pericos, yogur
  assert.equal(counts.almuerzo, 3); // arroz con huevo, lentejas, pollo
  assert.equal(counts.cena, 4); // + pericos
  assert.equal(counts.snacks, 2); // avena, yogur
  assert.deepEqual(countBySlot([]), { desayuno: 0, almuerzo: 0, cena: 0, snacks: 0 });
});

test("vegan + microwave only: restrictions_too_strict with availableRecipes, no forbidden food", () => {
  const context = ctx({ restrictions: ["vegan"], cooking: { appliances: ["microondas"] } });
  const eligible = eligibleRecipes(SEED_RECIPES, context);

  assert.deepEqual(eligible, []);
  assert.deepEqual(recipeCoverage(eligible), {
    ok: false,
    code: "restrictions_too_strict",
    availableRecipes: { desayuno: 0, almuerzo: 0, cena: 0, snacks: 0 },
    totalRecipes: { desayuno: 0, almuerzo: 0, cena: 0, snacks: 0 },
  });
});

test("lactose + gluten + fish at 10 minutes: too strict, counts per slot, only allowed foods", () => {
  const context = ctx({ restrictions: ["lactose", "gluten", "fish", "shellfish"], cooking: { weekdayMinutes: 10 } });
  const eligible = eligibleRecipes(SEED_RECIPES, context);
  const coverage = recipeCoverage(eligible);

  assert.equal(coverage.ok, false);
  assert.equal(coverage.code, "restrictions_too_strict");
  assert.deepEqual(coverage.availableRecipes, countBySlot(eligible.filter((recipe) => !recipe.weekendOnly)));
  assert.deepEqual(coverage.totalRecipes, countBySlot(eligible));

  for (const recipe of eligible) {
    for (const food of foodsOf(recipe)) {
      assert.ok(isAllowed(STATIC_CATALOG.get(food), context.rules), `${recipe.id}: ${food}`);
    }
  }
});

test("coverage is ok when every slot has at least MIN_RECIPES_PER_SLOT recipes", () => {
  const plenty = SLOTS.flatMap((slot) =>
    [1, 2, 3].map((n) => ({ ...resolveRecipe(pollo, ctx({ cooking: { weekdayMinutes: 30 } })), id: `${slot}_${n}`, slots: [slot] })),
  );

  const three = { desayuno: 3, almuerzo: 3, cena: 3, snacks: 3 };
  assert.deepEqual(recipeCoverage(plenty), { ok: true, availableRecipes: three, totalRecipes: three });
});

test("two recipes per slot is still too strict", () => {
  const base = resolveRecipe(pollo, ctx({ cooking: { weekdayMinutes: 30 } }));
  const two = SLOTS.flatMap((slot) => [1, 2].map((n) => ({ ...base, id: `${slot}_${n}`, slots: [slot] })));

  assert.equal(recipeCoverage(two).ok, false);
  assert.deepEqual(recipeCoverage(two).availableRecipes, { desayuno: 2, almuerzo: 2, cena: 2, snacks: 2 });
});

test("weekend-only recipes do not count toward coverage (weekdays would be empty)", () => {
  const weekday = resolveRecipe(pollo, ctx({ cooking: { weekdayMinutes: 30 } }));
  const recipes = SLOTS.flatMap((slot) =>
    [1, 2, 3].map((n) => ({ ...weekday, id: `${slot}_${n}`, slots: [slot], weekendOnly: slot === "cena" })),
  );

  assert.deepEqual(recipeCoverage(recipes), {
    ok: false,
    code: "restrictions_too_strict",
    availableRecipes: { desayuno: 3, almuerzo: 3, cena: 0, snacks: 3 },
    totalRecipes: { desayuno: 3, almuerzo: 3, cena: 3, snacks: 3 },
  });
});

test("a resolved recipe owns its arrays: changing them never touches the frozen library", () => {
  const before = JSON.stringify(RECIPES);
  const r = resolveRecipe(lentejas, ctx());
  const scaled = resolveRecipe(fixture({ id: "con_escala", scale: { protein: [0.8, 1.5] } }), ctx({ cooking: { weekdayMinutes: 30 } }));

  r.slots.push("desayuno");
  r.appliances.push("horno");
  r.steps.es.push("x");
  r.steps.en.push("x");
  r.batch.keepsDays = 1;
  r.name.es = "x";
  scaled.scale.protein[1] = 3;

  assert.equal(JSON.stringify(RECIPES), before);
});

test("a line without alternatives stays without the key (weekday and weekend)", () => {
  const avena = byId("avena_con_banano");
  const weekday = resolveRecipe(avena, ctx());
  assert.equal(weekday.weekendOnly, false);
  assert.equal("alternatives" in weekday.lines[0], false);
  assert.deepEqual(weekday.lines[1].alternatives.map((alt) => alt.food), ["leche_deslactosada"]);

  const weekend = resolveRecipe(pollo, ctx());
  assert.equal(weekend.weekendOnly, true);
  assert.ok(weekend.lines.every((line) => !("alternatives" in line) || line.alternatives.length > 0));
});

test("a weekday line whose alternatives all need soaking loses the key", () => {
  const r = resolveRecipe(lentejas, ctx({ cooking: { weekdayMinutes: 30 } }));

  assert.equal(r.weekendOnly, false);
  assert.equal(r.lines[0].food, "lentejas");
  assert.equal("alternatives" in r.lines[0], false);
});

test("a line whose only alternative is unusable loses the key", () => {
  const r = resolveRecipe(byId("avena_con_banano"), ctx({ excludedIds: ["leche_deslactosada"] }));

  assert.equal(r.lines[1].food, "leche_entera");
  assert.equal("alternatives" in r.lines[1], false);
});
