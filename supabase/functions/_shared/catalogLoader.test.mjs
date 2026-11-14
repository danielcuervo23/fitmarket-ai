import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { CATALOG, STATIC_CATALOG, createCatalog, getIngredient } from "./catalog.ts";
import {
  MIN_DB_FOODS,
  bogotaToday,
  foodRowToIngredient,
  loadPlannerData,
  plannerDeps,
  resetPlannerDataCache,
  resolveCacheTtlMs,
} from "./catalogLoader.ts";
import { calcTargets } from "./nutrition.ts";
import { assemblePlan } from "./planner/build.ts";
import { generatePlan } from "./planner/generate.ts";
import { createCityPriceBook } from "./planner/priceBook.ts";
import { STATIC_PRICE_BOOK } from "./planner/stores.ts";
import { DAYS, SLOTS } from "./planner/types.ts";

beforeEach(() => resetPlannerDataCache());

/** The DB row (table `foods`) that mirrors a catalog entry. */
function rowFor(item) {
  return {
    id: item.id,
    name_es: item.name.es,
    name_en: item.name.en,
    plural_es: item.plural?.es ?? null,
    plural_en: item.plural?.en ?? null,
    shopping_category: item.category,
    unit: item.unit,
    whole_units: item.wholeUnits === true,
    grams_per_unit: item.gramsPerUnit ?? null,
    diet_tags: item.tags,
    kcal: item.per100.kcal,
    protein_g: item.per100.protein,
    carbs_g: item.per100.carbs,
    fat_g: item.per100.fat,
    default_pack: item.pack,
    ref_price_cop: item.price,
    ref_price_source: item.priceSource,
    fiber_g: item.micro?.fiberG ?? null,
    free_sugars_g: item.micro?.freeSugarsG ?? null,
    sat_fat_g: item.micro?.satFatG ?? null,
    sodium_mg: item.micro?.sodiumMg ?? null,
    iron_mg: item.micro?.ironMg ?? null,
    gaba_group: item.micro?.gabaGroup ?? null,
    is_fruit_veg: item.micro?.isFruitVeg ?? false,
  };
}

const allRows = () => CATALOG.map(rowFor);

/** A client that records every paged read; handlers answer per table. */
function fakeClient(handlers) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        select(columns) {
          const filters = [];
          const orders = [];
          const builder = {
            eq(column, value) {
              filters.push([column, value]);
              return builder;
            },
            order(column) {
              orders.push(column);
              return builder;
            },
            range(from, to) {
              calls.push({ table, columns, filters: [...filters], orders: [...orders], range: [from, to] });
              return Promise.resolve(handlers[table]({ from, to, filters }));
            },
          };
          return builder;
        },
      };
    },
  };
}

const page = (rows) => ({ from, to }) => ({ data: rows.slice(from, to + 1), error: null });
const callsTo = (client, table) => client.calls.filter((call) => call.table === table);
const huevo = getIngredient("huevo");
const NOW = Date.parse("2026-11-04T15:00:00Z");

test("maps a foods row to an Ingredient", () => {
  assert.deepEqual(foodRowToIngredient(rowFor(huevo)), huevo);
  assert.deepEqual(foodRowToIngredient(rowFor(getIngredient("pechuga_pollo"))), getIngredient("pechuga_pollo"));
});

test("every static food round-trips through its row", () => {
  for (const item of CATALOG) {
    assert.deepEqual(foodRowToIngredient(rowFor(item)), item, item.id);
  }
});

test("rejects invalid rows", () => {
  const base = rowFor(huevo);
  const bad = [
    { ...base, kcal: -1 },
    { ...base, unit: "kg" },
    { ...base, grams_per_unit: null },
    { ...base, id: "Bad Id!" },
    { ...base, diet_tags: ["unknown_tag"] },
    { ...base, default_pack: 0 },
    { ...base, ref_price_cop: -3 },
    { ...base, ref_price_source: "official" },
    { ...base, shopping_category: "otra" },
    { ...base, name_es: "" },
    { ...base, protein_g: "abc" },
    null,
    "row",
  ];

  for (const row of bad) {
    assert.equal(foodRowToIngredient(row), null, JSON.stringify(row));
  }
});

