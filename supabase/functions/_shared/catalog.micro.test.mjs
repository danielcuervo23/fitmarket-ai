// Micro-nutrients (fiber, free sugars, saturated fat, sodium, iron, GABA group
// and fruit/veg) on every static ingredient, and `microOf` scaling them.
import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG, STARCHY_NOT_FRUIT_VEG, getIngredient, microOf } from "./catalog.ts";

const EPS = 1e-9;

/** deepEqual for flat objects of numbers, with a float tolerance. */
function assertClose(actual, expected) {
  assert.ok(actual, "expected a value, got null");
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(Math.abs(actual[key] - value) < EPS, `${key}: ${actual[key]} != ${value}`);
  }
}

test("every static ingredient carries micro-nutrients", () => {
  for (const item of CATALOG) assert.ok(item.micro, item.id);
});

test("microOf scales per 100 g and counts fruit/veg grams", () => {
  const brocoli = getIngredient("brocoli");
  assertClose(microOf(brocoli, 200), {
    fiberG: 5.2,
    freeSugarsG: 0,
    satFatG: 0.22,
    sodiumMg: 66,
    ironMg: 1.46,
    fruitVegG: 200,
  });
});

test("starchy foods never count as fruit/veg", () => {
  assert.deepEqual([...STARCHY_NOT_FRUIT_VEG].sort(), ["papa", "papa_criolla", "platano", "yuca"]);
  for (const id of ["papa", "papa_criolla", "yuca", "platano"]) {
    assert.equal(microOf(getIngredient(id), 300).fruitVegG, 0, id);
  }
});

test("foods that are not fruit/veg add no fruit/veg grams", () => {
  assert.equal(microOf(getIngredient("arroz_blanco"), 100).fruitVegG, 0);
});

test("unit foods use gramsPerUnit", () => {
  assert.equal(microOf(getIngredient("banano"), 2).fruitVegG, 240);
});

test("microOf is null for an ingredient without micro", () => {
  const { micro, ...withoutMicro } = getIngredient("brocoli");
  assert.ok(micro);
  assert.equal(microOf(withoutMicro, 100), null);
});
