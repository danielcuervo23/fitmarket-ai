// The static copy of the micro-nutrients (used when the DB is unavailable)
// must be generated from data/foods/foods.json, never edited by hand.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMicroModule } from "./microModule.ts";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const foods = JSON.parse(read("../../data/foods/foods.json"));
const GENERATED = "../../supabase/functions/_shared/catalogMicro.generated.ts";

test("catalogMicro.generated.ts is in sync with foods.json", () => {
  assert.equal(buildMicroModule(foods), read(GENERATED).replaceAll("\r\n", "\n"));
});

test("the module is sorted by id, marked as generated and carries every field", () => {
  const source = buildMicroModule(foods);
  assert.match(source, /GENERADO por scripts\/foods\/build-seed\.ts/);
  assert.match(source, /No editar a mano/);
  assert.match(
    source,
    /"brocoli": \{ fiberG: 2\.6, freeSugarsG: 0, satFatG: 0\.11, sodiumMg: 33, ironMg: 0\.73, gabaGroup: "frutas_verduras", isFruitVeg: true \}/,
  );
  const ids = [...source.matchAll(/^ {2}"([a-z0-9_]+)":/gm)].map((match) => match[1]);
  assert.equal(ids.length, foods.length);
  assert.deepEqual(ids, [...ids].sort());
});

test("a null GABA group is written as null", () => {
  const sal = foods.find((food) => food.id === "sal");
  const source = buildMicroModule([{ ...sal, gabaGroup: null }]);
  assert.match(source, /gabaGroup: null/);
});

test("invalid foods are rejected", () => {
  assert.throws(() => buildMicroModule([{ id: "x" }]));
});
