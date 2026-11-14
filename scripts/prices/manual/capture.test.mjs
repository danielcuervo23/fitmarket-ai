import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExport,
  emptyState,
  lastFoodFor,
  localDay,
  parseState,
  progress,
  saveEntry,
  savedMessage,
  suggestFood,
} from "./capture.ts";
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

test("the most specific food wins for chicken cuts and meats", () => {
  assert.equal(suggestFood("Pernil de pollo MAC POLLO (1000 gr)", foods), "pernil_pollo");
  assert.equal(suggestFood("Pierna de pollo campesino x kg", foods), "pernil_pollo");
  assert.equal(suggestFood("Muslo de pollo bandeja", foods), "pernil_pollo");
  assert.equal(suggestFood("Contramuslo de pollo sin hueso", foods), "pernil_pollo");
  assert.equal(suggestFood("Pechuga de pollo MAC POLLO (1000 gr)", foods), "pechuga_pollo");
  assert.equal(suggestFood("Filete de pechuga de pollo", foods), "pechuga_pollo");
  assert.equal(suggestFood("Carne molida especial (500 gr)", foods), "carne_molida_res");
});

test("look-alike products do not take the place of a different food", () => {
  assert.equal(suggestFood("Leche deslactosada entera Alqueria 900 ml", foods), "leche_deslactosada");
  assert.equal(suggestFood("Arroz integral DIANA (500 gr)", foods), "arroz_integral");
  assert.equal(suggestFood("Aceite de girasol 900 ml", foods), "aceite_vegetal");
  assert.equal(suggestFood("Huevos de codorniz x 24", foods), null);
  assert.equal(suggestFood("Pechuga de pavo", foods), null);
  assert.equal(suggestFood("Pernil de cerdo", foods), null);
  assert.equal(suggestFood("Lomo de res", foods), null);
  assert.equal(suggestFood("Pollo entero", foods), null);
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

const other = { ...product, externalId: "999", name: "Arroz ROA blanco (500 gr)", url: "https://www.carulla.com/arroz-roa-500-gr-999/p", regularPriceCop: 2700 };

test("saving another product for an already saved food asks before replacing it", () => {
  const first = save(emptyState("Carulla")).state;
  const r = save(first, { product: other });
  assert.equal(r.ok, false);
  assert.equal(r.needsConfirmation, true);
  assert.equal(
    r.message,
    "Ojo: ya tenías guardado «Arroz DIANA blanco vitamor (500 gr)» como Arroz blanco. ¿Quieres reemplazarlo?",
  );
  assert.deepEqual(r.replaced, first.entries);
});

test("the replacement happens only when the person says yes", () => {
  const first = save(emptyState("Carulla")).state;
  const r = save(first, { product: other, replaceConfirmed: true });
  assert.equal(r.ok, true);
  assert.equal(r.state.entries.length, 1);
  assert.equal(r.state.entries[0].externalId, "999");
  assert.deepEqual(r.replaced, first.entries);
});

test("saving the same product under another food asks before moving it (one product, one food)", () => {
  const first = save(emptyState("Carulla")).state;
  const asked = save(first, { foodId: "arroz_integral" });
  assert.equal(asked.ok, false);
  assert.equal(asked.needsConfirmation, true);
  assert.match(asked.message, /«Arroz DIANA blanco vitamor \(500 gr\)» como Arroz blanco/);
  const r = save(first, { foodId: "arroz_integral", replaceConfirmed: true });
  assert.deepEqual(
    r.state.entries.map((e) => e.foodId),
    ["arroz_integral"],
  );
});

test("saving the same product for the same food again just updates it, without asking", () => {
  const first = save(emptyState("Carulla")).state;
  const r = save(first, { product: { ...product, regularPriceCop: 2600 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.replaced, []);
  assert.equal(r.state.entries[0].regularPriceCop, 2600);
});

test("different chicken cuts are kept side by side (the reported bug)", () => {
  const pechuga = { ...product, externalId: "11", name: "Pechuga de pollo MAC POLLO (1000 gr)", url: "https://www.carulla.com/pechuga-11/p", regularPriceCop: 18000 };
  const pernil = { ...product, externalId: "22", name: "Pernil de pollo MAC POLLO (1000 gr)", url: "https://www.carulla.com/pernil-22/p", regularPriceCop: 12000 };
  let state = emptyState("Carulla");
  for (const p of [pechuga, pernil]) {
    const r = save(state, { product: p, foodId: suggestFood(p.name, foods), packSize: 1000 });
    assert.equal(r.ok, true, r.message);
    state = r.state;
  }
  assert.deepEqual(state.entries.map((e) => e.foodId), ["pechuga_pollo", "pernil_pollo"]);
});

test("the message after saving names the food and the new count", () => {
  const r = save(emptyState("Carulla"));
  assert.equal(savedMessage(r, foods), "Guardado: Arroz blanco (1 de 70)");
  const replaced = save(r.state, { product: other, replaceConfirmed: true });
  assert.equal(savedMessage(replaced, foods), "Reemplazado: Arroz blanco (1 de 70)");
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
