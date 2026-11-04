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
export const HOST = "www.d1.com.co";
export const PRODUCT_PATH_PATTERN = "/<slug>/p";
export const BLOCKED_RULES = [
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

// D1 picks a location with a JavaScript postal-code modal (API calls). Checked on
// 2026-11-04 with product pages only: the page is publicly cached, the product
// query has no region argument, there is one seller ("1", Tiendas D1) and the
// signed price token says salesChannel "1"; the `sc=` parameter is blocked by
// robots.txt. A vtex_segment cookie with a Bucaramanga postal code (680001) gave
// a byte-identical offer and price token, so either the cookie is ignored or the
// price is national; the page alone cannot tell which. Press (Blu Radio) reports
// one price list for every D1 store, but D1 publishes no official statement we
// may read under the precautions. So the default price is read and this stays
// unverified until the owner compares a few prices in a browser set to Bucaramanga.
export const BUCARAMANGA_SELECTOR: CitySelector = {
  verified: false,
  headers: {},
  note: "D1 default (national) price list; one seller and sales channel 1; Bucaramanga match pending a manual browser check",
};

/**
 * D1 names write sizes as "500 Grs" and "Unidad"; turn them into text the shared size parser knows.
 * Only a bare "Unidad" (no number or "x<number>" right before it) means one unit; "2 Unidades"
 * is left as is so the parser reads 2 and the pack does not match a single unit.
 * D1 also writes thousands with a dot ("1.000 G" = 1000 g; only before g/ml, so "2.5 Kg" keeps
 * its decimal) and a net weight after a count ("Ajo Malla X 3 Unidades - 100 G" = 100 g net,
 * "Cilantro Unidad 100 G" = 100 g net).
 */
const WEIGHT_AHEAD = String.raw`(?=\d+(?:[.,]\d+)?\s*(?:kg|grs?|g|ml|l)\b)`;
const COUNT_THEN_NET_WEIGHT = new RegExp(String.raw`(?:\bx\s*)?\b\d+\s*unidad(?:es)?\s*-\s*${WEIGHT_AHEAD}`, "gi");
/** "Cilantro Unidad 100 G": one bunch whose net weight follows. */
const UNIT_THEN_NET_WEIGHT = new RegExp(String.raw`(?<![\dxX]\s*)\bunidad\s+${WEIGHT_AHEAD}`, "gi");

function normalizeName(name: string): string {
  return name
    .replace(/\b(\d{1,3})\.(\d{3})(?=\s*(?:grs?|g|gramos?|ml|cc)\b)/gi, "$1$2")
    .replace(COUNT_THEN_NET_WEIGHT, "")
    .replace(UNIT_THEN_NET_WEIGHT, "")
    .replace(/\bgrs?\b/gi, "g")
    .replace(/(?<![\dxX]\s*)\bunidad(?:es)?\b/gi, "1 und");
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
  cityVerified: BUCARAMANGA_SELECTOR.verified,
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
