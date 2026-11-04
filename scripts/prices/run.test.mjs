import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadReaders } from "./readers/index.ts";
import { runWeekly } from "./run.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(readFileSync(path.join(here, "policy.json"), "utf8"));
const TODAY = "2026-11-09";

const HOSTS = {
  Exito: "www.exito.com",
  Carulla: "www.carulla.com",
  D1: "domicilios.tiendasd1.com",
  Jumbo: "www.jumbocolombia.com",
  Ara: "aratiendas.com",
};

function product(storeId, n) {
  return {
    storeId,
    foodId: "arroz",
    externalId: String(n),
    name: "Producto " + n,
    packSize: 500,
    url: "https://" + HOSTS[storeId] + "/producto-" + n + "/p",
  };
}

function fakeSink({ last = new Map() } = {}) {
  const calls = { upsertProducts: 0, findProductIds: 0, upsertPrices: [] };
  const idsFor = (products) =>
    new Map(products.map((p, i) => [p.storeId + ":" + p.externalId, 100 + Number(p.externalId)]));
  return {
    calls,
    async upsertProducts(products) {
      calls.upsertProducts++;
      return idsFor(products);
    },
    async findProductIds(products) {
      calls.findProductIds++;
      return idsFor(products);
    },
    async lastPrices(ids, city) {
      calls.lastPricesCity = city;
      return last;
    },
    async upsertPrices(rows) {
      calls.upsertPrices.push(rows);
    },
  };
}

function fakeFetch(statusByUrl = {}) {
  const urls = [];
  const fn = async (url) => {
    urls.push(String(url));
    if (String(url).endsWith("/robots.txt")) return new Response("", { status: 200 });
    return new Response("<html/>", { status: statusByUrl[String(url)] ?? 200 });
  };
  fn.urls = urls;
  return fn;
}

const noSleep = async () => {};

function base(overrides = {}) {
  return {
    policy,
    readers: [],
    mappings: {},
    sink: fakeSink(),
    fetch: fakeFetch(),
    today: TODAY,
    city: "bucaramanga",
    sleep: noSleep,
    ...overrides,
  };
}

const okReader = (storeId, result) => ({ storeId, read: async () => result });

test("a store with allowed: false is never read, even with a reader and mappings", async () => {
  let called = 0;
  const fetch = fakeFetch();
  const sink = fakeSink();
  const summary = await runWeekly(
    base({
      readers: [{ storeId: "Ara", read: async () => (called++, { ok: true, regularPriceCop: 5000, promoPriceCop: null }) }],
      mappings: { Ara: [product("Ara", 1)] },
      sink,
      fetch,
    }),
  );
  assert.equal(called, 0);
  assert.equal(fetch.urls.length, 0);
  assert.equal(sink.calls.upsertProducts, 0);
  assert.deepEqual(summary.failedStores, []);
  assert.equal(summary.perStore.Ara.saved, 0);
  assert.equal(summary.perStore.Ara.skipped.store_not_allowed, 1);
});

test("a promo result saves only the regular price, with today's date and the city", async () => {
  const sink = fakeSink();
  const summary = await runWeekly(
    base({
      readers: [okReader("Exito", { ok: true, regularPriceCop: 5000, promoPriceCop: 3900 })],
      mappings: { Exito: [product("Exito", 1)] },
      sink,
    }),
  );
  assert.deepEqual(sink.calls.upsertPrices, [
    [{ storeProductId: 101, city: "bucaramanga", regularPriceCop: 5000, observedOn: TODAY }],
  ]);
  assert.equal(sink.calls.lastPricesCity, "bucaramanga");
  assert.equal(summary.perStore.Exito.read, 1);
  assert.equal(summary.perStore.Exito.saved, 1);
  assert.ok(!JSON.stringify(sink.calls.upsertPrices).includes("3900"));
});

