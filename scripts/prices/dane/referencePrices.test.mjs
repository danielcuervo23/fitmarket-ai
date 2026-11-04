// Static reference prices approved by the owner on 2026-11-04 after the audit
// against DANE SIPSA (Bucaramanga, Centroabastos) x retail markup.
// See docs/DATA_SOURCES.md, "Static reference prices vs DANE".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseWeeklyResponse } from "./sipsa.ts";
import { loadMapping, deriveReferencePrices } from "./derive.ts";
import { RETAIL_MARKUP } from "./markup.ts";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const foods = JSON.parse(read("../../../data/foods/foods.json"));
const byId = new Map(foods.map((f) => [f.id, f]));
const mapping = loadMapping(JSON.parse(read("./mapping.json")), new Set(byId.keys()));
const { rows } = parseWeeklyResponse(read("./fixtures/semana-bucaramanga.xml"));
const TODAY = "2026-11-04";

/** Owner-approved values (COP per g, or per unit for naranja and aguacate). */
const APPROVED = {
  cebolla_junca: 2.7, // yearly median 1,975 COP/kg x 1.35 / 1000
  cilantro: 9.5, // yearly median 7,071 COP/kg x 1.35 / 1000
  lechuga: 4,
  pepino: 3.5,
  ajo: 11,
  repollo: 1.8,
  remolacha: 2.5,
  calabacin: 3,
  espinaca: 8,
  naranja: 450,
  aguacate: 2500,
  guayaba: 4.5,
  tilapia: 17,
  sardina_lata: 25,
};

/** Real shelf samples the owner chose to keep although slightly above x1.6. */
const KEPT_SAMPLES = new Set(["banano", "papa", "zanahoria"]);

test("foods.json carries the approved reference prices, all marked as estimates", () => {
  for (const [id, price] of Object.entries(APPROVED)) {
    assert.equal(byId.get(id).refPriceCop, price, `${id} refPriceCop`);
    assert.equal(byId.get(id).refPriceSource, "estimate", `${id} refPriceSource`);
  }
  assert.equal(byId.get("pera").refPriceCop, 1800, "pera keeps its static price");
});

test("pera is mapped to the imported pear (SIPSA 141), the variety of the catalog", () => {
  const pera = mapping.products.find((p) => p.foodId === "pera");
  assert.deepEqual(pera.artiIds, [141]);
});

test("every mapped static price sits within x0.6 to x1.6 of DANE x markup (fixture week)", () => {
  const derived = deriveReferencePrices({ rows, mapping, foods, today: TODAY });
  for (const product of mapping.products) {
    if (KEPT_SAMPLES.has(product.foodId)) continue;
    const price = derived.prices.find((p) => p.foodId === product.foodId);
    assert.ok(price, `${product.foodId} has a DANE price`);
    const ratio = byId.get(product.foodId).refPriceCop / price.pricePerUnit;
    assert.ok(ratio >= 0.6 && ratio <= 1.6, `${product.foodId}: static / DANE x ${RETAIL_MARKUP[product.group]} = ${ratio.toFixed(2)}`);
  }
});

test("cebolla junca and cilantro DANE prices now pass the x0.33 to x3 check", () => {
  const derived = deriveReferencePrices({ rows, mapping, foods, today: TODAY });
  assert.deepEqual(derived.anomalies, []);
  for (const id of ["cebolla_junca", "cilantro", "pera"]) {
    assert.ok(derived.prices.some((p) => p.foodId === id), `${id} is stored`);
  }
});

test("migration 014 applies the same values with idempotent updates only", () => {
  const sql = read("../../../supabase/migrations/014_fix_reference_prices.sql").toLowerCase().replace(/\s+/g, " ");
  assert.doesNotMatch(sql, /\b(insert|delete|drop|truncate|alter|grant)\b/);
  const updates = [...sql.matchAll(
    /update public\.foods set ref_price_cop = ([\d.]+), ref_price_source = 'estimate' where id = '([a-z_]+)' and \(ref_price_cop, ref_price_source\) is distinct from \(([\d.]+), 'estimate'\);/g,
  )];
  assert.equal(updates.length, Object.keys(APPROVED).length);
  for (const [, price, id, again] of updates) {
    assert.equal(Number(price), APPROVED[id], `${id} in 014`);
    assert.equal(again, price, `${id}: the guard repeats the same value`);
  }
});
