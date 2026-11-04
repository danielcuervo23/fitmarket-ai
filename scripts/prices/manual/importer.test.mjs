import assert from "node:assert/strict";
import test from "node:test";
import { applyPrices, formatMappings, importManualPrices, planImport } from "./importer.ts";
import { foods, policy } from "./testData.mjs";

const TODAY = "2026-11-04";
const daysAgo = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const carullaMappings = [
  {
    foodId: "arroz_blanco",
    externalId: "445117",
    name: "Arroz DIANA blanco vitamor (500 gr)",
    packSize: 500,
    url: "https://www.carulla.com/arroz-diana-500-gr-479512/p",
  },
  {
    foodId: "papa",
    externalId: "1544",
    name: "Papa Pastusa Granel (1 kg)",
    packSize: 1000,
    url: "https://www.carulla.com/papa-pastusa-a-granel-x180gr-439761/p",
  },
];

const entry = (over = {}) => ({
  foodId: "pasta",
  externalId: "77001",
  name: "Pasta Doria spaghetti 500 g",
  packSize: 500,
  url: "https://www.carulla.com/pasta-doria-spaghetti-500-g/p",
  regularPriceCop: 3900,
  observedOn: TODAY,
  ...over,
});

const file = (over = {}, entries = [entry()]) => ({
  schemaVersion: 1,
  store: "Carulla",
  city: "bucaramanga",
  capturedOn: TODAY,
  cityAttested: true,
  entries,
  ...over,
});

const plan = (files, extra = {}) =>
  planImport({
    files: files.map((json, i) => ({ name: `f${i}.json`, json })),
    policy,
    foods,
    mappings: { Carulla: carullaMappings },
    today: TODAY,
    ...extra,
  });

// ---------- validation ----------

test("a valid file has no errors and adds the new food to the store mappings, sorted by food", () => {
  const p = plan([file()]);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(
    p.mappings.Carulla.map((m) => m.foodId),
    ["arroz_blanco", "papa", "pasta"],
  );
  assert.deepEqual(p.changes.Carulla, { added: ["pasta"], updated: [], removed: [] });
});

test("an entry for a mapped food updates its product data", () => {
  const p = plan([file({}, [entry({ foodId: "arroz_blanco", externalId: "445118", name: "Arroz Diana 500 g" })])]);
  assert.deepEqual(p.errors, []);
  const arroz = p.mappings.Carulla.find((m) => m.foodId === "arroz_blanco");
  assert.equal(arroz.externalId, "445118");
  assert.deepEqual(p.changes.Carulla, { added: [], updated: ["arroz_blanco"], removed: [] });
});

test("an unchanged entry is neither added nor updated", () => {
  const same = { ...carullaMappings[0], regularPriceCop: 2500, observedOn: TODAY };
  const p = plan([file({}, [same])]);
  assert.deepEqual(p.changes.Carulla, { added: [], updated: [], removed: [] });
});

test("a product moved to another food leaves the old food unmapped, and says so", () => {
  const moved = { ...carullaMappings[0], foodId: "arroz_integral", regularPriceCop: 2500, observedOn: TODAY };
  const p = plan([file({}, [moved])]);
  assert.deepEqual(p.changes.Carulla, { added: ["arroz_integral"], updated: [], removed: ["arroz_blanco"] });
  assert.equal(p.mappings.Carulla.filter((m) => m.externalId === "445117").length, 1);
});

test("the file schema is strict", () => {
  assert.notDeepEqual(plan([{ ...file(), extra: 1 }]).errors, []);
  assert.notDeepEqual(plan([file({}, [{ ...entry(), image: "https://x/y.png" }])]).errors, []);
  assert.notDeepEqual(plan([file({ schemaVersion: 2 })]).errors, []);
  assert.notDeepEqual(plan([file({ entries: [] })]).errors, []);
});

test("the person must have attested Bucaramanga", () => {
  assert.notDeepEqual(plan([file({ cityAttested: false })]).errors, []);
  assert.notDeepEqual(plan([file({ city: "bogota" })]).errors, []);
});