test("a row with valid micro columns maps to ingredient.micro", () => {
  const brocoli = getIngredient("brocoli");
  const row = { ...rowFor(brocoli), fiber_g: "2.6", sodium_mg: "33.0", gaba_group: "frutas_verduras", is_fruit_veg: true };

  assert.deepEqual(foodRowToIngredient(row).micro, {
    fiberG: 2.6,
    freeSugarsG: 0,
    satFatG: 0.11,
    sodiumMg: 33,
    ironMg: 0.73,
    gabaGroup: "frutas_verduras",
    isFruitVeg: true,
  });
});

test("a null gaba_group is accepted as no group", () => {
  const row = { ...rowFor(getIngredient("sal")), gaba_group: null };

  assert.equal(foodRowToIngredient(row).micro.gabaGroup, null);
});

test("a row with an out-of-range micro column keeps the food without micro", () => {
  const base = rowFor(getIngredient("brocoli"));
  const bad = [
    { ...base, sodium_mg: 50000 },
    { ...base, fiber_g: -1 },
    { ...base, free_sugars_g: 101 },
    { ...base, sat_fat_g: "abc" },
    { ...base, iron_mg: null },
    { ...base, gaba_group: "dulces" },
    { ...base, is_fruit_veg: "true" },
    { ...base, is_fruit_veg: null },
  ];

  for (const row of bad) {
    const ingredient = foodRowToIngredient(row);
    assert.ok(ingredient, JSON.stringify(row));
    assert.equal(ingredient.id, "brocoli");
    assert.equal(ingredient.micro, undefined, JSON.stringify(row));
  }
});

test("foods are read with the micro columns", async () => {
  const client = fakeClient({ foods: page(allRows()) });
  await loadPlannerData(client, null);
  const [call] = callsTo(client, "foods");

  for (const column of ["fiber_g", "free_sugars_g", "sat_fat_g", "sodium_mg", "iron_mg", "gaba_group", "is_fruit_veg"]) {
    assert.ok(call.columns.split(",").map((c) => c.trim()).includes(column), column);
  }
});

test("foods without micro are counted and logged once per load", async (t) => {
  const logs = [];
  t.mock.method(console, "log", (line) => logs.push(JSON.parse(line)));
  const rows = allRows().map((row, index) => (index < 3 ? { ...row, sodium_mg: 50000 } : row));
  const data = await loadPlannerData(fakeClient({ foods: page(rows) }), null);

  assert.equal(data.origin, "db");
  assert.equal(data.catalog.all.length, CATALOG.length);
  assert.deepEqual(logs.filter((entry) => entry.event === "catalog_micro_missing"), [
    { event: "catalog_micro_missing", count: 3 },
  ]);
});

test("no catalog_micro_missing log when every food has micro", async (t) => {
  const logs = [];
  t.mock.method(console, "log", (line) => logs.push(JSON.parse(line)));
  await loadPlannerData(fakeClient({ foods: page(allRows()) }), null);

  assert.equal(logs.filter((entry) => entry.event === "catalog_micro_missing").length, 0);
});

test("invalid rows are skipped, valid ones kept", async () => {
  const rows = [...allRows(), { ...rowFor(huevo), id: "roto", kcal: -5 }];
  const data = await loadPlannerData(fakeClient({ foods: page(rows) }), null);

  assert.equal(data.origin, "db");
  assert.equal(data.catalog.get("roto"), undefined);
  assert.equal(data.catalog.all.length, CATALOG.length);
});

test("paginates with range and a stable order", async () => {
  const rows = Array.from({ length: 1005 }, (_, i) => rowFor({ ...huevo, id: `food_${i}` }));
  const client = fakeClient({ foods: page(rows) });
  const data = await loadPlannerData(client, null);
  const foodCalls = callsTo(client, "foods");

  assert.deepEqual(foodCalls.map((call) => call.range), [[0, 999], [1000, 1999]]);
  assert.deepEqual(foodCalls[0].filters, [["is_active", true]]);
  assert.deepEqual(foodCalls[0].orders, ["id"]);
  assert.equal(data.catalog.all.length, 1005);
});

