import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLBACK_CITIES, fetchCities, normalizeCity, resetCitiesCache } from "./cities.ts";

function fakeClient(result, counter) {
  return {
    from(table) {
      counter.tables.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve(result),
      };
      return builder;
    },
  };
}

test("fallback list has 12 cities with bucaramanga first", () => {
  assert.equal(FALLBACK_CITIES.length, 12);
  assert.equal(FALLBACK_CITIES[0].slug, "bucaramanga");
});

test("normalizeCity keeps a known slug", () => {
  assert.equal(normalizeCity("bucaramanga", FALLBACK_CITIES), "bucaramanga");
});

test("normalizeCity returns null for unknown or malformed values", () => {
  for (const bad of ["Bucaramanga", "x; drop table", "", 42, null, undefined, "atlantis"]) {
    assert.equal(normalizeCity(bad, FALLBACK_CITIES), null);
  }
});

test("fetchCities falls back when the query fails", async () => {
  resetCitiesCache();
  const c = { tables: [] };
  const out = await fetchCities(fakeClient({ data: null, error: { message: "x" } }, c));
  assert.deepEqual(out, FALLBACK_CITIES);
});

test("fetchCities returns rows in order and queries only once", async () => {
  resetCitiesCache();
  const c = { tables: [] };
  const rows = [
    { slug: "bucaramanga", name: "Bucaramanga" },
    { slug: "cali", name: "Cali" },
  ];
  const client = fakeClient({ data: rows, error: null }, c);
  assert.deepEqual(await fetchCities(client), rows);
  assert.deepEqual(await fetchCities(client), rows);
  assert.equal(c.tables.length, 1);
});