test("not_found, pack_mismatch and parse failures save nothing and are counted by reason", async () => {
  const results = [
    { ok: false, reason: "not_found" },
    { ok: false, reason: "pack_mismatch" },
    { ok: true, regularPriceCop: 5000, promoPriceCop: null },
  ];
  let i = 0;
  const sink = fakeSink();
  const summary = await runWeekly(
    base({
      readers: [{ storeId: "Exito", read: async () => results[i++] }],
      mappings: { Exito: [1, 2, 3].map((n) => product("Exito", n)) },
      sink,
    }),
  );
  assert.equal(summary.perStore.Exito.skipped.not_found, 1);
  assert.equal(summary.perStore.Exito.skipped.pack_mismatch, 1);
  assert.equal(sink.calls.upsertPrices[0].length, 1);
});

test("a jump against the last known price is skipped with reason jump", async () => {
  const sink = fakeSink({ last: new Map([[101, 4000]]) });
  const summary = await runWeekly(
    base({
      readers: [okReader("Exito", { ok: true, regularPriceCop: 9000, promoPriceCop: null })],
      mappings: { Exito: [product("Exito", 1)] },
      sink,
    }),
  );
  assert.equal(summary.perStore.Exito.skipped.jump, 1);
  assert.equal(summary.perStore.Exito.saved, 0);
  assert.equal(sink.calls.upsertPrices.length, 0);
});

test("out of range and non integer prices are skipped with reason out_of_range", async () => {
  for (const price of [49, 3.5, 5_000_001]) {
    const summary = await runWeekly(
      base({
        readers: [okReader("Exito", { ok: true, regularPriceCop: price, promoPriceCop: null })],
        mappings: { Exito: [product("Exito", 1)] },
      }),
    );
    assert.equal(summary.perStore.Exito.skipped.out_of_range, 1, String(price));
  }
});

test("dryRun writes nothing but still reads and checks", async () => {
  const sink = fakeSink({ last: new Map([[101, 4000]]) });
  const summary = await runWeekly(
    base({
      readers: [okReader("Exito", { ok: true, regularPriceCop: 9000, promoPriceCop: null })],
      mappings: { Exito: [product("Exito", 1)] },
      sink,
      dryRun: true,
    }),
  );
  assert.equal(sink.calls.upsertPrices.length, 0);
  assert.equal(sink.calls.upsertProducts, 0);
  assert.equal(sink.calls.findProductIds, 1);
  assert.equal(summary.perStore.Exito.skipped.jump, 1);
});

test("a store where fewer than half of the products were saved is a failed store", async () => {
  let i = 0;
  const results = [
    { ok: true, regularPriceCop: 5000, promoPriceCop: null },
    { ok: false, reason: "parse_error" },
    { ok: false, reason: "parse_error" },
  ];
  const summary = await runWeekly(
    base({
      readers: [{ storeId: "Exito", read: async () => results[i++] }],
      mappings: { Exito: [1, 2, 3].map((n) => product("Exito", n)) },
    }),
  );
  assert.deepEqual(summary.failedStores, ["Exito"]);
});

test("exactly half saved is not a failure", async () => {
  let i = 0;
  const results = [
    { ok: true, regularPriceCop: 5000, promoPriceCop: null },
    { ok: false, reason: "not_found" },
  ];
  const summary = await runWeekly(
    base({
      readers: [{ storeId: "Exito", read: async () => results[i++] }],
      mappings: { Exito: [1, 2].map((n) => product("Exito", n)) },
    }),
  );
  assert.deepEqual(summary.failedStores, []);
});

test("an allowed store without a reader is skipped quietly", async () => {
  const fetch = fakeFetch();
  const summary = await runWeekly(base({ mappings: { Jumbo: [product("Jumbo", 1)] }, fetch }));
  assert.equal(summary.perStore.Jumbo.skipped.no_reader, 1);
  assert.deepEqual(summary.failedStores, []);
  assert.equal(fetch.urls.length, 0);
});

test("a reader that throws is counted and does not stop the run", async () => {
  let i = 0;
  const summary = await runWeekly(
    base({
      readers: [
        {
          storeId: "Exito",
          read: async () => {
            if (i++ === 0) throw new Error("boom");
            return { ok: true, regularPriceCop: 5000, promoPriceCop: null };
          },
        },
      ],
      mappings: { Exito: [1, 2].map((n) => product("Exito", n)) },
    }),
  );
  assert.equal(summary.perStore.Exito.skipped.reader_error, 1);
  assert.equal(summary.perStore.Exito.saved, 1);
});

