import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractFastStoreProduct, extractVtexIoProduct, packContent, regularAndPromo, vtexIoProductSlug } from "./vtex.ts";

// Small exports used by the manual price tool (scripts/prices/manual). They must
// give the same answers the weekly reader uses internally.

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(path.join(here, "fixtures", `${name}.json`), "utf8"));
const fastHtml = (data) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
const ioHtml = (state) =>
  `<html><template data-type="json" data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template></html>`;

test("packContent reads the declared content of a FastStore pack", () => {
  assert.equal(packContent(extractFastStoreProduct(fastHtml(fx("vtex-faststore-arroz-500g")))), 500);
});

test("packContent gives 1000 for an item sold per kg", () => {
  assert.equal(packContent(extractFastStoreProduct(fastHtml(fx("vtex-faststore-papa-granel-kg-promo")))), 1000);
});

test("packContent is null when the name names several sizes", () => {
  const raw = { ...extractVtexIoProduct(ioHtml(fx("vtex-io-arroz-sopa-500g"))), name: "Arroz 500 g x 2 und" };
  assert.equal(packContent(raw), null);
});

test("regularAndPromo keeps the list price as regular and the lower price as promo", () => {
  assert.deepEqual(regularAndPromo(14672, 20960), { regularPriceCop: 20960, promoPriceCop: 14672 });
  assert.deepEqual(regularAndPromo(2500, 2500), { regularPriceCop: 2500, promoPriceCop: null });
});

test("regularAndPromo never takes the lower value when the list price is below the price", () => {
  assert.deepEqual(regularAndPromo(3000, 2000), { regularPriceCop: 3000, promoPriceCop: null });
});

test("vtexIoProductSlug names the product the extractor reads", () => {
  assert.equal(vtexIoProductSlug(ioHtml(fx("vtex-io-arroz-sopa-500g"))), "arroz-para-sopa-cerearroz-x-500-g");
  assert.equal(vtexIoProductSlug("<html></html>"), null);
});