test("prices are read with city filter, stable order and pages", async () => {
  const offers = Array.from({ length: 1003 }, (_, i) => ({
    city: "bucaramanga",
    store_id: "D1",
    food_id: "huevo",
    store_product_id: i + 1,
    pack_size: 30,
    regular_price_cop: 16900,
    source: "official",
    observed_on: "2026-11-02",
  }));
  const client = fakeClient({
    foods: page(allRows()),
    current_prices: page(offers),
    store_products: page([]),
  });
  await loadPlannerData(client, "bucaramanga", { now: () => NOW });
  const priceCalls = callsTo(client, "current_prices");

  assert.deepEqual(priceCalls.map((call) => call.range), [[0, 999], [1000, 1999]]);
  assert.deepEqual(priceCalls[0].filters, [["city", "bucaramanga"]]);
  assert.deepEqual(priceCalls[0].orders, ["store_product_id"]);
  assert.deepEqual(callsTo(client, "store_products")[0].filters, [["is_active", false]]);
});

test("caches within TTL and shares concurrent loads", async () => {
  let now = 1_000_000;
  const client = fakeClient({ foods: page(allRows()) });
  const options = { now: () => now, ttlMs: 60_000 };

  await Promise.all([loadPlannerData(client, null, options), loadPlannerData(client, null, options)]);
  assert.equal(callsTo(client, "foods").length, 1, "concurrent calls share one load");

  await loadPlannerData(client, null, options);
  assert.equal(callsTo(client, "foods").length, 1, "second call is cached");

  now += 60_001;
  await loadPlannerData(client, null, options);
  assert.equal(callsTo(client, "foods").length, 2, "expired entry reloads");
});

test("ttl 0 never caches", async () => {
  const client = fakeClient({ foods: page(allRows()) });
  await loadPlannerData(client, null, { ttlMs: 0 });
  await loadPlannerData(client, null, { ttlMs: 0 });
  assert.equal(callsTo(client, "foods").length, 2);
});

test("falls back to static when the table is missing", async () => {
  for (const code of ["42P01", "PGRST205"]) {
    resetPlannerDataCache();
    const client = fakeClient({ foods: () => ({ data: null, error: { code, message: "relation secret" } }) });
    const data = await loadPlannerData(client, null);

    assert.equal(data.origin, "static");
    assert.equal(data.catalog, STATIC_CATALOG);
    assert.equal(data.prices, STATIC_PRICE_BOOK);
  }
});

test("falls back on any query error and when the client throws", async () => {
  const failing = fakeClient({ foods: () => ({ data: null, error: { code: "57014" } }) });
  assert.equal((await loadPlannerData(failing, null)).origin, "static");

  resetPlannerDataCache();
  const throwing = fakeClient({
    foods: () => {
      throw new Error("boom");
    },
  });
  assert.equal((await loadPlannerData(throwing, null)).origin, "static");
});

test("falls back when too few foods", async () => {
  assert.ok(MIN_DB_FOODS >= 40);
  const data = await loadPlannerData(fakeClient({ foods: page(allRows().slice(0, 10)) }), null);

  assert.equal(data.origin, "static");
});

test("falls back when the read times out", async () => {
  const client = fakeClient({ foods: () => new Promise(() => {}) });
  const data = await loadPlannerData(client, null, { timeoutMs: 20 });

  assert.equal(data.origin, "static");
});

test("failures are not cached and a stale value is served on failure", async () => {
  let now = 0;
  let healthy = false;
  const client = fakeClient({
    foods: (args) => (healthy ? page(allRows())(args) : { data: null, error: { code: "XX000" } }),
  });
  const options = { now: () => now, ttlMs: 1000 };

  assert.equal((await loadPlannerData(client, null, options)).origin, "static");
  healthy = true;
  const fresh = await loadPlannerData(client, null, options);
  assert.equal(fresh.origin, "db", "the failure was not cached");

  now += 5000;
  healthy = false;
  const stale = await loadPlannerData(client, null, options);
  assert.equal(stale.origin, "db", "stale catalog beats static");
  assert.equal(stale.catalog, fresh.catalog);
});

test("no city means no price query and estimate prices", async () => {
  const client = fakeClient({ foods: page(allRows()) });
  const data = await loadPlannerData(client, null);

  assert.equal(callsTo(client, "current_prices").length, 0);
  assert.equal(data.prices.quote(huevo, 12, ["D1"]).source, "estimate");
});

