import assert from "node:assert/strict";
import test from "node:test";
import { buildExport, emptyState, lastFoodFor, localDay, parseState, progress, saveEntry, suggestFood } from "./capture.ts";
import { storeSitesFromPolicy } from "./format.ts";
import { foods, policy } from "./testData.mjs";

const site = storeSitesFromPolicy(policy).find((s) => s.storeId === "Carulla");
const product = {
  storeId: "Carulla",
  externalId: "445117",
  name: "Arroz DIANA blanco vitamor (500 gr)",
  url: "https://www.carulla.com/arroz-diana-500-gr-479512/p",
  regularPriceCop: 2500,
  packSize: 500,
};
const save = (state, over = {}) =>
  saveEntry(state, {
    product,
    foodId: "arroz_blanco",
    packSize: 500,
    packConfirmed: true,
    packReviewed: false,
    attested: true,
    today: "2026-11-04",
    foods,
    site,
    ...over,
  });

test("the food is suggested from the words of the product name", () => {
  assert.equal(suggestFood("Arroz DIANA blanco vitamor (500 gr)", foods), "arroz_blanco");
  assert.equal(suggestFood("Papa Pastusa Granel (1 kg)", foods), "papa");
  assert.equal(suggestFood("Huevos AA rojos x 30 und", foods), "huevo");
  assert.equal(suggestFood("Leche entera Alqueria bolsa 900 ml", foods), "leche_entera");
  assert.equal(suggestFood("Pimentón rojo", foods), "pimenton");
});

test("no suggestion when no food word appears", () => {
  assert.equal(suggestFood("Detergente en polvo 1 kg", foods), null);
});

test("saving needs the Bucaramanga attestation", () => {
  const r = save(emptyState("Carulla"), { attested: false });
  assert.equal(r.ok, false);
  assert.match(r.message, /Bucaramanga/);
});

test("saving stores the entry with the day it was seen", () => {
  const r = save(emptyState("Carulla"));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.entries, [
    {
      foodId: "arroz_blanco",
      externalId: "445117",
      name: "Arroz DIANA blanco vitamor (500 gr)",
      packSize: 500,
      url: "https://www.carulla.com/arroz-diana-500-gr-479512/p",
      regularPriceCop: 2500,
      observedOn: "2026-11-04",
      packConfirmed: true,
    },
  ]);
});

test("saving again for the same food replaces the old entry", () => {
  const first = save(emptyState("Carulla")).state;
  const r = save(first, { product: { ...product, externalId: "999", regularPriceCop: 2700 } });
  assert.equal(r.state.entries.length, 1);
  assert.equal(r.state.entries[0].externalId, "999");
});

test("assigning the same product to another food moves it (one product, one food)", () => {
  const first = save(emptyState("Carulla")).state;
  const r = save(first, { foodId: "arroz_integral" });
  assert.deepEqual(
    r.state.entries.map((e) => e.foodId),
    ["arroz_integral"],
  );
});

test("an unknown food or an implausible pack is refused", () => {
  assert.equal(save(emptyState("Carulla"), { foodId: "caviar" }).ok, false);
  const r = save(emptyState("Carulla"), { packSize: 50_000 });
  assert.equal(r.ok, false);
  assert.match(r.message, /tamaño/i);
});

test("a product of another store is refused", () => {
  const r = save(emptyState("Carulla"), { product: { ...product, url: "https://www.exito.com/arroz/p" } });
  assert.equal(r.ok, false);
});

test("progress counts the foods done and lists the missing ones in Spanish", () => {
  const state = save(emptyState("Carulla")).state;
  const p = progress(state, foods);
  assert.equal(p.done, 1);
  assert.equal(p.total, 70);
  assert.equal(p.missing.length, 69);
  assert.ok(p.missing.includes("Pechuga de pollo"));
  assert.ok(!p.missing.includes("Arroz blanco"));
});

test("the last food chosen for a product is remembered", () => {
  const state = save(emptyState("Carulla")).state;
  assert.equal(lastFoodFor(state, "445117"), "arroz_blanco");
  assert.equal(lastFoodFor(state, "1"), null);
});

test("the stored state survives a round trip and bad data is dropped", () => {
  const state = save(emptyState("Carulla")).state;
  const back = parseState(JSON.stringify(state), "Carulla", foods, site);
  assert.deepEqual(back, state);
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.entries.push({ ...tampered.entries[0], foodId: "pasta", regularPriceCop: -1 });
  tampered.entries.push("<img src=x onerror=alert(1)>");
  assert.deepEqual(parseState(JSON.stringify(tampered), "Carulla", foods, site), state);
});

test("unreadable or foreign stored state starts empty", () => {
  assert.deepEqual(parseState(null, "Carulla", foods, site), emptyState("Carulla"));
  assert.deepEqual(parseState("{nope", "Carulla", foods, site), emptyState("Carulla"));
  const other = { ...save(emptyState("Carulla")).state, store: "Exito" };
  assert.deepEqual(parseState(JSON.stringify(other), "Carulla", foods, site), emptyState("Carulla"));
});

test("the export has exactly the agreed fields and nothing else", () => {
  const state = save(emptyState("Carulla")).state;
  const r = buildExport(state, "2026-11-05");
  assert.equal(r.fileName, "precios-carulla-2026-11-05.json");
  assert.deepEqual(r.data, {
    schemaVersion: 2,
    store: "Carulla",
    city: "bucaramanga",
    capturedOn: "2026-11-05",
    cityAttested: true,
    entries: state.entries,
  });
});

test("nothing to export when no entry was saved", () => {
  assert.equal(buildExport(emptyState("Carulla"), "2026-11-05"), null);
});

test("the local day is written as YYYY-MM-DD", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("the food search ignores accents and case and keeps the list order", async () => {
  const { filterFoods } = await import("./capture.ts");
  assert.deepEqual(
    filterFoods("PIMENTON", foods).map((f) => f.id),
    ["pimenton"],
  );
  assert.deepEqual(
    filterFoods("arroz", foods).map((f) => f.id),
    ["arroz_blanco", "arroz_integral"],
  );
  assert.equal(filterFoods("  ", foods).length, 70);
});

test("a pack the page did not confirm needs the 'Revisé el tamaño a mano' box", () => {
  const r = save(emptyState("Carulla"), { packConfirmed: false });
  assert.equal(r.ok, false);
  assert.match(r.message, /Revisé el tamaño a mano/);
  const reviewed = save(emptyState("Carulla"), { packConfirmed: false, packReviewed: true });
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.state.entries[0].packConfirmed, false);
});

test("the Bucaramanga attestation is never remembered between pages", () => {
  const state = save(emptyState("Carulla")).state;
  assert.ok(!("attested" in state));
  assert.ok(!JSON.stringify(state).includes("attested"));
});

test("a stored entry without packConfirmed is dropped", () => {
  const state = save(emptyState("Carulla")).state;
  const old = JSON.parse(JSON.stringify(state));
  delete old.entries[0].packConfirmed;
  assert.deepEqual(parseState(JSON.stringify(old), "Carulla", foods, site).entries, []);
});
