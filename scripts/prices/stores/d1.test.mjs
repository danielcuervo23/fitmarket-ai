import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadMappings } from "../mappings.ts";
import { policySchema } from "../policy.ts";
import { loadReaders } from "../readers/index.ts";
import * as d1 from "./d1.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const fx = (name) => JSON.parse(readFileSync(path.join(here, "fixtures", `${name}.json`), "utf8"));
const ioHtml = (state) =>
  `<html><template data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template></html>`;
const offerKey = (state) => Object.keys(state).find((k) => k.endsWith(".commertialOffer"));
const itemKey = (state) => Object.keys(state).find((k) => k.endsWith(".items.0"));
const parse = (name, packSize, sku, edit) => {
  const state = fx(name);
  if (edit) edit(state);
  return d1.parseD1Product(ioHtml(state), sku, packSize);
};

test("single everyday price is the regular price (arroz and lentejas 500 g)", () => {
  assert.deepEqual(parse("d1-arroz-albar-500g", 500, "1379"), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
  assert.deepEqual(parse("d1-lenteja-500g", 500, "1381"), { ok: true, regularPriceCop: 1590, promoPriceCop: null });
});

test("a 'Grs' size in the name is understood and a different pack size is a pack_mismatch", () => {
  assert.deepEqual(parse("d1-arroz-albar-500g", 1000, "1379"), { ok: false, reason: "pack_mismatch" });
});

test("'Unidad' means one unit", () => {
  assert.deepEqual(parse("d1-pimenton-unidad", 1, "157"), { ok: true, regularPriceCop: 1600, promoPriceCop: null });
  assert.deepEqual(parse("d1-pimenton-unidad", 12, "157"), { ok: false, reason: "pack_mismatch" });
});

test("two prices: list 5990 is regular, selling 4990 is the promo", () => {
  const r = parse("d1-arroz-albar-500g", 500, "1379", (s) => {
    s[offerKey(s)].ListPrice = 5990;
    s[offerKey(s)].Price = 4990;
  });
  assert.deepEqual(r, { ok: true, regularPriceCop: 5990, promoPriceCop: 4990 });
});

test("no stock is unavailable_in_city", () => {
  const r = parse("d1-arroz-albar-500g", 500, "1379", (s) => (s[offerKey(s)].AvailableQuantity = 0));
  assert.deepEqual(r, { ok: false, reason: "unavailable_in_city" });
});

test("a page for another sku is a parse_error", () => {
  assert.deepEqual(parse("d1-arroz-albar-500g", 500, "999"), { ok: false, reason: "parse_error" });
});

test("a price that is text (not a number) is never trusted", () => {
  const r = parse("d1-arroz-albar-500g", 500, "1379", (s) => (s[offerKey(s)].Price = "$ 12.990"));
  assert.deepEqual(r, { ok: false, reason: "parse_error" });
});

test("a multipack name is ambiguous and rejected", () => {
  const r = parse("d1-arroz-albar-500g", 500, "1379", (s) => (s[itemKey(s)].name = "Arroz Albar x12 und 500 Grs c/u"));
  assert.deepEqual(r, { ok: false, reason: "pack_mismatch" });
});

test("changed markup, block pages and empty bodies are parse_error", () => {
  for (const body of ["<html></html>", "<html>verify you are human</html>", "", '<template data-varname="__STATE__"><script>{bad</script>']) {
    assert.deepEqual(d1.parseD1Product(body, "1379", 500), { ok: false, reason: "parse_error" });
  }
  assert.deepEqual(d1.parseD1Product(ioHtml({ foo: 1 }), "1379", 500), { ok: false, reason: "parse_error" });
});

test("fixtures keep only price and size fields (no images, descriptions or logos)", () => {
  const files = readdirSync(path.join(here, "fixtures")).filter((n) => n.startsWith("d1-"));
  assert.ok(files.length >= 3);
  for (const f of files) {
    assert.doesNotMatch(readFileSync(path.join(here, "fixtures", f), "utf8"), /image|description|logo|vtexassets|cookie|priceToken/i, f);
  }
});

const PRODUCT = (url, extra = {}) => ({
  storeId: "D1",
  foodId: "arroz_blanco",
  externalId: "1379",
  name: "Arroz Albar 500 g",
  packSize: 500,
  url,
  ...extra,
});
const URL_OK = "https://www.d1.com.co/arroz-estandar-albar-500grs-12000051/p";

function recorder(response) {
  const calls = [];
  return {
    calls,
    ctx: {
      city: "Bucaramanga",
      fetchText: async (url, init) => {
        calls.push({ url, init });
        return response;
      },
    },
  };
}

test("reader requests the product page with the selector headers and parses it", async () => {
  const r = recorder({ status: 200, body: ioHtml(fx("d1-arroz-albar-500g")) });
  assert.deepEqual(await d1.reader.read(PRODUCT(URL_OK), r.ctx), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].url, URL_OK);
  assert.deepEqual(r.calls[0].init?.headers ?? {}, d1.BUCARAMANGA_SELECTOR.headers);
  assert.equal(d1.reader.storeId, "D1");
  assert.equal(d1.BUCARAMANGA_SELECTOR.verified, false);
  assert.equal(d1.reader.cityVerified, false);
});