test("city prices become offers", async () => {
  const client = fakeClient({
    foods: page(allRows()),
    store_products: page([]),
    current_prices: page([
      {
        city: "bucaramanga",
        store_id: "D1",
        food_id: "huevo",
        store_product_id: 7,
        pack_size: 30,
        regular_price_cop: 16900,
        source: "official",
        observed_on: "2026-11-02",
      },
      // Invalid rows are skipped, not fatal.
      { city: "bucaramanga", store_id: "D1", food_id: "huevo", store_product_id: 8, pack_size: 0, regular_price_cop: 1, source: "official", observed_on: "2026-11-02" },
      { city: "bucaramanga", store_id: "D1", food_id: "huevo", store_product_id: 9, pack_size: 30, regular_price_cop: 100, source: "estimate", observed_on: "2026-11-02" },
    ]),
  });
  const data = await loadPlannerData(client, "bucaramanga", { now: () => NOW });
  const quote = data.prices.quote(huevo, 12, ["D1"]);

  assert.equal(quote.source, "official");
  assert.equal(quote.packSize, 30);
  assert.equal(quote.costCop, 16900);
});

test("inactive store products are not carried", async () => {
  const client = fakeClient({
    foods: page(allRows()),
    store_products: page([{ store_id: "Exito", food_id: "huevo" }]),
    current_prices: page([]),
  });
  const data = await loadPlannerData(client, "bogota", { now: () => NOW });

  assert.equal(data.prices.carries("Exito", "huevo"), false);
  assert.equal(data.prices.carries("Jumbo", "huevo"), true);
});

test("a price failure keeps the database catalog with estimate prices", async () => {
  const client = fakeClient({
    foods: page(allRows()),
    store_products: page([]),
    current_prices: () => ({ data: null, error: { code: "PGRST205" } }),
  });
  const data = await loadPlannerData(client, "bogota", { now: () => NOW });

  assert.equal(data.catalog.all.length, CATALOG.length);
  assert.equal(data.prices, STATIC_PRICE_BOOK);
});

test("same plan totals as static when the DB mirrors the catalog", async () => {
  const data = await loadPlannerData(fakeClient({ foods: page(allRows()) }), null);
  const week = {};
  const lines = {
    desayuno: [["huevo", 3], ["avena", 60], ["banano", 1]],
    almuerzo: [["pechuga_pollo", 200], ["arroz_blanco", 100], ["papa", 150]],
    cena: [["lentejas", 90], ["aguacate", 1], ["tomate_chonto", 100]],
    snacks: [["manzana", 1], ["leche_entera", 250]],
  };

  for (const day of DAYS) {
    week[day] = {};
    for (const slot of SLOTS) {
      week[day][slot] = {
        name: { es: "x", en: "x" },
        items: lines[slot].map(([id, qty]) => ({ id, qty })),
      };
    }
  }

  const options = {
    householdSize: 2,
    stores: ["D1", "Exito"],
    targets: calcTargets({ age: 30, weightKg: 70, heightCm: 170, activity: "moderate", sex: "male" }, ["healthy"]),
  };
  const fromDb = assemblePlan(week, { ...options, catalog: data.catalog, prices: data.prices });
  const fromStatic = assemblePlan(week, options);

  assert.ok(fromStatic.summary.estimated_total_cop > 0);
  assert.equal(fromDb.summary.estimated_total_cop, fromStatic.summary.estimated_total_cop);
  assert.deepEqual(fromDb.shopping_list, fromStatic.shopping_list);
});

test("resolveCacheTtlMs defaults and clamps", () => {
  assert.equal(resolveCacheTtlMs(undefined), 600_000);
  assert.equal(resolveCacheTtlMs("abc"), 600_000);
  assert.equal(resolveCacheTtlMs("0"), 0);
  assert.equal(resolveCacheTtlMs("-5"), 0);
  assert.equal(resolveCacheTtlMs("999999999"), 3_600_000);
  assert.equal(resolveCacheTtlMs("1000"), 1000);
});

test("bogotaToday uses the Colombian calendar day", () => {
  assert.equal(bogotaToday(Date.parse("2026-11-04T04:59:00Z")), "2026-11-03");
  assert.equal(bogotaToday(Date.parse("2026-11-04T05:00:00Z")), "2026-11-04");
});

// ---- A food that exists only in the database must work end to end.

const dbOnly = {
  ...getIngredient("lentejas"),
  id: "bocadillo",
  name: { es: "Bocadillo", en: "Guava paste" },
};

