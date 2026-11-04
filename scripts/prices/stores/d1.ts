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
// a byte-identical offer, so the robot always reads D1's default region.
// D1 prices DO vary by region: checked by hand on 2026-11-04 in a browser with
// Bucaramanga chosen in D1's address picker vs the default the robot sees
// (arroz Albar 500 g 1750 vs 1750, huevo AA x30 13990 vs 14650, tomate chonto
// 1 kg 5300 vs 5100). So this MUST stay unverified: the robot never writes D1
// prices as Bucaramanga. D1 Bucaramanga prices come from the "Anotar precio"
// bookmarklet (scripts/prices/manual), which reads the person's own page.
export const BUCARAMANGA_SELECTOR: CitySelector = {
  verified: false,
  headers: {},
  note: "D1 default region (not Bucaramanga: prices vary by region, checked 2026-11-04); Bucaramanga prices come from the manual bookmarklet",
};

/**
 * D1 names write sizes as "500 Grs" and "Unidad"; turn them into text the shared size parser knows.
 * Only a bare "Unidad" (no number or "x<number>" right before it) means one unit; "2 Unidades"
 * is left as is so the parser reads 2 and the pack does not match a single unit.
 * D1 also writes thousands with a dot ("1.000 G" = 1000 g; only before g/ml, so "2.5 Kg" keeps
 * its decimal) and, for a mesh or bunch, a net weight after a count ("Ajo Malla X 3 Unidades - 100 G"
 * = 100 g net, "Cilantro Unidad 100 G" = 100 g net).
 */
const WEIGHT_AHEAD = String.raw`(?=\d+(?:[.,]\d+)?\s*(?:kg|grs?|g|ml|l)\b)`;
/**
 * Only a mesh or a bunch ("Malla", "Atado", "Manojo") states its total net weight after the count.
 * Elsewhere "Yogurt X 6 Unidades - 200 G" is 6 items of 200 g: left alone, the parser sees two
 * sizes and the pack is refused (never a 200 g pack priced for 6).
 */
const COUNT_THEN_NET_WEIGHT = new RegExp(
  String.raw`(\b(?:malla|atado|manojo)\s+)(?:x\s*)?\d+\s*unidad(?:es)?\s*-\s*${WEIGHT_AHEAD}`,
  "gi",
);
/** "Cilantro Unidad 100 G": one bunch whose net weight follows. */
const UNIT_THEN_NET_WEIGHT = new RegExp(String.raw`(?<![\dxX]\s*)\bunidad\s+${WEIGHT_AHEAD}`, "gi");

function normalizeName(name: string): string {
  return name
    .replace(/\b(\d{1,3})\.(\d{3})(?=\s*(?:grs?|g|gramos?|ml|cc)\b)/gi, "$1$2")
    .replace(COUNT_THEN_NET_WEIGHT, "$1")
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