test("reader never requests a URL that is not a D1 product page (defence in depth)", async () => {
  const bad = [
    "https://www.d1.com.co/busca?q=arroz",
    "https://www.d1.com.co/api/catalog_system/pub/products/search?fq=1",
    "https://www.d1.com.co/arroz-estandar-albar-500grs-12000051/p?map=ft",
    "https://www.d1.com.co/despensa",
    "https://domicilios.tiendasd1.com/p/arroz-diana-500-g-12002073",
    "http://www.d1.com.co/arroz-estandar-albar-500grs-12000051/p",
    "https://evil.example/arroz/p",
    "not a url",
  ];
  for (const url of bad) {
    const r = recorder({ status: 200, body: ioHtml(fx("d1-arroz-albar-500g")) });
    const res = await d1.reader.read(PRODUCT(url), r.ctx);
    assert.deepEqual(res, { ok: false, reason: "blocked" }, url);
    assert.equal(r.calls.length, 0, url);
  }
});

test("reader maps http statuses: 404 not_found, 403/429 blocked, other failures parse_error", async () => {
  for (const [status, reason] of [[404, "not_found"], [403, "blocked"], [429, "blocked"], [500, "parse_error"], [599, "parse_error"]]) {
    const r = recorder({ status, body: "" });
    assert.deepEqual(await d1.reader.read(PRODUCT(URL_OK), r.ctx), { ok: false, reason }, String(status));
  }
});

