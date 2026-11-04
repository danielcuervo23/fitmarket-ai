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
  packConfirmed: true,
  ...over,
});

const file = (over = {}, entries = [entry()]) => ({
  schemaVersion: 2,
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
  const same = { ...carullaMappings[0], regularPriceCop: 2500, observedOn: TODAY, packConfirmed: true };
  const p = plan([file({}, [same])]);
  assert.deepEqual(p.changes.Carulla, { added: [], updated: [], removed: [] });
});

test("a product moved to another food leaves the old food unmapped, and says so", () => {
  const moved = { ...carullaMappings[0], foodId: "arroz_integral", regularPriceCop: 2500, observedOn: TODAY, packConfirmed: true };
  const p = plan([file({}, [moved])]);
  assert.deepEqual(p.changes.Carulla, { added: ["arroz_integral"], updated: [], removed: ["arroz_blanco"] });
  assert.equal(p.mappings.Carulla.filter((m) => m.externalId === "445117").length, 1);
});

test("the file schema is strict", () => {
  assert.notDeepEqual(plan([{ ...file(), extra: 1 }]).errors, []);
  assert.notDeepEqual(plan([file({}, [{ ...entry(), image: "https://x/y.png" }])]).errors, []);
  assert.notDeepEqual(plan([file({ schemaVersion: 3 })]).errors, []);
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
    // The older product lost its food: its price is dropped (reported), never written for an inactive product.
    assert.equal(p.prices.length, 1);
    assert.equal(p.dropped.length, 1);
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
// ---------- hand-typed packs and pack changes ----------

test("a version 1 file is read with every pack unconfirmed", () => {
  const v1 = file({ schemaVersion: 1 }, [(({ packConfirmed, ...rest }) => rest)(entry())]);
  assert.match(plan([v1]).errors.join("\n"), /--allow-unconfirmed-pack/);
  const p = plan([v1], { allowUnconfirmedPack: true });
  assert.deepEqual(p.errors, []);
  assert.equal(p.prices.length, 1);
});

test("a version 1 file with packConfirmed is refused (strict schema)", () => {
  assert.notDeepEqual(plan([file({ schemaVersion: 1 })]).errors, []);
});

test("a pack typed by hand is refused unless explicitly allowed", () => {
  const typed = file({}, [entry({ packConfirmed: false })]);
  assert.match(plan([typed]).errors.join("\n"), /packConfirmed/);
  assert.deepEqual(plan([typed], { allowUnconfirmedPack: true }).errors, []);
});

test("a new pack size for a product already mapped is refused unless explicitly allowed", () => {
  const bigger = file({}, [{ ...carullaMappings[0], packSize: 1000, regularPriceCop: 5000, observedOn: TODAY, packConfirmed: true }]);
  assert.match(plan([bigger]).errors.join("\n"), /445117.*500.*1000.*--allow-pack-change/);
  const p = plan([bigger], { allowPackChange: true });
  assert.deepEqual(p.errors, []);
  assert.equal(p.packChanges.length, 1);
  assert.deepEqual(
    p.prices.map((x) => [x.product.packSize, x.regularPriceCop]),
    [[1000, 5000]],
  );
});

test("with a pack change allowed, a price seen with the old pack is dropped, never stored under the new pack", () => {
  const url = "https://www.carulla.com/pasta-doria-spaghetti-500-g/p";
  const older = file({ capturedOn: daysAgo(3) }, [entry({ observedOn: daysAgo(3), url })]);
  const newer = file({}, [entry({ packSize: 1000, regularPriceCop: 7000, url })]);
  assert.notDeepEqual(plan([older, newer]).errors, []);
  const p = plan([older, newer], { allowPackChange: true });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(
    p.prices.map((x) => [x.product.packSize, x.regularPriceCop, x.observedOn]),
    [[1000, 7000, TODAY]],
  );
  assert.equal(p.dropped.length, 1);
});

test("products that lose their food are listed to retire", () => {
  const p = plan([file({}, [entry({ foodId: "arroz_blanco", externalId: "445118" })])]);
  assert.deepEqual(
    p.retired.map((r) => `${r.storeId}:${r.externalId}`),
    ["Carulla:445117"],
  );
});

// ---------- write path ----------

function fakeSink({ known = {}, last = {}, existing = {} } = {}) {
  const calls = [];
  let next = 100;
  const lookup = (products, create) => {
    const out = new Map();
    for (const p of products) {
      const k = `${p.storeId}:${p.externalId}`;
      if (known[k] !== undefined) out.set(k, known[k]);
      else if (create) out.set(k, next++);
    }
    return out;
  };
  return {
    calls,
    writes: () => calls.filter((c) => ["upsertProducts", "upsertPrices", "deactivateProducts"].includes(c[0])),
    async upsertProducts(products) {
      calls.push(["upsertProducts", products]);
      return lookup(products, true);
    },
    async findProductIds(products) {
      calls.push(["findProductIds", products]);
      return lookup(products, false);
    },
    async lastPrices(idList, city) {
      calls.push(["lastPrices", idList, city]);
      return new Map(Object.entries(last).map(([id, v]) => [Number(id), v]));
    },
    async existingPrices(idList, city, since) {
      calls.push(["existingPrices", idList, city, since]);
      return new Map(Object.entries(existing));
    },
    async upsertPrices(rows) {
      calls.push(["upsertPrices", rows]);
    },
    async deactivateProducts(ids) {
      calls.push(["deactivateProducts", ids]);
    },
  };
}

const apply = (p, sink, opts = {}) => applyPrices(p, sink, { write: true, foods, today: TODAY, ...opts });

test("writing checks everything first, then upserts the products and the prices for Bucaramanga", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 } });
  const r = await apply(plan([file()]), sink);
  assert.deepEqual(r.summary, { Carulla: { saved: 1, skipped: {} } });
  assert.equal(r.written, true);
  assert.deepEqual(
    sink.calls.map((c) => c[0]),
    ["findProductIds", "lastPrices", "existingPrices", "upsertProducts", "upsertPrices"],
  );
  assert.equal(sink.calls[1][2], "bucaramanga");
  assert.equal(sink.calls[2][3], daysAgo(45));
  assert.deepEqual(sink.calls[4][1], [{ storeProductId: 7, city: "bucaramanga", regularPriceCop: 3900, observedOn: TODAY }]);
});

