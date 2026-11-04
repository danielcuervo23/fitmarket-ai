import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, costOf, getIngredient } from "../catalog.ts";
import { calcTargets } from "../nutrition.ts";
import { assemblePlan, costAt, weekCost } from "./build.ts";
import { MAX_PRICE_AGE_DAYS, createCityPriceBook } from "./priceBook.ts";
import { STATIC_PRICE_BOOK, cheapestStore, priceFactor } from "./stores.ts";
import { DAYS } from "./types.ts";

const huevo = getIngredient("huevo");
const TODAY = "2026-11-04";
const eggOffer = {
  storeId: "D1",
  foodId: "huevo",
  packSize: 30,
  regularPriceCop: 16900,
  source: "official",
  observedOn: "2026-11-02",
};

test("static book reproduces today's prices", () => {
  const stores = ["D1", "Ara", "Jumbo"];

  for (const item of CATALOG) {
    const qty = item.pack * 1.5;
    const expected = Math.round(costOf(item, qty) * cheapestStore(item, stores).factor);
    const quote = STATIC_PRICE_BOOK.quote(item, qty, stores);

    assert.equal(quote.costCop, expected, item.id);
    assert.equal(quote.source, "estimate");
    assert.equal(quote.observedOn, null);
    assert.equal(quote.packSize, item.pack);
    assert.equal(quote.store, cheapestStore(item, stores).store);
    assert.equal(costAt(item, qty, stores), expected);
  }
});

test("fresh official offer beats the estimate", () => {
  const book = createCityPriceBook([eggOffer], { today: TODAY });

  assert.deepEqual(book.quote(huevo, 12, ["D1"]), {
    store: "D1",
    costCop: 16900,
    packs: 1,
    packSize: 30,
    source: "official",
    observedOn: "2026-11-02",
  });
});

test("stale offer falls back to estimate", () => {
  const book = createCityPriceBook([{ ...eggOffer, observedOn: "2026-09-01" }], { today: TODAY });
  const quote = book.quote(huevo, 12, ["D1"]);

  assert.equal(quote.source, "estimate");
  assert.equal(quote.observedOn, null);
  assert.equal(quote.costCop, STATIC_PRICE_BOOK.quote(huevo, 12, ["D1"]).costCop);
});

test("an offer exactly at the age limit is fresh, one day older is not", () => {
  assert.equal(MAX_PRICE_AGE_DAYS, 45);
  const at = createCityPriceBook([{ ...eggOffer, observedOn: "2026-09-20" }], { today: TODAY });
  const over = createCityPriceBook([{ ...eggOffer, observedOn: "2026-09-19" }], { today: TODAY });

  assert.equal(at.quote(huevo, 12, ["D1"]).source, "official");
  assert.equal(over.quote(huevo, 12, ["D1"]).source, "estimate");
});

test("cheapest of several packs for the needed quantity", () => {
  const arroz = getIngredient("arroz_blanco");
  const offers = [
    { storeId: "D1", foodId: "arroz_blanco", packSize: 500, regularPriceCop: 4000, source: "user", observedOn: TODAY },
    { storeId: "D1", foodId: "arroz_blanco", packSize: 1000, regularPriceCop: 7000, source: "user", observedOn: TODAY },
  ];
  const quote = createCityPriceBook(offers, { today: TODAY }).quote(arroz, 900, ["D1"]);

  assert.equal(quote.costCop, 7000);
  assert.equal(quote.packs, 1);
  assert.equal(quote.packSize, 1000);
  assert.equal(quote.source, "user");
});

test("inactive product is not carried", () => {
  const book = createCityPriceBook([], {
    today: TODAY,
    inactive: [{ storeId: "Exito", foodId: "huevo" }],
  });

  assert.equal(book.carries("Exito", "huevo"), false);
  assert.equal(book.carries("Jumbo", "huevo"), true);
});

test("a store without offers uses static carries", () => {
  const book = createCityPriceBook([eggOffer], { today: TODAY });

  assert.equal(book.carries("D1", "salmon"), false);
  assert.equal(book.carries("Exito", "salmon"), true);
});

test("one delisted product does not hide a food with another active offer", () => {
  const active = { ...eggOffer, packSize: 12, regularPriceCop: 8000 };
  const book = createCityPriceBook([active], {
    today: TODAY,
    inactive: [{ storeId: "D1", foodId: "huevo" }],
  });

  assert.equal(book.carries("D1", "huevo"), true);
});

test("mixed stores pick the lowest cost, ties keep user order", () => {
  const offers = [
    { ...eggOffer, storeId: "Jumbo", regularPriceCop: 9000, packSize: 12 },
    { ...eggOffer, storeId: "Exito", regularPriceCop: 9000, packSize: 12 },
    { ...eggOffer, storeId: "Ara", regularPriceCop: 20000, packSize: 12 },
  ];
  const book = createCityPriceBook(offers, { today: TODAY });

  assert.equal(book.quote(huevo, 12, ["Ara", "Jumbo", "Exito"]).store, "Jumbo");
  assert.equal(book.quote(huevo, 12, ["Exito", "Jumbo"]).store, "Exito");
});