test("loadReaders discovers D1 and the D1 mapping file is valid", async () => {
  assert.ok((await loadReaders(here)).some((r) => r.storeId === "D1"));
  const policy = policySchema.parse(JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8")));
  const foods = JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8"));
  const ids = new Set(foods.map((f) => f.id));
  const hosts = {};
  const patterns = {};
  for (const [id, s] of Object.entries(policy.stores)) {
    hosts[id] = new URL(s.robotsUrl).hostname;
    patterns[id] = s.productPathPattern;
  }
  const out = loadMappings(path.join(root, "data/store-products"), ids, hosts, patterns);
  assert.ok((out.D1 ?? []).length >= 1);
});

test("a counted 'Unidades' name is never priced as one unit", () => {
  for (const name of ["Pimentón 2 Unidades", "Pimentón x6 Unidades", "Pimentón 3 Unidad", "Pimentón X 4 Unidades"]) {
    const r = parse("d1-pimenton-unidad", 1, "157", (s) => (s[itemKey(s)].name = name));
    assert.deepEqual(r, { ok: false, reason: "pack_mismatch" }, name);
  }
  assert.deepEqual(parse("d1-pimenton-unidad", 1, "157"), { ok: true, regularPriceCop: 1600, promoPriceCop: null });
});

test("d1.ts guards use the same host, path pattern and blocked rules as policy.json", () => {
  const policy = policySchema.parse(JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8")));
  const store = policy.stores.D1;
  assert.equal(d1.HOST, new URL(store.robotsUrl).hostname);
  assert.equal(d1.PRODUCT_PATH_PATTERN, store.productPathPattern);
  const isRule = (r) => r.startsWith("/") && !/\s/.test(r);
  const expected = [...policy.precautions.neverRequest, ...store.disallowedPaths].filter(isRule);
  assert.deepEqual([...new Set(d1.BLOCKED_RULES)].sort(), [...new Set(expected)].sort());
});

test("a dot thousands separator before g/ml is read as thousands ('1.000 G' is 1000 g)", () => {
  const named = (name, pack) => parse("d1-arroz-albar-500g", pack, "1379", (s) => (s[itemKey(s)].name = name));
  assert.deepEqual(named("Arroz Integral Diana 1.000 G", 1000), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
  assert.deepEqual(named("Arroz Integral Diana 1.000 G", 1), { ok: false, reason: "pack_mismatch" });
  assert.deepEqual(named("Aceite 3.000 Ml", 3000), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
  // A decimal kilo/litre amount keeps its decimal meaning.
  assert.deepEqual(named("Arroz 2.5 Kg", 2500), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
});

test("'X 3 Unidades - 100 G' is a net weight of 100 g, never 3 units", () => {
  const named = (name, pack) => parse("d1-arroz-albar-500g", pack, "1379", (s) => (s[itemKey(s)].name = name));
  assert.deepEqual(named("Ajo Malla X 3 Unidades - 100 G", 100), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
  assert.deepEqual(named("Ajo Malla X 3 Unidades - 100 G", 3), { ok: false, reason: "pack_mismatch" });
  assert.deepEqual(named("Ajo Malla X 3 Unidades - 100 G", 1), { ok: false, reason: "pack_mismatch" });
  // Without the dash the count and the weight stay ambiguous.
  assert.deepEqual(named("Ajo Malla 3 Unidades 100 G", 100), { ok: false, reason: "pack_mismatch" });
});

test("'Unidad 100 G' is one bunch of 100 g net, never one unit", () => {
  const named = (name, pack) => parse("d1-arroz-albar-500g", pack, "1379", (s) => (s[itemKey(s)].name = name));
  assert.deepEqual(named("Cilantro Unidad 100 G", 100), { ok: true, regularPriceCop: 1650, promoPriceCop: null });
  assert.deepEqual(named("Cilantro Unidad 100 G", 1), { ok: false, reason: "pack_mismatch" });
});

test("real D1 pages with dot thousands and net weights are priced (trimmed fixtures)", () => {
  assert.deepEqual(parse("d1-arroz-integral-1000g", 1000, "1286"), { ok: true, regularPriceCop: 4500, promoPriceCop: null });
  assert.deepEqual(parse("d1-ajo-malla-100g", 100, "657"), { ok: true, regularPriceCop: 1100, promoPriceCop: null });
  assert.deepEqual(parse("d1-cilantro-unidad-100g", 100, "1443"), { ok: true, regularPriceCop: 2350, promoPriceCop: null });
});

test("the D1 mapping file has one entry per food and covers most of the catalog", () => {
  const entries = JSON.parse(readFileSync(path.join(root, "data/store-products/D1.json"), "utf8"));
  const foodIds = entries.map((e) => e.foodId);
  assert.equal(new Set(foodIds).size, foodIds.length);
  assert.ok(entries.length >= 50, `only ${entries.length} D1 mappings`);
});

test("a counted multipack with a per-item weight ('Yogurt X 6 Unidades - 200 G') is never a 200 g pack", () => {
  const named = (name, pack) => parse("d1-arroz-albar-500g", pack, "1379", (s) => (s[itemKey(s)].name = name));
  for (const pack of [200, 1200, 6, 1]) {
    assert.deepEqual(named("Yogurt X 6 Unidades - 200 G", pack), { ok: false, reason: "pack_mismatch" }, String(pack));
  }
  // A mesh or a bunch keeps its net weight.
  assert.equal(named("Ajo Malla X 3 Unidades - 100 G", 100).ok, true);
  assert.equal(named("Cebolla Atado 4 Unidades - 500 G", 500).ok, true);
});
