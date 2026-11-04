import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProductUrl, exportFileName, isPlausiblePack, storeSitesFromPolicy } from "./format.ts";
import { policy } from "./testData.mjs";

const grams = { id: "arroz_blanco", nameEs: "Arroz blanco", unit: "g", defaultPack: 500 };
const units = { id: "pimenton", nameEs: "Pimentón", unit: "unit", defaultPack: 1 };

test("a pack between a tenth and ten times the usual pack is plausible", () => {
  assert.equal(isPlausiblePack(500, grams), true);
  assert.equal(isPlausiblePack(50, grams), true);
  assert.equal(isPlausiblePack(5000, grams), true);
});

test("a pack far from the usual pack is not plausible", () => {
  assert.equal(isPlausiblePack(49, grams), false);
  assert.equal(isPlausiblePack(5001, grams), false);
  assert.equal(isPlausiblePack(0, grams), false);
  assert.equal(isPlausiblePack(Number.NaN, grams), false);
});

test("a food counted in units needs a whole number of units (a per-kg price is refused)", () => {
  assert.equal(isPlausiblePack(1, units), true);
  assert.equal(isPlausiblePack(1.5, units), false);
  assert.equal(isPlausiblePack(1000, units), false);
});

test("the export file is named after the store and the day", () => {
  assert.equal(exportFileName("Carulla", "2026-11-04"), "precios-carulla-2026-11-04.json");
});

test("only allowed stores with a product path become capture sites, Ara never", () => {
  const sites = storeSitesFromPolicy(policy);
  assert.deepEqual(sites.map((s) => s.storeId).sort(), ["Carulla", "D1", "Exito", "Jumbo"]);
  const carulla = sites.find((s) => s.storeId === "Carulla");
  assert.equal(carulla.host, "www.carulla.com");
  assert.equal(carulla.productPathPattern, "/<slug>/p");
  assert.ok(carulla.disallowedPaths.includes("/api/"));
});

test("the canonical product URL drops the query string and the fragment", () => {
  const site = storeSitesFromPolicy(policy).find((s) => s.storeId === "Carulla");
  assert.equal(
    canonicalProductUrl("https://www.carulla.com/arroz-diana-500-gr-479512/p?skuId=1&utm=x#top", site),
    "https://www.carulla.com/arroz-diana-500-gr-479512/p",
  );
});

test("a URL that is not a product page of the store host has no canonical form", () => {
  const site = storeSitesFromPolicy(policy).find((s) => s.storeId === "Carulla");
  assert.equal(canonicalProductUrl("https://www.carulla.com/s?q=arroz", site), null);
  assert.equal(canonicalProductUrl("https://www.exito.com/arroz-500/p", site), null);
  assert.equal(canonicalProductUrl("http://www.carulla.com/arroz-500/p", site), null);
  assert.equal(canonicalProductUrl("https://www.carulla.com/api/arroz/p", site), null);
  assert.equal(canonicalProductUrl("not a url", site), null);
});
