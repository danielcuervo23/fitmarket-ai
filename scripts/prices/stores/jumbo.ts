import { checkProductUrl } from "../access.ts";
import type { MappedProduct, ReadResult, ReaderContext, StoreReader } from "../types.ts";
import { extractVtexIoProduct, parseVtexProduct, type CitySelector } from "./vtex.ts";

// Jumbo Colombia (www.jumbocolombia.com) runs on VTEX IO: the product is read
// from the page's __STATE__ with the shared extractor. Everything from the page
// is untrusted; only the regular price and the pack size are kept.

// Same values as scripts/prices/policy.json (stores.Jumbo). Kept here as defence
// in depth: the reader refuses anything that is not a plain product page.
export const HOST = "www.jumbocolombia.com";
export const PRODUCT_PATH_PATTERN = "/<slug>/p";
export const BLOCKED_RULES = ["/api/", "/s?", "/busca*", "/Account*", "/account*", "/checkout/", "/login*", "/cart"];

const MAX_BODY_CHARS = 8_000_000;

// How Jumbo picks the city (checked 2026-11-04 against live product pages):
// - The server-rendered page always carries the national default segment
//   (`segmentToken` = {"channel":"1","regionId":null}); no cookie is set except VtexWorkspace.
// - The city is chosen in a JavaScript delivery modal ("location-validation") that
//   talks to the store's /api/ endpoints, which the policy forbids. The page also
//   switches blocks for sales channel 6 (Jumbo Express), so prices CAN vary by channel.
// - Adding `?sc=<n>` to a product page is ignored (same body, same channel "1").
// So the Bucaramanga price cannot be confirmed with product pages alone: this stays
// unverified (prices are read for the national default channel) until the owner decides.
export const BUCARAMANGA_SELECTOR: CitySelector = {
  verified: false,
  headers: {},
  note: "Jumbo national default channel (sc=1, no region); Bucaramanga selection needs the JS delivery modal (/api/), pending owner decision",
};

/**
 * Jumbo names write sizes as "x350grs", "x 2kgr", "x 6 un" or a bare "unidad". Turn them into
 * text the shared size parser knows. Only a bare "unidad" (no number right before it) is one
 * unit; "2 unidades" is left alone so a single-unit mapping does not match a two-pack. A dot
 * before three digits and g/ml is a thousands separator ("1.000 g" = 1000 g; "2.5 kg" keeps its decimal).
 */
function normalizeName(name: string): string {
  return name
    .replace(/\b(\d{1,3})\.(\d{3})(?=\s*(?:grs?|g|gramos?|ml|cc)\b)/gi, "$1$2")
    .replace(/(\d)\s*kgrs?\b/gi, "$1 kg")
    .replace(/(\d)\s*grs\b/gi, "$1 g")
    .replace(/(?<![\dxX]\s*)\bunidad\b/gi, "1 und");
}

/** Prices one Jumbo product page body for the mapped sku (`externalId`) and pack size (g, ml or unit). */
export function parseJumboProduct(body: string, externalId: string, packSize: number): ReadResult {
  const raw = extractVtexIoProduct(body);
  if (raw === null) return { ok: false, reason: "parse_error" };
  const name = typeof raw.name === "string" ? normalizeName(raw.name) : raw.name;
  return parseVtexProduct({ ...raw, name }, externalId, packSize);
}

function isProductPage(url: string): boolean {
  const verdict = checkProductUrl(url, HOST, PRODUCT_PATH_PATTERN, BLOCKED_RULES);
  return verdict.ok && verdict.url.search === "";
}

export const reader: StoreReader = {
  storeId: "Jumbo",
  cityVerified: BUCARAMANGA_SELECTOR.verified,
  async read(product: MappedProduct, ctx: ReaderContext): Promise<ReadResult> {
    if (!isProductPage(product.url)) return { ok: false, reason: "blocked" };
    const res = await ctx.fetchText(product.url, { headers: { ...BUCARAMANGA_SELECTOR.headers } });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 403 || res.status === 429) return { ok: false, reason: "blocked" };
    if (res.status < 200 || res.status >= 300 || res.body.length > MAX_BODY_CHARS) {
      return { ok: false, reason: "parse_error" };
    }
    return parseJumboProduct(res.body, product.externalId, product.packSize);
  },
};