test("readers fetch through the policy-enforcing context: a blocked url never hits the network", async () => {
  const fetch = fakeFetch();
  const reader = {
    storeId: "Exito",
    read: async (p, ctx) => {
      const res = await ctx.fetchText("https://www.exito.com/api/catalog_system/pub/products/search");
      return res.status === 403 ? { ok: false, reason: "blocked" } : { ok: false, reason: "parse_error" };
    },
  };
  const summary = await runWeekly(base({ readers: [reader], mappings: { Exito: [product("Exito", 1)] }, fetch }));
  assert.equal(summary.perStore.Exito.skipped.blocked, 1);
  assert.ok(!fetch.urls.some((u) => u.includes("/api/")));
});

test("a 429 stops the store: remaining products are not read and the store fails", async () => {
  const p1 = product("Exito", 1);
  const fetch = fakeFetch({ [p1.url]: 429 });
  let reads = 0;
  const reader = {
    storeId: "Exito",
    read: async (p, ctx) => {
      reads++;
      const res = await ctx.fetchText(p.url);
      return res.status === 200
        ? { ok: true, regularPriceCop: 5000, promoPriceCop: null }
        : { ok: false, reason: "blocked" };
    },
  };
  const summary = await runWeekly(
    base({ readers: [reader], mappings: { Exito: [p1, product("Exito", 2), product("Exito", 3)] }, fetch }),
  );
  assert.equal(reads, 1);
  assert.deepEqual(summary.failedStores, ["Exito"]);
  assert.equal(fetch.urls.filter((u) => u.includes("producto-2")).length, 0);
  assert.equal(summary.perStore.Exito.skipped.store_stopped, 2);
});

test("a sink failure marks the store failed instead of crashing the whole run", async () => {
  const sink = fakeSink();
  sink.upsertPrices = async () => {
    throw new Error("db down");
  };
  const summary = await runWeekly(
    base({
      readers: [okReader("Exito", { ok: true, regularPriceCop: 5000, promoPriceCop: null })],
      mappings: { Exito: [product("Exito", 1)] },
      sink,
    }),
  );
  assert.deepEqual(summary.failedStores, ["Exito"]);
});

test("rejects an invalid policy, date or city before doing anything", async () => {
  await assert.rejects(runWeekly(base({ policy: { stores: {} } })));
  await assert.rejects(runWeekly(base({ today: "09-11-2026" })), /today/);
  await assert.rejects(runWeekly(base({ city: "Bucaramanga; drop" })), /city/);
});

test("loadReaders imports modules that export a valid reader and ignores helpers", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "readers-"));
  writeFileSync(
    path.join(dir, "fake.mjs"),
    'export const reader = { storeId: "Exito", read: async () => ({ ok: false, reason: "not_found" }) };\n',
  );
  writeFileSync(path.join(dir, "helper.mjs"), "export const notAReader = 1;\n");
  writeFileSync(path.join(dir, "fake.test.mjs"), "throw new Error('tests are never imported');\n");
  writeFileSync(path.join(dir, ".gitkeep"), "");
  const readers = await loadReaders(dir);
  assert.equal(readers.length, 1);
  assert.equal(readers[0].storeId, "Exito");
});

test("loadReaders rejects a malformed reader, a duplicate store and a missing folder is empty", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "readers-"));
  writeFileSync(path.join(dir, "bad.mjs"), 'export const reader = { storeId: "Nope", read: async () => ({}) };\n');
  await assert.rejects(loadReaders(dir), /bad\.mjs/);
  const dup = mkdtempSync(path.join(tmpdir(), "readers-"));
  const src = 'export const reader = { storeId: "D1", read: async () => ({}) };\n';
  writeFileSync(path.join(dup, "a.mjs"), src);
  writeFileSync(path.join(dup, "b.mjs"), src);
  await assert.rejects(loadReaders(dup), /duplicate/i);
  assert.deepEqual(await loadReaders(path.join(dup, "missing")), []);
  mkdirSync(path.join(dup, "sub"));
});