test("a database-only food is not filtered out by store data", async () => {
  const small = createCatalog([...CATALOG.filter((item) => item.id !== "salmon").slice(0, 18), dbOnly]);
  const prices = createCityPriceBook(
    [{ storeId: "D1", foodId: "bocadillo", packSize: 500, regularPriceCop: 2500, source: "official", observedOn: "2026-11-02" }],
    { today: "2026-11-04" },
  );
  const result = await generatePlan(
    {
      weeklyBudgetCop: 250_000,
      goals: ["healthy"],
      stores: ["D1"],
      householdSize: 1,
      restrictions: [],
      profile: { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" },
    },
    async () => {
      throw new Error("model must not be called");
    },
    undefined,
    { catalog: small, prices },
  );

  assert.equal(result.error.code, "restrictions_too_strict");
  // 19 foods; D1 does not carry tilapia or sobrebarriga, so 17 remain, bocadillo among them.
  assert.equal(result.error.diagnostics.availableFoods, 17, "includes the database-only food");
  assert.equal(result.error.diagnostics.totalFoods, 19);
});

// ---- Fix round 1

const letters = (n) => `ciudad_${String.fromCharCode(97 + (n % 26))}${String.fromCharCode(97 + Math.floor(n / 26))}`;

test("many cities never evict the global foods entry", async () => {
  const client = fakeClient({
    foods: page(allRows()),
    store_products: page([]),
    current_prices: page([]),
  });
  const options = { now: () => NOW, ttlMs: 600_000 };

  await loadPlannerData(client, letters(0), options);

  for (let i = 1; i <= 60; i += 1) {
    await loadPlannerData(client, letters(i), options);
  }

  assert.equal(callsTo(client, "foods").length, 1, "foods was read once and stayed cached");
});

test("the inactive list is read once for all cities", async () => {
  const client = fakeClient({
    foods: page(allRows()),
    store_products: page([{ store_id: "Exito", food_id: "huevo" }]),
    current_prices: page([]),
  });
  const options = { now: () => NOW, ttlMs: 600_000 };

  const a = await loadPlannerData(client, "bogota", options);
  const b = await loadPlannerData(client, "bucaramanga", options);

  assert.equal(callsTo(client, "store_products").length, 1);
  assert.equal(a.prices.carries("Exito", "huevo"), false);
  assert.equal(b.prices.carries("Exito", "huevo"), false);
});

test("plannerDeps hands the loaded catalog and prices to the planner", async () => {
  const data = await loadPlannerData(fakeClient({ foods: page(allRows()) }), null);
  const deps = plannerDeps(data);

  assert.equal(deps.catalog, data.catalog);
  assert.equal(deps.prices, data.prices);
});

test("generate-weekly-plan passes the planner data to generatePlan", () => {
  const source = readFileSync(new URL("../generate-weekly-plan/index.ts", import.meta.url), "utf8");
  const call = source.slice(source.indexOf("await generatePlan("));

  assert.match(call, /await deps\(\)\s*,?\s*\)/, "4th argument of generatePlan");
  assert.match(source, /return plannerDeps\(plannerData\);/, "deps() loads the planner data once");
});

// ---- city reference prices (DANE SIPSA base for estimates) ----

const papaItem = getIngredient("papa");
const refRow = (over = {}) => ({
  food_id: "papa",
  price_cop_per_unit: papaItem.price * 1.5,
  observed_on: "2026-10-24",
  source: "dane_sipsa",
  ...over,
});
const staticEstimate = createCityPriceBook([], { today: "2026-11-04" }).quote(papaItem, 1000, ["D1"]);
const refClient = (handlers) =>
  fakeClient({ foods: page(allRows()), store_products: page([]), current_prices: page([]), ...handlers });

test("city reference prices are read with city filter, stable order and pages", async () => {
  const rows = Array.from({ length: 1003 }, (_, i) => refRow({ food_id: `food_${i}` }));
  const client = refClient({ city_reference_prices: page(rows) });
  await loadPlannerData(client, "bucaramanga", { now: () => NOW });
  const calls = callsTo(client, "city_reference_prices");

  assert.deepEqual(calls.map((call) => call.range), [[0, 999], [1000, 1999]]);
  assert.deepEqual(calls[0].filters, [["city", "bucaramanga"]]);
  assert.deepEqual(calls[0].orders, ["food_id"]);
  assert.match(calls[0].columns, /food_id.*price_cop_per_unit.*observed_on/);
});

