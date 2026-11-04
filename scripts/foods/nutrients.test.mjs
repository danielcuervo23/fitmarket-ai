// Parsers for USDA FoodData Central and Open Food Facts answers. Fixtures only:
// these tests never touch the network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildExtendedFields,
  clampToMacros,
  freeSugars,
  parseOffProduct,
  parseUsdaFood,
} from "./nutrients.ts";

const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  );

test("parseUsdaFood reads the six fields of the lentils fixture (SR Legacy numbers)", () => {
  assert.deepEqual(parseUsdaFood(fixture("usda-lentils.json")), {
    fiberG: 10.7,
    totalSugarsG: 2.03,
    addedSugarsG: null,
    satFatG: 0.154,
    sodiumMg: 6,
    ironMg: 6.51,
  });
});

test("parseUsdaFood reads the full format with Foundation numbers and added sugars", () => {
  assert.deepEqual(parseUsdaFood(fixture("usda-bread-full.json")), {
    fiberG: 2.7,
    totalSugarsG: 5,
    addedSugarsG: 3.1,
    satFatG: 0.7,
    sodiumMg: 491,
    ironMg: 3.6,
  });
});

test("parseUsdaFood returns null when sodium is missing", () => {
  assert.equal(parseUsdaFood(fixture("usda-lentils-no-sodium.json")), null);
});

test("parseOffProduct converts sodium and iron from g to mg", () => {
  const parsed = parseOffProduct(fixture("off-bread.json"));
  assert.ok(parsed);
  assert.equal(parsed.sodiumMg, 400);
  assert.equal(parsed.ironMg, 2.7);
  assert.equal(parsed.fiberG, 3.5);
  assert.equal(parsed.totalSugarsG, 4.2);
  assert.equal(parsed.satFatG, 0.9);
  assert.equal(parsed.addedSugarsG, null);
});

test("parseOffProduct returns null when sodium is missing", () => {
  assert.equal(parseOffProduct(fixture("off-no-sodium.json")), null);
});

test("malformed input returns null", () => {
  for (const bad of [null, undefined, {}, "x", 5, [], { foodNutrients: [] }]) {
    assert.equal(parseUsdaFood(bad), null);
  }
  for (const bad of [null, undefined, {}, "x", 5, [], { product: {} }]) {
    assert.equal(parseOffProduct(bad), null);
  }
});

test("numbers given as strings or out of range are rejected", () => {
  const off = fixture("off-bread.json");
  off.product.nutriments.sodium_100g = "0.4";
  assert.equal(parseOffProduct(off), null);

  const usda = fixture("usda-lentils.json");
  usda.foodNutrients.find((n) => n.number === "291").amount = "10.7";
  assert.equal(parseUsdaFood(usda), null);

  const negative = fixture("usda-lentils.json");
  negative.foodNutrients.find((n) => n.number === "303").amount = -1;
  assert.equal(parseUsdaFood(negative), null);

  const huge = fixture("off-bread.json");
  huge.product.nutriments.fiber_100g = 1e9;
  assert.equal(parseOffProduct(huge), null);
});

test("freeSugars follows the three rules", () => {
  const n = {
    fiberG: 1,
    totalSugarsG: 10,
    addedSugarsG: 4,
    satFatG: 0,
    sodiumMg: 0,
    ironMg: 0,
  };
  assert.equal(freeSugars(n, "none"), 0);
  assert.equal(freeSugars(n, "all"), 10);
  assert.equal(freeSugars(n, "added"), 4);
  assert.equal(freeSugars({ ...n, addedSugarsG: null }, "added"), 10);
});

test("clampToMacros caps fiber, free sugars and saturated fat to the legacy macros and reports each clamp", () => {
  const food = {
    id: "miel",
    carbsG: 82,
    fatG: 0,
    fiberG: 0.2,
    freeSugarsG: 82.12,
    satFatG: 0,
  };
  assert.deepEqual(clampToMacros(food), {
    values: { fiberG: 0.2, freeSugarsG: 82, satFatG: 0 },
    clamps: ["miel: freeSugarsG 82.12 -> 82 (carbsG)"],
  });

  const tight = { ...food, id: "x", carbsG: 0, fatG: 1, fiberG: 3, freeSugarsG: 1, satFatG: 2 };
  assert.deepEqual(clampToMacros(tight), {
    values: { fiberG: 0, freeSugarsG: 0, satFatG: 1 },
    clamps: [
      "x: fiberG 3 -> 0 (carbsG)",
      "x: freeSugarsG 1 -> 0 (carbsG)",
      "x: satFatG 2 -> 1 (fatG)",
    ],
  });

  const fine = { ...food, freeSugarsG: 10 };
  assert.deepEqual(clampToMacros(fine).clamps, []);
});

test("total sugars may be absent (quinoa in USDA); it is only needed by the all/added rules", () => {
  const usda = fixture("usda-lentils.json");
  usda.foodNutrients = usda.foodNutrients.filter((n) => n.number !== "269");
  const parsed = parseUsdaFood(usda);
  assert.ok(parsed);
  assert.equal(parsed.totalSugarsG, null);
  assert.equal(freeSugars(parsed, "none"), 0);
  assert.throws(() => freeSugars(parsed, "all"), /total sugars/);
  assert.throws(() => freeSugars(parsed, "added"), /total sugars/);
  assert.equal(freeSugars({ ...parsed, addedSugarsG: 2 }, "added"), 2);

  const off = fixture("off-bread.json");
  delete off.product.nutriments.sugars_100g;
  assert.equal(parseOffProduct(off)?.totalSugarsG, null);
});

test("buildExtendedFields rounds to the table precision, applies the sugar rule and clamps", () => {
  const nutrients = {
    fiberG: 0.2,
    totalSugarsG: 82.124,
    addedSugarsG: null,
    satFatG: 0.0004,
    sodiumMg: 4.06,
    ironMg: 0.42567,
  };
  const food = { id: "miel", carbsG: 82, fatG: 0, freeSugarsRule: "all" };
  assert.deepEqual(buildExtendedFields(food, nutrients), {
    fields: { fiberG: 0.2, freeSugarsG: 82, satFatG: 0, sodiumMg: 4.1, ironMg: 0.43 },
    clamps: ["miel: freeSugarsG 82.12 -> 82 (carbsG)"],
  });
});