test("qty <= 0 costs nothing", () => {
  const book = createCityPriceBook([eggOffer], { today: TODAY });

  for (const qty of [0, -3]) {
    assert.equal(book.quote(huevo, qty, ["D1"]).costCop, 0);
    assert.equal(book.quote(huevo, qty, ["D1"]).packs, 0);
    assert.equal(STATIC_PRICE_BOOK.quote(huevo, qty, ["D1"]).costCop, 0);
  }
});

test("no carrier falls back like cheapestStore", () => {
  const salmon = getIngredient("salmon");
  const book = createCityPriceBook([], { today: TODAY });
  const quote = book.quote(salmon, 250, ["D1", "Ara"]);

  assert.equal(quote.store, "D1");
  assert.equal(quote.source, "estimate");
  assert.equal(quote.costCop, Math.round(costOf(salmon, 250)));
  assert.equal(book.quote(salmon, 250, []).store, "");
});

const targets = calcTargets(
  { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" },
  ["healthy"],
);
const m = (...items) => ({ name: { es: "x", en: "x" }, items: items.map(([id, qty]) => ({ id, qty })) });
const day = {
  desayuno: m(["huevo", 30], ["avena", 60]),
  almuerzo: m(["arroz_blanco", 90], ["pechuga_pollo", 150]),
  cena: m(["huevo", 2], ["tomate_chonto", 80]),
  snacks: m(["manzana", 1]),
};
const week = Object.fromEntries(DAYS.map((d) => [d, day]));

test("assemblePlan adds price_source and price_updated_at", () => {
  const options = { householdSize: 1, stores: ["D1"], targets };
  const city = assemblePlan(week, { ...options, prices: createCityPriceBook([eggOffer], { today: TODAY }) });
  const egg = city.shopping_list.find((i) => i.name === "Huevo");

  assert.equal(egg.price_source, "official");
  assert.equal(egg.price_updated_at, "2026-11-02");
  assert.equal(egg.store_id, "D1");
  assert.equal(egg.quantity, "×240");

  const estimate = assemblePlan(week, { ...options, prices: STATIC_PRICE_BOOK });
  const eggEst = estimate.shopping_list.find((i) => i.name === "Huevo");

  assert.equal(eggEst.price_source, "estimate");
  assert.equal("price_updated_at" in eggEst, false);
});

test("no city prices means the same plan totals as before", () => {
  const options = { householdSize: 2, stores: ["D1", "Ara", "Jumbo"], targets };
  const a = assemblePlan(week, { ...options, prices: STATIC_PRICE_BOOK });
  const b = assemblePlan(week, { ...options, prices: createCityPriceBook([], { today: TODAY }) });
  const c = assemblePlan(week, options);

  assert.equal(a.summary.estimated_total_cop, b.summary.estimated_total_cop);
  assert.deepEqual(a.shopping_list, b.shopping_list);
  assert.deepEqual(a.shopping_list, c.shopping_list);
  assert.equal(weekCost(week, 2, options.stores), a.summary.estimated_total_cop);
});

test("offers with a bad packSize are ignored and the estimate applies", () => {
  const estimate = STATIC_PRICE_BOOK.quote(huevo, 12, ["D1"]).costCop;

  for (const packSize of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const quote = createCityPriceBook([{ ...eggOffer, packSize }], { today: TODAY }).quote(huevo, 12, ["D1"]);

    assert.equal(quote.source, "estimate", String(packSize));
    assert.equal(quote.costCop, estimate);
  }
});

test("offers far from the reference pack (kg typed as g) are ignored", () => {
  const arroz = getIngredient("arroz_blanco");
  const offer = { storeId: "D1", foodId: "arroz_blanco", regularPriceCop: 4000, source: "user", observedOn: TODAY };
  const estimate = STATIC_PRICE_BOOK.quote(arroz, 900, ["D1"]).costCop;

  for (const packSize of [arroz.pack / 1000, arroz.pack * 11, arroz.pack * 0.09]) {
    const quote = createCityPriceBook([{ ...offer, packSize }], { today: TODAY }).quote(arroz, 900, ["D1"]);

    assert.equal(quote.source, "estimate", String(packSize));
    assert.equal(quote.costCop, estimate);
  }

  for (const packSize of [arroz.pack * 0.1, arroz.pack * 10]) {
    assert.equal(createCityPriceBook([{ ...offer, packSize }], { today: TODAY }).quote(arroz, 900, ["D1"]).source, "user");
  }
});

test("an offer dated in the future is not fresh", () => {
  const book = createCityPriceBook([{ ...eggOffer, observedOn: "2026-11-05" }], { today: TODAY });

  assert.equal(book.quote(huevo, 12, ["D1"]).source, "estimate");
});

test("an invalid today throws a clear error", () => {
  for (const today of ["", "yesterday", "2026-13-40", "2026/11/04"]) {
    assert.throws(() => createCityPriceBook([eggOffer], { today }), /today/i, today);
  }
});

// ---- city reference prices (DANE SIPSA base for estimates) ----

const papa = getIngredient("papa");
const ref = (over = {}) => ({ foodId: "papa", pricePerUnit: papa.price * 1.5, observedOn: "2026-10-24", ...over });
const expectedWithRef = (ingredient, qty, store, pricePerUnit) =>
  Math.round(costOf({ ...ingredient, price: pricePerUnit }, qty) * priceFactor(store, ingredient));

test("estimate uses the fresh city reference price times the store factor", () => {
  const book = createCityPriceBook([], { today: TODAY, cityReference: [ref()] });
  const quote = book.quote(papa, papa.pack * 1.5, ["D1"]);

  assert.equal(quote.costCop, expectedWithRef(papa, papa.pack * 1.5, "D1", papa.price * 1.5));
  assert.notEqual(quote.costCop, createCityPriceBook([], { today: TODAY }).quote(papa, papa.pack * 1.5, ["D1"]).costCop);
  assert.equal(quote.source, "estimate");
  assert.equal(quote.observedOn, null);
  assert.equal(quote.packs, 2);
  assert.equal(quote.packSize, papa.pack);
});

test("the cheapest store still wins with the reference price", () => {
  const book = createCityPriceBook([], { today: TODAY, cityReference: [ref()] });
  const stores = ["Jumbo", "D1", "Exito"];
  const quote = book.quote(papa, papa.pack, stores);

  assert.equal(quote.store, "D1");
  assert.equal(quote.costCop, expectedWithRef(papa, papa.pack, "D1", papa.price * 1.5));
});

test("a stale (46 days) or missing reference gives today's static estimate", () => {
  const staticQuote = createCityPriceBook([], { today: TODAY }).quote(papa, 1000, ["D1"]);
  const stale = createCityPriceBook([], { today: TODAY, cityReference: [ref({ observedOn: "2026-09-19" })] });
  const edge = createCityPriceBook([], { today: TODAY, cityReference: [ref({ observedOn: "2026-09-20" })] });
  const other = createCityPriceBook([], { today: TODAY, cityReference: [ref({ foodId: "yuca" })] });

  assert.deepEqual(stale.quote(papa, 1000, ["D1"]), staticQuote);
  assert.deepEqual(other.quote(papa, 1000, ["D1"]), staticQuote);
  assert.notDeepEqual(edge.quote(papa, 1000, ["D1"]), staticQuote);
});

test("an implausible or invalid reference is ignored", () => {
  const staticQuote = createCityPriceBook([], { today: TODAY }).quote(papa, 1000, ["D1"]);

  for (const pricePerUnit of [papa.price * 0.32, papa.price * 3.1, papa.price * 4, 0, -1, NaN]) {
    const book = createCityPriceBook([], { today: TODAY, cityReference: [ref({ pricePerUnit })] });
    assert.deepEqual(book.quote(papa, 1000, ["D1"]), staticQuote, String(pricePerUnit));
  }

  for (const pricePerUnit of [papa.price * 0.34, papa.price * 2.9]) {
    const book = createCityPriceBook([], { today: TODAY, cityReference: [ref({ pricePerUnit })] });
    assert.notDeepEqual(book.quote(papa, 1000, ["D1"]), staticQuote, String(pricePerUnit));
  }
});

test("a fresh official offer still wins over the reference", () => {
  const offer = { storeId: "D1", foodId: "papa", packSize: papa.pack, regularPriceCop: 777, source: "official", observedOn: "2026-11-02" };
  const book = createCityPriceBook([offer], { today: TODAY, cityReference: [ref()] });

  assert.deepEqual(book.quote(papa, papa.pack, ["D1"]), {
    store: "D1",
    costCop: 777,
    packs: 1,
    packSize: papa.pack,
    source: "official",
    observedOn: "2026-11-02",
  });
});

test("a store with no fresh offer uses the reference even if another store has an offer", () => {
  const offer = { storeId: "D1", foodId: "papa", packSize: papa.pack, regularPriceCop: 99999, source: "official", observedOn: "2026-11-02" };
  const book = createCityPriceBook([offer], { today: TODAY, cityReference: [ref()] });
  const quote = book.quote(papa, papa.pack, ["Exito"]);

  assert.equal(quote.costCop, expectedWithRef(papa, papa.pack, "Exito", papa.price * 1.5));
});

test("when no store carries the food the fallback uses the reference at factor 1", () => {
  const book = createCityPriceBook([], { today: TODAY, cityReference: [ref()] });
  const quote = book.quote(papa, papa.pack, []);

  assert.equal(quote.costCop, Math.round(papa.pack * papa.price * 1.5));
  assert.equal(quote.source, "estimate");
});

test("a reference price never changes a book built without one", () => {
  const plain = createCityPriceBook([], { today: TODAY });
  for (const item of CATALOG) {
    assert.deepEqual(plain.quote(item, item.pack * 1.5, ["D1", "Jumbo"]), STATIC_PRICE_BOOK.quote(item, item.pack * 1.5, ["D1", "Jumbo"]), item.id);
  }
});