test("only stores allowed by policy.json are accepted", () => {
  assert.match(plan([file({ store: "Ara" })]).errors.join("\n"), /Ara/);
  assert.notDeepEqual(plan([file({ store: "Olimpica" })]).errors, []);
});

test("the URL must be a canonical product page on the store host", () => {
  assert.match(plan([file({}, [entry({ url: `${entry().url}?skuId=1` })])]).errors.join("\n"), /url/);
  assert.notDeepEqual(plan([file({}, [entry({ url: "https://www.exito.com/pasta/p" })])]).errors, []);
  assert.notDeepEqual(plan([file({}, [entry({ url: "https://www.carulla.com/mercado/pasta" })])]).errors, []);
});

test("the food must exist and the pack must be plausible for it", () => {
  assert.match(plan([file({}, [entry({ foodId: "caviar" })])]).errors.join("\n"), /caviar/);
  assert.match(plan([file({}, [entry({ packSize: 50_000 })])]).errors.join("\n"), /packSize/);
  assert.notDeepEqual(plan([file({}, [entry({ foodId: "pimenton", packSize: 1000 })])]).errors, []);
});

test("the price must be a whole number between 50 and 5,000,000 COP", () => {
  assert.notDeepEqual(plan([file({}, [entry({ regularPriceCop: 49 })])]).errors, []);
  assert.notDeepEqual(plan([file({}, [entry({ regularPriceCop: 5_000_001 })])]).errors, []);
  assert.notDeepEqual(plan([file({}, [entry({ regularPriceCop: 3900.5 })])]).errors, []);
  assert.deepEqual(plan([file({}, [entry({ regularPriceCop: 50 })])]).errors, []);
});

test("a price seen in the future or more than 45 days ago is refused", () => {
  assert.notDeepEqual(plan([file({}, [entry({ observedOn: "2026-11-05" })])]).errors, []);
  assert.notDeepEqual(plan([file({ capturedOn: "2026-11-05" }, [entry()])]).errors, []);
  assert.notDeepEqual(plan([file({ capturedOn: daysAgo(46) }, [entry({ observedOn: daysAgo(46) })])]).errors, []);
  assert.deepEqual(plan([file({ capturedOn: daysAgo(45) }, [entry({ observedOn: daysAgo(45) })])]).errors, []);
});

test("an entry seen after the export day is refused", () => {
  assert.notDeepEqual(plan([file({ capturedOn: daysAgo(1) }, [entry({ observedOn: TODAY })])]).errors, []);
});

test("with skipStale old entries are skipped instead of failing", () => {
  const p = plan([file({ capturedOn: daysAgo(60) }, [entry({ observedOn: daysAgo(60) })])], { skipStale: true });
  assert.deepEqual(p.errors, []);
  assert.equal(p.stale.length, 1);
  assert.deepEqual(p.prices, []);
  assert.equal(p.mappings.Carulla, undefined);
});

test("a food or a product twice in one file is refused", () => {
  assert.notDeepEqual(plan([file({}, [entry(), entry({ externalId: "77002" })])]).errors, []);
  assert.notDeepEqual(plan([file({}, [entry(), entry({ foodId: "arroz_integral" })])]).errors, []);
});

test("the newest export wins whatever the order of the files", () => {
  const older = file({ capturedOn: daysAgo(3) }, [entry({ observedOn: daysAgo(3), externalId: "1", url: "https://www.carulla.com/a/p" })]);
  const newer = file({}, [entry({ externalId: "2", url: "https://www.carulla.com/b/p" })]);
  for (const files of [[older, newer], [newer, older]]) {
    const p = plan(files);
    assert.equal(p.mappings.Carulla.find((m) => m.foodId === "pasta").externalId, "2");
    assert.equal(p.prices.length, 2);
  }
});

test("prices carry the store product, the regular price and the day it was seen", () => {
  const p = plan([file()]);
  assert.deepEqual(p.prices, [
    {
      product: {
        storeId: "Carulla",
        foodId: "pasta",
        externalId: "77001",
        name: "Pasta Doria spaghetti 500 g",
        packSize: 500,
        url: "https://www.carulla.com/pasta-doria-spaghetti-500-g/p",
      },
      regularPriceCop: 3900,
      observedOn: TODAY,
    },
  ]);
});

