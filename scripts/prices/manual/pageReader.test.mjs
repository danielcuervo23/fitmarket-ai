import assert from "node:assert/strict";
import test from "node:test";
import { storeSitesFromPolicy } from "./format.ts";
import { confirmsPack, readProductPage } from "./pageReader.ts";
import { fastHtml, fixture, ioHtml, policy } from "./testData.mjs";

const sites = storeSitesFromPolicy(policy);
const CARULLA = "https://www.carulla.com/arroz-diana-500-gr-479512/p";
const read = (html, href, extra = {}) => readProductPage({ html, href, documentUrl: href, sites, ...extra });
const fast = (name) => fastHtml(fixture(name));
const io = (name) => ioHtml(fixture(name));

test("a Carulla product page gives the sku, the regular price, the pack and the canonical URL", () => {
  const r = read(fast("vtex-faststore-arroz-500g"), `${CARULLA}?skuId=445117`);
  assert.deepEqual(r, {
    ok: true,
    product: {
      storeId: "Carulla",
      externalId: "445117",
      name: "Arroz DIANA blanco vitamor (500  gr)",
      url: CARULLA,
      regularPriceCop: 2500,
      packSize: 500,
    },
  });
});

test("on promotion the regular (list) price is kept, never the promo", () => {
  const r = read(fast("vtex-faststore-papa-2500g-promo"), "https://www.exito.com/papa-2500/p");
  assert.equal(r.ok, true);
  assert.equal(r.product.storeId, "Exito");
  assert.equal(r.product.regularPriceCop, 20960);
  assert.equal(r.product.packSize, 2500);
});

test("an item sold per kg is a 1000 g pack", () => {
  const r = read(fast("vtex-faststore-papa-granel-kg-promo"), "https://www.exito.com/papa-granel/p");
  assert.equal(r.product.packSize, 1000);
  assert.equal(r.product.regularPriceCop, 7600);
});

test("a Jumbo (VTEX IO) page is read when its product is the page's own product", () => {
  const r = read(io("vtex-io-arroz-sopa-500g"), "https://www.jumbocolombia.com/arroz-para-sopa-cerearroz-x-500-g/p");
  assert.equal(r.ok, true);
  assert.equal(r.product.externalId, "13391");
  assert.equal(r.product.regularPriceCop, 2100);
  assert.equal(r.product.packSize, 500);
});

test("a VTEX IO page whose data is for another product is refused as stale", () => {
  const r = read(io("vtex-io-arroz-sopa-500g"), "https://www.jumbocolombia.com/otro-producto/p");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "stale_page");
  assert.match(r.message, /Recarga/);
});

test("after moving inside the store without reloading, the page data is stale", () => {
  const r = readProductPage({
    html: fast("vtex-faststore-arroz-500g"),
    href: CARULLA,
    documentUrl: "https://www.carulla.com/s?q=arroz",
    sites,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "stale_page");
});

test("D1 names such as '500 Grs' give the pack with D1's own rules", () => {
  const r = read(io("d1-arroz-albar-500g"), "https://www.d1.com.co/arroz-estandar-albar-500grs-12000051/p");
  assert.equal(r.ok, true);
  assert.equal(r.product.packSize, 500);
  assert.equal(r.product.regularPriceCop, 1650);
});

test("a D1 item sold as 'Unidad' is a pack of one unit", () => {
  const r = read(io("d1-pimenton-unidad"), "https://www.d1.com.co/pimenton-unidad-12005183/p");
  assert.equal(r.ok, true);
  assert.equal(r.product.packSize, 1);
});

test("a store that is not allowed or unknown is refused", () => {
  const r = read(fast("vtex-faststore-arroz-500g"), "https://aratiendas.com/arroz/p");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unsupported_store");
});

test("a store page that is not a product page is refused", () => {
  const r = read(fast("vtex-faststore-arroz-500g"), "https://www.carulla.com/mercado/despensa");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_product_page");
});

test("a product URL without readable data is refused", () => {
  const r = read("<html><body>hola</body></html>", CARULLA);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_data");
});

test("an out of stock product is refused", () => {
  const data = fixture("vtex-faststore-arroz-500g");
  data.props.pageProps.data.product.sellers[0].commertialOffer.AvailableQuantity = 0;
  const r = read(fastHtml(data), CARULLA);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unavailable");
});

test("when the page names several sizes the price is kept but the pack is left for the person", () => {
  const data = fixture("vtex-faststore-arroz-500g");
  const p = data.props.pageProps.data.product;
  p.offers.offers[0].itemOffered.properties = [];
  p.name = "Arroz 500 g pague 2 lleve 3 und";
  const r = read(fastHtml(data), CARULLA);
  assert.equal(r.ok, true);
  assert.equal(r.product.packSize, null);
  assert.equal(r.product.regularPriceCop, 2500);
});

test("a price outside 50 - 5,000,000 COP is refused", () => {
  const data = fixture("vtex-faststore-arroz-500g");
  const offer = data.props.pageProps.data.product.sellers[0].commertialOffer;
  offer.Price = 10;
  offer.ListPrice = 10;
  const r = read(fastHtml(data), CARULLA);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_price");
});

test("page text is untrusted: control characters are removed and the name is cut to 200 characters", () => {
  const data = fixture("vtex-faststore-arroz-500g");
  data.props.pageProps.data.product.name = `Arroz\u0000‮<b>${"x".repeat(400)}`;
  const r = read(fastHtml(data), CARULLA);
  assert.equal(r.ok, true);
  assert.equal(r.product.name.length, 200);
  assert.ok(r.product.name.startsWith("Arroz<b>"));
});

test("a sku with odd characters is refused", () => {
  const data = fixture("vtex-faststore-arroz-500g");
  data.props.pageProps.data.product.sku = "44/../5";
  const r = read(fastHtml(data), CARULLA);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_data");
});

test("confirmsPack checks a pack typed by the person against the page with the store's rules", () => {
  const html = io("d1-arroz-albar-500g");
  assert.equal(confirmsPack("D1", html, 500), true);
  assert.equal(confirmsPack("D1", html, 1000), false);
  assert.equal(confirmsPack("Carulla", fast("vtex-faststore-arroz-500g"), 500), true);
});