test("a fresh city reference price becomes the base of the estimate", async () => {
  const client = refClient({ city_reference_prices: page([refRow()]) });
  const data = await loadPlannerData(client, "bucaramanga", { now: () => NOW });
  const quote = data.prices.quote(papaItem, 1000, ["D1"]);
  const expected = createCityPriceBook([], {
    today: "2026-11-04",
    cityReference: [{ foodId: "papa", pricePerUnit: papaItem.price * 1.5, observedOn: "2026-10-24" }],
  }).quote(papaItem, 1000, ["D1"]);

  assert.deepEqual(quote, expected);
  assert.notDeepEqual(quote, staticEstimate);
  assert.equal(quote.source, "estimate");
});

test("a missing table, a query error or a throwing client keep the static estimates", async () => {
  const cases = [
    { city_reference_prices: () => ({ data: null, error: { code: "PGRST205" } }) },
    { city_reference_prices: () => ({ data: null, error: { code: "42P01" } }) },
    {
      city_reference_prices: () => {
        throw new Error("boom");
      },
    },
    {},
  ];

  for (const handlers of cases) {
    resetPlannerDataCache();
    const data = await loadPlannerData(refClient(handlers), "bucaramanga", { now: () => NOW });

    assert.equal(data.origin, "db");
    assert.deepEqual(data.prices.quote(papaItem, 1000, ["D1"]), staticEstimate);
  }
});

test("a reference failure does not drop the official offers", async () => {
  const offer = {
    city: "bucaramanga", store_id: "D1", food_id: "huevo", store_product_id: 7, pack_size: 30,
    regular_price_cop: 16900, source: "official", observed_on: "2026-11-02",
  };
  const client = refClient({
    current_prices: page([offer]),
    city_reference_prices: () => ({ data: null, error: { code: "42P01" } }),
  });
  const data = await loadPlannerData(client, "bucaramanga", { now: () => NOW });

  assert.equal(data.prices.quote(huevo, 12, ["D1"]).source, "official");
});

test("invalid reference rows are skipped, valid ones kept", async () => {
  const bad = [
    refRow({ price_cop_per_unit: 0 }),
    refRow({ price_cop_per_unit: "abc" }),
    refRow({ food_id: "Bad Id!" }),
    refRow({ observed_on: "ayer" }),
    refRow({ source: "other" }),
    null,
  ];
  const client = refClient({ city_reference_prices: page([...bad, refRow({ food_id: "yuca", price_cop_per_unit: getIngredient("yuca").price * 1.2 })]) });
  const data = await loadPlannerData(client, "bucaramanga", { now: () => NOW });

  assert.deepEqual(data.prices.quote(papaItem, 1000, ["D1"]), staticEstimate);
  assert.notDeepEqual(
    data.prices.quote(getIngredient("yuca"), 1000, ["D1"]),
    createCityPriceBook([], { today: "2026-11-04" }).quote(getIngredient("yuca"), 1000, ["D1"]),
  );
});

test("no city means no reference query; reference rows are cached with the same ttl", async () => {
  const none = refClient({ city_reference_prices: page([refRow()]) });
  await loadPlannerData(none, null, { now: () => NOW });
  assert.equal(callsTo(none, "city_reference_prices").length, 0);

  resetPlannerDataCache();
  const client = refClient({ city_reference_prices: page([refRow()]) });
  await loadPlannerData(client, "bucaramanga", { now: () => NOW, ttlMs: 60_000 });
  await loadPlannerData(client, "bucaramanga", { now: () => NOW + 1000, ttlMs: 60_000 });
  assert.equal(callsTo(client, "city_reference_prices").length, 1);
  await loadPlannerData(client, "bucaramanga", { now: () => NOW + 61_000, ttlMs: 60_000 });
  assert.equal(callsTo(client, "city_reference_prices").length, 2);
});

test("many cities never evict the global foods entry (reference entries are capped too)", async () => {
  const client = refClient({ city_reference_prices: page([refRow()]) });
  for (let i = 0; i < 60; i += 1) {
    await loadPlannerData(client, `ciudad_${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, { now: () => NOW });
  }
  const before = callsTo(client, "foods").length;
  await loadPlannerData(client, "bucaramanga", { now: () => NOW });
  assert.equal(callsTo(client, "foods").length, before);
});