test("mapping files are written as the loader expects: 2-space JSON with a final newline", () => {
  const text = formatMappings(carullaMappings);
  assert.equal(text, `${JSON.stringify(carullaMappings, null, 2)}\n`);
});

// ---------- write path ----------

function fakeSink({ known = {}, last = {} } = {}) {
  const calls = [];
  let next = 100;
  const ids = (products) => {
    const out = new Map();
    for (const p of products) {
      const k = `${p.storeId}:${p.externalId}`;
      out.set(k, known[k] ?? next++);
    }
    return out;
  };
  return {
    calls,
    async upsertProducts(products) {
      calls.push(["upsertProducts", products]);
      return ids(products);
    },
    async findProductIds(products) {
      calls.push(["findProductIds", products]);
      const out = new Map();
      for (const p of products) {
        const k = `${p.storeId}:${p.externalId}`;
        if (known[k] !== undefined) out.set(k, known[k]);
      }
      return out;
    },
    async lastPrices(idList, city) {
      calls.push(["lastPrices", idList, city]);
      return new Map(Object.entries(last).map(([id, v]) => [Number(id), v]));
    },
    async upsertPrices(rows) {
      calls.push(["upsertPrices", rows]);
    },
  };
}

test("writing upserts the products and the prices for Bucaramanga", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 } });
  const summary = await applyPrices(plan([file()]).prices, sink, { write: true });
  assert.deepEqual(summary, { Carulla: { saved: 1, skipped: {} } });
  assert.deepEqual(sink.calls.map((c) => c[0]), ["upsertProducts", "lastPrices", "upsertPrices"]);
  assert.equal(sink.calls[1][2], "bucaramanga");
  assert.deepEqual(sink.calls[2][1], [{ storeProductId: 7, city: "bucaramanga", regularPriceCop: 3900, observedOn: TODAY }]);
});

test("the jump guard keeps a price that more than doubles from being written", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 }, last: { 7: 1500 } });
  const summary = await applyPrices(plan([file()]).prices, sink, { write: true });
  assert.deepEqual(summary, { Carulla: { saved: 0, skipped: { jump: 1 } } });
  assert.ok(!sink.calls.some((c) => c[0] === "upsertPrices"));
});

test("a dry run only reads", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 } });
  const summary = await applyPrices(plan([file()]).prices, sink, { write: false });
  assert.deepEqual(summary, { Carulla: { saved: 1, skipped: {} } });
  assert.deepEqual(sink.calls.map((c) => c[0]), ["findProductIds", "lastPrices"]);
});

test("nothing reaches the sink when any file has an error", async () => {
  const sink = fakeSink();
  const r = await importManualPrices({
    files: [{ name: "a.json", json: file() }, { name: "b.json", json: file({ cityAttested: false }) }],
    policy,
    foods,
    mappings: { Carulla: carullaMappings },
    today: TODAY,
    sink,
    write: true,
  });
  assert.notDeepEqual(r.plan.errors, []);
  assert.equal(r.prices, null);
  assert.deepEqual(sink.calls, []);
});

test("without a sink the import only plans", async () => {
  const r = await importManualPrices({
    files: [{ name: "a.json", json: file() }],
    policy,
    foods,
    mappings: { Carulla: carullaMappings },
    today: TODAY,
    write: false,
  });
  assert.deepEqual(r.plan.errors, []);
  assert.equal(r.prices, null);
});

// ---------- contract with the bookmarklet ----------

test("a file exported by the bookmarklet is accepted by the importer", async () => {
  const { buildExport, emptyState, saveEntry } = await import("./capture.ts");
  const { storeSitesFromPolicy } = await import("./format.ts");
  const site = storeSitesFromPolicy(policy).find((s) => s.storeId === "Carulla");
  const saved = saveEntry(emptyState("Carulla"), {
    product: { storeId: "Carulla", ...entry(), packSize: 500 },
    foodId: "pasta",
    packSize: 500,
    attested: true,
    today: TODAY,
    foods,
    site,
  });
  assert.equal(saved.ok, true);
  const exported = JSON.parse(JSON.stringify(buildExport(saved.state, TODAY).data));
  assert.deepEqual(plan([exported]).errors, []);
});