test("one price that more than doubles among 20 means nothing is written at all", async () => {
  const foodIds = foods.filter((f) => f.unit === "g" && f.id !== "pasta").slice(0, 19).map((f) => f.id);
  const entries = [entry(), ...foodIds.map((foodId, i) => {
    const food = foods.find((f) => f.id === foodId);
    return entry({
      foodId,
      externalId: `9${i}`,
      url: `https://www.carulla.com/p-${i}/p`,
      packSize: food.defaultPack,
      regularPriceCop: Math.round(food.refPriceCop * food.defaultPack),
    });
  })];
  const known = { "Carulla:77001": 7 };
  const sink = fakeSink({ known, last: { 7: 1500 } });
  const p = plan([file({}, entries)]);
  assert.deepEqual(p.errors, []);
  assert.equal(p.prices.length, 20);
  const r = await apply(p, sink);
  assert.equal(r.written, false);
  assert.equal(r.summary.Carulla.skipped.jump, 1);
  assert.deepEqual(sink.writes(), []);
});

test("a dry run only reads", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 } });
  const r = await apply(plan([file()]), sink, { write: false });
  assert.deepEqual(r.summary, { Carulla: { saved: 1, skipped: {} } });
  assert.equal(r.written, false);
  assert.deepEqual(sink.writes(), []);
});

test("a first price far from the food's reference price per pack is refused unless allowed", async () => {
  // pasta: reference 5 COP/g x 500 g = 2500 COP; 7600 is more than x3.
  const outlier = plan([file({}, [entry({ regularPriceCop: 7600 })])]);
  let sink = fakeSink();
  let r = await apply(outlier, sink);
  assert.deepEqual(r.summary, { Carulla: { saved: 0, skipped: { outlier: 1 } } });
  assert.deepEqual(sink.writes(), []);
  const cheap = plan([file({}, [entry({ regularPriceCop: 800 })])]);
  r = await apply(cheap, fakeSink());
  assert.deepEqual(r.summary.Carulla.skipped, { outlier: 1 });
  sink = fakeSink();
  r = await apply(outlier, sink, { allowPriceOutlier: true });
  assert.equal(r.written, true);
  assert.deepEqual(r.summary, { Carulla: { saved: 1, skipped: {} } });
});

test("a product with a previous official price is checked by the jump guard, not the reference", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 }, last: { 7: 6000 } });
  const r = await apply(plan([file({}, [entry({ regularPriceCop: 7600 })])]), sink);
  assert.deepEqual(r.summary, { Carulla: { saved: 1, skipped: {} } });
});

test("a price already in the database for that day is skipped before the jump guard (re-importing old files)", async () => {
  const sink = fakeSink({ known: { "Carulla:77001": 7 }, last: { 7: 1500 }, existing: { [`7:${TODAY}`]: 3900 } });
  const r = await apply(plan([file()]), sink);
  assert.deepEqual(r.summary, { Carulla: { saved: 0, skipped: { already_imported: 1 } } });
  assert.equal(r.written, true);
  assert.ok(!sink.calls.some((c) => c[0] === "upsertPrices"));
});

test("writing retires the store product that lost its food; a dry run does not", async () => {
  const p = plan([file({}, [entry({ foodId: "arroz_blanco", externalId: "445118", regularPriceCop: 2600 })])]);
  const known = { "Carulla:445117": 3, "Carulla:445118": 4 };
  let sink = fakeSink({ known, last: { 4: 2500 } });
  await apply(p, sink);
  assert.deepEqual(sink.calls.find((c) => c[0] === "deactivateProducts")?.[1], [3]);
  sink = fakeSink({ known, last: { 4: 2500 } });
  await apply(p, sink, { write: false });
  assert.deepEqual(sink.writes(), []);
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
    packConfirmed: true,
    packReviewed: false,
    attested: true,
    today: TODAY,
    foods,
    site,
  });
  assert.equal(saved.ok, true);
  const exported = JSON.parse(JSON.stringify(buildExport(saved.state, TODAY).data));
  assert.deepEqual(plan([exported]).errors, []);
});
