import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as jumbo from "./jumbo.ts";

// Fixtures are real Jumbo product pages (2026-11-04) reduced to the few
// __STATE__ fields the parser reads. Name variants are tested by editing them.

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(path.join(here, "fixtures", `${name}.json`), "utf8"));
const ioHtml = (state) =>
  `<html><template data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template></html>`;
const key = (state, suffix) => Object.keys(state).find((k) => k.endsWith(suffix));
const parse = (name, packSize, sku, edit) => {
  const state = fx(name);
  if (edit) edit(state);
  return jumbo.parseJumboProduct(ioHtml(state), sku, packSize);
};
const rename = (name) => (s) => (s[key(s, ".items.0")].name = name);

test("a bare 'unidad' in the name means one unit (aguacate hass unidad)", () => {
  assert.deepEqual(parse("jumbo-aguacate-hass-unidad", 1, "60675"), { ok: true, regularPriceCop: 1780, promoPriceCop: null });
  assert.deepEqual(parse("jumbo-aguacate-hass-unidad", 6, "60675"), { ok: false, reason: "pack_mismatch" });
});

test("'x 6 un' is six units", () => {
  assert.deepEqual(parse("jumbo-manzana-x6-un", 6, "24906"), { ok: true, regularPriceCop: 16390, promoPriceCop: null });
  assert.deepEqual(parse("jumbo-manzana-x6-un", 1, "24906"), { ok: false, reason: "pack_mismatch" });
});

test("'2 Unidades' is not mistaken for one unit", () => {
  const r = parse("jumbo-aguacate-hass-unidad", 1, "60675", rename("Aguacate hass x 2 unidades"));
  assert.deepEqual(r, { ok: false, reason: "pack_mismatch" });
  assert.deepEqual(parse("jumbo-aguacate-hass-unidad", 2, "60675", rename("Aguacate hass x 2 unidades")).ok, true);
});

test("Jumbo spellings 'grs' and 'kgr' are read as grams and kilograms", () => {
  assert.deepEqual(parse("jumbo-manzana-x6-un", 350, "24906", rename("Quinua blanca semilla x350grs")).ok, true);
  assert.deepEqual(parse("jumbo-manzana-x6-un", 2000, "24906", rename("Papaya melona x 2kgr")).ok, true);
  assert.deepEqual(parse("jumbo-manzana-x6-un", 500, "24906", rename("Papaya melona x 2kgr")), {
    ok: false,
    reason: "pack_mismatch",
  });
});

test("a weight item sold in 0.5 kg steps is never priced (price basis per kg vs per pack is not certain)", () => {
  assert.deepEqual(parse("jumbo-sobrebarriga-500gr-half-kg-promo", 500, "25302"), { ok: false, reason: "pack_mismatch" });
  assert.deepEqual(parse("jumbo-sobrebarriga-500gr-half-kg-promo", 1000, "25302"), { ok: false, reason: "pack_mismatch" });
});

test("a page without __STATE__ or for another sku is a parse_error", () => {
  assert.deepEqual(jumbo.parseJumboProduct("<html>nothing</html>", "60675", 1), { ok: false, reason: "parse_error" });
  assert.deepEqual(parse("jumbo-aguacate-hass-unidad", 1, "999"), { ok: false, reason: "parse_error" });
});

function recorder(response) {
  const calls = [];
  return {
    calls,
    ctx: {
      city: "bucaramanga",
      fetchText: async (url, init) => {
        calls.push({ url, init });
        return response;
      },
    },
  };
}

const PRODUCT = (url) => ({
  storeId: "Jumbo",
  foodId: "aguacate",
  externalId: "60675",
  name: "Aguacate hass unidad",
  packSize: 1,
  url,
});

test("the reader prices a Jumbo product page with the selector headers", async () => {
  const r = recorder({ status: 200, body: ioHtml(fx("jumbo-aguacate-hass-unidad")) });
  const res = await jumbo.reader.read(PRODUCT("https://www.jumbocolombia.com/aguacate-hass-unidad/p"), r.ctx);
  assert.deepEqual(res, { ok: true, regularPriceCop: 1780, promoPriceCop: null });
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.calls[0].init?.headers ?? {}, jumbo.BUCARAMANGA_SELECTOR.headers);
  assert.equal(jumbo.reader.storeId, "Jumbo");
  assert.equal(jumbo.reader.cityVerified, jumbo.BUCARAMANGA_SELECTOR.verified);
});

test("the reader never requests anything that is not a plain Jumbo product page", async () => {
  for (const url of [
    "https://www.jumbocolombia.com/aguacate-hass-unidad/p?sc=6",
    "https://www.jumbocolombia.com/api/catalog_system/pub/products/search/x/p",
    "https://www.jumbocolombia.com/busca/p",
    "https://www.exito.com/aguacate-hass-unidad/p",
    "http://www.jumbocolombia.com/aguacate-hass-unidad/p",
  ]) {
    const r = recorder({ status: 200, body: ioHtml(fx("jumbo-aguacate-hass-unidad")) });
    assert.deepEqual(await jumbo.reader.read(PRODUCT(url), r.ctx), { ok: false, reason: "blocked" }, url);
    assert.equal(r.calls.length, 0, url);
  }
});

test("reader maps http statuses: 404 not_found, 403/429 blocked, others parse_error", async () => {
  for (const [status, reason] of [
    [404, "not_found"],
    [403, "blocked"],
    [429, "blocked"],
    [500, "parse_error"],
  ]) {
    const r = recorder({ status, body: "" });
    const res = await jumbo.reader.read(PRODUCT("https://www.jumbocolombia.com/aguacate-hass-unidad/p"), r.ctx);
    assert.deepEqual(res, { ok: false, reason }, String(status));
  }
});

test("Bucaramanga stays unverified: product pages only expose the national default channel", () => {
  assert.equal(jumbo.BUCARAMANGA_SELECTOR.verified, false);
  assert.deepEqual(jumbo.BUCARAMANGA_SELECTOR.headers, {});
});

test("a dot thousands separator before g/ml is read as thousands ('1.000 g' is 1000 g)", () => {
  const named = (name, pack) => parse("vtex-io-arroz-sopa-500g", pack, "13391", rename(name));
  assert.equal(named("Arroz Roa x 1.000 g", 1000).ok, true);
  assert.deepEqual(named("Arroz Roa x 1.000 g", 1), { ok: false, reason: "pack_mismatch" });
  assert.equal(named("Leche Alqueria 1.100 ml", 1100).ok, true);
  assert.equal(named("Papa 2.5 kg", 2500).ok, true);
});
