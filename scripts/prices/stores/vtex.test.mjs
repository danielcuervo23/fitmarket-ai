import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadReaders } from "../readers/index.ts";
import { extractFastStoreProduct, extractVtexIoProduct, parseVtexProduct } from "./vtex.ts";
import * as carulla from "./carulla.ts";
import * as exito from "./exito.ts";
import * as jumbo from "./jumbo.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(path.join(here, "fixtures", `${name}.json`), "utf8"));
const fastHtml = (data) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
const ioHtml = (state) =>
  `<html><template data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template></html>`;
const fast = (name, packSize, sku) => parseVtexProduct(extractFastStoreProduct(fastHtml(fx(name))), sku, packSize);
const io = (name, packSize, sku) => parseVtexProduct(extractVtexIoProduct(ioHtml(fx(name))), sku, packSize);

test("fast-store page on promotion: regular is the list price, promo is the selling price", () => {
  assert.deepEqual(fast("vtex-faststore-papa-2500g-promo", 2500, "1572"), {
    ok: true,
    regularPriceCop: 20960,
    promoPriceCop: 14672,
  });
});

test("fast-store page without promotion has promoPriceCop null", () => {
  assert.deepEqual(fast("vtex-faststore-arroz-500g", 500, "445117"), { ok: true, regularPriceCop: 2500, promoPriceCop: null });
});

test("a per-kg item is priced for a 1000 g pack and rejected for any other pack", () => {
  assert.deepEqual(fast("vtex-faststore-papa-granel-kg-promo", 1000, "1544"), {
    ok: true,
    regularPriceCop: 7600,
    promoPriceCop: 5320,
  });
  assert.deepEqual(fast("vtex-faststore-papa-granel-kg-promo", 1, "1544"), { ok: false, reason: "pack_mismatch" });
});

test("a pack size that differs from the page content is a pack_mismatch", () => {
  assert.deepEqual(fast("vtex-faststore-arroz-500g", 1000, "445117"), { ok: false, reason: "pack_mismatch" });
});

test("a page for another sku than the mapped one is a parse_error", () => {
  assert.deepEqual(fast("vtex-faststore-arroz-500g", 500, "999"), { ok: false, reason: "parse_error" });
});

test("no stock means unavailable_in_city", () => {
  const data = fx("vtex-faststore-arroz-500g");
  const p = data.props.pageProps.data.product;
  p.sellers[0].commertialOffer.AvailableQuantity = 0;
  p.offers.offers[0].availability = "https://schema.org/OutOfStock";
  const r = parseVtexProduct(extractFastStoreProduct(fastHtml(data)), "445117", 500);
  assert.deepEqual(r, { ok: false, reason: "unavailable_in_city" });
});

test("empty answer is not_found and a foreign shape is parse_error", () => {
  assert.deepEqual(parseVtexProduct([], "1", 500), { ok: false, reason: "not_found" });
  assert.deepEqual(parseVtexProduct({ foo: 1 }, "1", 500), { ok: false, reason: "parse_error" });
  assert.deepEqual(parseVtexProduct(null, "1", 500), { ok: false, reason: "parse_error" });
});

test("only a selling price (no list price) is skipped, never stored as regular", () => {
  const data = fx("vtex-faststore-arroz-500g");
  const o = data.props.pageProps.data.product;
  delete o.sellers[0].commertialOffer.ListPrice;
  delete o.offers.offers[0].listPrice;
  assert.deepEqual(parseVtexProduct(extractFastStoreProduct(fastHtml(data)), "445117", 500), {
    ok: false,
    reason: "parse_error",
  });
});

test("html without product data (block page, changed layout) gives null from the extractors", () => {
  assert.equal(extractFastStoreProduct("<html></html>"), null);
  assert.equal(extractFastStoreProduct('<script id="__NEXT_DATA__">{not json</script>'), null);
  assert.equal(extractVtexIoProduct("<html>verify you are human</html>"), null);
});

test("vtex-io page: size comes from the product name and the sku is matched without leading zeros", () => {
  assert.deepEqual(io("vtex-io-arroz-sopa-500g", 500, "00013391"), { ok: true, regularPriceCop: 2100, promoPriceCop: null });
  assert.deepEqual(io("vtex-io-arroz-sopa-500g", 250, "13391"), { ok: false, reason: "pack_mismatch" });
});

