import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { REFERENCE_MAX_RATIO, REFERENCE_MIN_RATIO } from "../../../supabase/functions/_shared/planner/priceBook.ts";
import { MAX_PRICE_AGE_DAYS } from "../../../supabase/functions/_shared/planner/priceBook.ts";
import { MAX_REFERENCE_AGE_DAYS, deriveReferencePrices, loadMapping } from "./derive.ts";
import { RETAIL_MARKUP, retailPrice } from "./markup.ts";
import { parseWeeklyResponse } from "./sipsa.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const foods = JSON.parse(readFileSync(path.join(here, "../../../data/foods/foods.json"), "utf8"));
const mappingJson = JSON.parse(readFileSync(path.join(here, "mapping.json"), "utf8"));
const fixtureRows = parseWeeklyResponse(readFileSync(path.join(here, "fixtures", "semana-bucaramanga.xml"), "utf8")).rows;
const TODAY = "2026-11-04";

const food = (over) => ({ id: "x", unit: "g", refPriceCop: 4, ...over });
const mapOne = (over) => ({ products: [{ foodId: "x", group: "fresco", priceBasis: "per_kg", artiIds: [1], ...over }] });
const sipsa = (pricePerKg, over = {}) => ({ artiId: 1, name: "X", weekStart: "2026-10-24", pricePerKg, ...over });

test("markup constants are documented approximations by group", () => {
  assert.deepEqual(Object.keys(RETAIL_MARKUP).sort(), ["abarrotes", "fresco", "proteina"]);
  for (const value of Object.values(RETAIL_MARKUP)) assert.ok(value > 1 && value < 2);
  assert.equal(retailPrice(1000, "fresco"), 1000 * RETAIL_MARKUP.fresco);
});

test("price per kg becomes price per g, with the group's markup", () => {
  const { prices } = deriveReferencePrices({ rows: [sipsa(3000)], mapping: mapOne(), foods: [food()], today: TODAY });
  assert.deepEqual(prices, [{ foodId: "x", pricePerUnit: Number(((3000 / 1000) * RETAIL_MARKUP.fresco).toFixed(4)), observedOn: "2026-10-24" }]);
});

test("price per kg becomes price per unit through grams_per_unit", () => {
  const f = food({ unit: "unit", gramsPerUnit: 120, refPriceCop: 713 });
  const { prices } = deriveReferencePrices({ rows: [sipsa(2500)], mapping: mapOne(), foods: [f], today: TODAY });
  assert.equal(prices[0].pricePerUnit, Number(((2500 / 1000) * 120 * RETAIL_MARKUP.fresco).toFixed(4)));
});

test("a price per unit (huevo) stays per unit", () => {
  const f = food({ id: "huevo", unit: "unit", gramsPerUnit: 50, refPriceCop: 650 });
  const mapping = mapOne({ foodId: "huevo", group: "proteina", priceBasis: "per_unit" });
  const { prices } = deriveReferencePrices({ rows: [sipsa(475)], mapping, foods: [f], today: TODAY });
  assert.equal(prices[0].pricePerUnit, Number((475 * RETAIL_MARKUP.proteina).toFixed(4)));
});

test("several SIPSA products of one food are averaged on the newest week only", () => {
  const mapping = mapOne({ artiIds: [1, 2, 3] });
  const rows = [
    sipsa(2000, { artiId: 1 }),
    sipsa(4000, { artiId: 2 }),
    sipsa(9000, { artiId: 3, weekStart: "2026-10-17" }),
  ];
  const { prices } = deriveReferencePrices({ rows, mapping, foods: [food()], today: TODAY });
  assert.equal(prices[0].pricePerUnit, Number((3 * RETAIL_MARKUP.fresco).toFixed(4)));
  assert.equal(prices[0].observedOn, "2026-10-24");
});

test("sanity: x0.33 to x3 of the static price is stored, outside is an anomaly", () => {
  const run = (retail) => {
    const kg = (4 * retail * 1000) / RETAIL_MARKUP.fresco;
    return deriveReferencePrices({ rows: [sipsa(kg)], mapping: mapOne(), foods: [food()], today: TODAY });
  };
  for (const ratio of [0.34, 1, 2.9]) assert.equal(run(ratio).prices.length, 1, String(ratio));
  for (const ratio of [0.2, 0.32, 3.1, 4]) {
    const r = run(ratio);
    assert.equal(r.prices.length, 0, String(ratio));
    assert.equal(r.anomalies.length, 1);
    assert.equal(r.anomalies[0].foodId, "x");
  }
  assert.equal(REFERENCE_MIN_RATIO, 0.33);
  assert.equal(REFERENCE_MAX_RATIO, 3);
});

test("weeks older than the freshness limit are ignored", () => {
  assert.equal(MAX_REFERENCE_AGE_DAYS, MAX_PRICE_AGE_DAYS);
  const old = deriveReferencePrices({ rows: [sipsa(3000, { weekStart: "2026-09-19" })], mapping: mapOne(), foods: [food()], today: TODAY });
  assert.equal(old.prices.length, 0);
  assert.deepEqual(old.stale, ["x"]);
  const edge = deriveReferencePrices({ rows: [sipsa(3000, { weekStart: "2026-09-20" })], mapping: mapOne(), foods: [food()], today: TODAY });
  assert.equal(edge.prices.length, 1);
});

test("foods with no SIPSA row are reported missing, not stored", () => {
  const { prices, missing } = deriveReferencePrices({ rows: [], mapping: mapOne(), foods: [food()], today: TODAY });
  assert.equal(prices.length, 0);
  assert.deepEqual(missing, ["x"]);
});

test("loadMapping accepts mapping.json and rejects bad content", () => {
  const ids = new Set(foods.map((f) => f.id));
  const mapping = loadMapping(mappingJson, ids);
  assert.ok(mapping.products.length >= 45);
  const bad = (p) => ({ ...mappingJson, products: [{ ...mappingJson.products[0], ...p }] });
  assert.throws(() => loadMapping(bad({ foodId: "no_existe" }), ids), /no_existe/);
  assert.throws(() => loadMapping(bad({ group: "lujo" }), ids));
  assert.throws(() => loadMapping(bad({ artiIds: [] }), ids));
  assert.throws(() => loadMapping({ ...mappingJson, products: [mappingJson.products[0], mappingJson.products[0]] }, ids), /duplicate/i);
});

test("a kg price for a unit food without grams_per_unit is refused", () => {
  assert.throws(
    () => deriveReferencePrices({ rows: [sipsa(2500)], mapping: mapOne(), foods: [food({ unit: "unit", refPriceCop: 700 })], today: TODAY }),
    /grams/,
  );
});

test("coverage on the real trimmed answer: most mapped foods get a plausible price", () => {
  const mapping = loadMapping(mappingJson, new Set(foods.map((f) => f.id)));
  const result = deriveReferencePrices({ rows: fixtureRows, mapping, foods, today: TODAY });
  console.log(`coverage: stored=${result.prices.length} anomalies=${result.anomalies.map((a) => a.foodId).join(",")} missing=${result.missing.join(",")}`);
  assert.ok(result.prices.length >= 40, `only ${result.prices.length} stored`);
  for (const p of result.prices) {
    const ref = foods.find((f) => f.id === p.foodId).refPriceCop;
    assert.ok(p.pricePerUnit >= ref * REFERENCE_MIN_RATIO && p.pricePerUnit <= ref * REFERENCE_MAX_RATIO, p.foodId);
  }
});
