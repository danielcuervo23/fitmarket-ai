import { checkProductUrl } from "../access.ts";
import type { MappedProduct, ReadResult, ReaderContext, StoreReader } from "../types.ts";
import { extractVtexIoProduct, parseVtexProduct, type CitySelector } from "./vtex.ts";

// D1 (www.d1.com.co; domicilios.tiendasd1.com redirects there) runs on VTEX IO,
// like Jumbo, so the page is reduced with the same __STATE__ extractor. D1 is a
// hard discounter: most products show one everyday price, which is the regular
// price (ListPrice == Price => no promo). Everything from the page is untrusted;
// only the regular price and the pack size are kept.

// Same values as scripts/prices/policy.json (stores.D1). Kept here as defence in
// depth: the reader refuses anything that is not a product page of that host.
const HOST = "www.d1.com.co";
const PRODUCT_PATH_PATTERN = "/<slug>/p";
const BLOCKED_RULES = [
  "/busca*",
  "/api/",
  "/s?",
  "/account/*",
  "/login/*",
  "/checkout/*",
  "/busca/*",
  "/quick-view/*",
  "/espiar/*",
  "/buscapagina/*",
];

const MAX_BODY_CHARS = 8_000_000;

// D1 shows prices after the shopper picks an address or store (a postal-code
// modal driven by JavaScript / API calls). That cannot be done with product
// pages alone, so the store default region is read and this stays unverified.
export const BUCARAMANGA_SELECTOR: CitySelector = {
  verified: false,
  headers: {},
  note: "D1 default region; Bucaramanga selection pending owner confirmation",
};

/** D1 names write sizes as "500 Grs" and "Unidad"; turn them into text the shared size parser knows. */
function normalizeName(name: string): string {
  return name.replace(/\bgrs?\b/gi, "g").replace(/\bunidad(?:es)?\b/gi, "1 und");
}

/** Prices one D1 product page body for the mapped sku (`externalId`) and pack size (g, ml or unit). */
export function parseD1Product(body: string, externalId: string, packSize: number): ReadResult {
  const raw = extractVtexIoProduct(body);
  if (raw === null) return { ok: false, reason: "parse_error" };
  return parseVtexProduct({ ...raw, name: normalizeName(raw.name) }, externalId, packSize);
}

function isProductPage(url: string): boolean {
  const verdict = checkProductUrl(url, HOST, PRODUCT_PATH_PATTERN, BLOCKED_RULES);
  return verdict.ok && verdict.url.search === "";
}

export const reader: StoreReader = {
  storeId: "D1",
  async read(product: MappedProduct, ctx: ReaderContext): Promise<ReadResult> {
    if (!isProductPage(product.url)) return { ok: false, reason: "blocked" };
    const res = await ctx.fetchText(product.url, { headers: { ...BUCARAMANGA_SELECTOR.headers } });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 403 || res.status === 429) return { ok: false, reason: "blocked" };
    if (res.status < 200 || res.status >= 300 || res.body.length > MAX_BODY_CHARS) {
      return { ok: false, reason: "parse_error" };
    }
    return parseD1Product(res.body, product.externalId, product.packSize);
  },
};