test("vtex-io per-kg item is priced for 1000 g; a half-kg multiplier is not trusted", () => {
  assert.deepEqual(io("vtex-io-papa-granel-kg", 1000, "52169"), { ok: true, regularPriceCop: 3980, promoPriceCop: null });
  assert.deepEqual(io("vtex-io-papa-granel-half-kg", 500, "24486"), { ok: false, reason: "pack_mismatch" });
});

test("a multipack name (x25und x500g c/u) is ambiguous and rejected", () => {
  const state = fx("vtex-io-arroz-sopa-500g");
  const key = Object.keys(state).find((k) => k.endsWith(".items.0"));
  state[key].name = "Arroz Diana blanco x25und x500g c/u";
  assert.deepEqual(parseVtexProduct(extractVtexIoProduct(ioHtml(state)), "13391", 500), {
    ok: false,
    reason: "pack_mismatch",
  });
});

test("fixtures keep only price and size fields (no images, descriptions or logos)", () => {
  const files = readdirSync(path.join(here, "fixtures")).filter((n) => n.startsWith("vtex-"));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const text = readFileSync(path.join(here, "fixtures", f), "utf8");
    assert.doesNotMatch(text, /image|description|logo|vtexassets|cookie/i, f);
  }
});

const PRODUCT = (url, extra = {}) => ({
  storeId: "Carulla",
  foodId: "arroz",
  externalId: "445117",
  name: "Arroz",
  packSize: 500,
  url,
  ...extra,
});
const CARULLA_URL = "https://www.carulla.com/arroz-diana-500-gr-479512/p";

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

test("carulla reader requests the product page with the store selector headers and parses it", async () => {
  const r = recorder({ status: 200, body: fastHtml(fx("vtex-faststore-arroz-500g")) });
  const res = await carulla.reader.read(PRODUCT(CARULLA_URL), r.ctx);
  assert.deepEqual(res, { ok: true, regularPriceCop: 2500, promoPriceCop: null });
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].url, CARULLA_URL);
  assert.deepEqual(r.calls[0].init?.headers ?? {}, carulla.BUCARAMANGA_SELECTOR.headers);
  assert.equal(carulla.reader.storeId, "Carulla");
  assert.equal(carulla.reader.cityVerified, carulla.BUCARAMANGA_SELECTOR.verified);
});

test("exito and jumbo readers expose their store id and an explicit unverified Bucaramanga status", async () => {
  assert.equal(exito.reader.storeId, "Exito");
  assert.equal(jumbo.reader.storeId, "Jumbo");
  for (const m of [exito, carulla, jumbo]) {
    assert.equal(m.BUCARAMANGA_SELECTOR.verified, false);
    assert.equal(m.reader.cityVerified, false);
  }
  const r = recorder({ status: 200, body: ioHtml(fx("vtex-io-arroz-sopa-500g")) });
  const res = await jumbo.reader.read(
    PRODUCT("https://www.jumbocolombia.com/arroz-para-sopa-cerearroz-x-500-g/p", { storeId: "Jumbo", externalId: "13391" }),
    r.ctx,
  );
  assert.deepEqual(res, { ok: true, regularPriceCop: 2100, promoPriceCop: null });
  const e = recorder({ status: 200, body: fastHtml(fx("vtex-faststore-arroz-500g")) });
  const eres = await exito.reader.read(
    PRODUCT("https://www.exito.com/arroz-diana-500-gr-479512/p", { storeId: "Exito" }),
    e.ctx,
  );
  assert.deepEqual(eres, { ok: true, regularPriceCop: 2500, promoPriceCop: null });
});

test("reader maps http statuses: 404 not_found, 403/429 blocked, other failures parse_error", async () => {
  const cases = [
    [404, "not_found"],
    [403, "blocked"],
    [429, "blocked"],
    [500, "parse_error"],
    [599, "parse_error"],
  ];
  for (const [status, reason] of cases) {
    const r = recorder({ status, body: "" });
    assert.deepEqual(await carulla.reader.read(PRODUCT(CARULLA_URL), r.ctx), { ok: false, reason }, String(status));
  }
  const html = recorder({ status: 200, body: "<html>nothing</html>" });
  assert.deepEqual(await carulla.reader.read(PRODUCT(CARULLA_URL), html.ctx), { ok: false, reason: "parse_error" });
});

test("loadReaders discovers the three VTEX readers", async () => {
  const readers = await loadReaders(here);
  const ids = readers.map((r) => r.storeId);
  for (const id of ["Carulla", "Exito", "Jumbo"]) assert.ok(ids.includes(id), id);
});
