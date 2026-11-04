import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG,
  STATIC_CATALOG,
  createCatalog,
  getIngredient,
} from "../catalog.ts";
import { assemblePlan } from "./build.ts";
import { generatePlan } from "./generate.ts";
import { buildRestrictionRules } from "./restrictions.ts";
import { DAYS, SLOTS } from "./types.ts";

test("createCatalog rejects duplicate ids", () => {
  const huevo = getIngredient("huevo");
  assert.throws(() => createCatalog([huevo, { ...huevo }]), /huevo/);
});

test("STATIC_CATALOG matches CATALOG", () => {
  assert.equal(STATIC_CATALOG.all.length, CATALOG.length);
  assert.equal(STATIC_CATALOG.get("huevo"), getIngredient("huevo"));
});

test("restrictions use the given catalog", () => {
  const custom = createCatalog([
    ...CATALOG,
    {
      ...getIngredient("lentejas"),
      id: "bocadillo",
      name: { es: "Bocadillo", en: "Guava paste" },
    },
  ]);

  const rules = buildRestrictionRules(["bocadillo"], custom);
  assert.ok(rules.excludedIds.has("bocadillo"));
  assert.deepEqual(rules.unmatchedText, []);

  const fallback = buildRestrictionRules(["bocadillo"], STATIC_CATALOG);
  assert.deepEqual(fallback.unmatchedText, ["bocadillo"]);
});

test("assemblePlan reads names from the given catalog", () => {
  const custom = createCatalog(
    CATALOG.map((item) =>
      item.id === "huevo"
        ? { ...item, name: { ...item.name, es: "Huevo campesino" } }
        : item,
    ),
  );
  const week = {};
  for (const day of DAYS) {
    week[day] = {};
    for (const slot of SLOTS) {
      week[day][slot] = {
        name: { es: "x", en: "x" },
        items: slot === "desayuno" ? [{ id: "huevo", qty: 2 }] : [],
      };
    }
  }

  const plan = assemblePlan(week, {
    householdSize: 1,
    stores: ["Exito"],
    targets: { kcal: 2000, proteinG: 100 },
    catalog: custom,
  });

  assert.deepEqual(
    plan.shopping_list.map((item) => item.name),
    ["Huevo campesino"],
  );
});

test("generatePlan reports totalFoods from deps.catalog", async () => {
  const small = createCatalog(CATALOG.slice(0, 30));
  const result = await generatePlan(
    {
      weeklyBudgetCop: 250_000,
      goals: ["healthy"],
      stores: ["Exito"],
      householdSize: 1,
      restrictions: CATALOG.slice(0, 12).map((item) => item.name.es),
      profile: { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" },
    },
    async () => {
      throw new Error("model must not be called");
    },
    undefined,
    { catalog: small },
  );

  assert.equal(result.error.code, "restrictions_too_strict");
  assert.equal(result.error.diagnostics.totalFoods, 30);
});
