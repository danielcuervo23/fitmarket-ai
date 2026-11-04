import type { MappedProduct, ReadResult, ReaderContext, StoreId, StoreReader } from "../types.ts";

// Shared reading logic for VTEX stores (Exito, Carulla: FastStore pages with
// __NEXT_DATA__; Jumbo: VTEX IO pages with __STATE__). Everything that comes
// from a page is untrusted: each value is checked before it is used, and only
// the regular price and the pack size are kept (never images or descriptions).

/** What a store module must say about how it picks the city. Documentation + extra headers. */
export interface CitySelector {
  /** true only when the Bucaramanga selection was confirmed against the live store. */
  verified: boolean;
  /** Extra request headers (e.g. a region cookie); empty while the store default is used. */
  headers: Record<string, string>;
  note: string;
}

/** The few fields every VTEX page is reduced to before pricing. */
export interface VtexRaw {
  sku: string;
  name: string;
  /** Declared content text such as "500 G" or "1 KG" when the page has one. */
  sizeText: string | null;
  measurementUnit: string;
  unitMultiplier: number;
  price: number;
  listPrice: number;
  availableQuantity: number;
}

const MAX_BODY_CHARS = 8_000_000;
const MEASURE_BASE: Record<string, number> = { kg: 1000, g: 1, l: 1000, ml: 1 };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, 300) : null);

// ---------- page extraction ----------

/** Exito / Carulla: reads the product out of the page's __NEXT_DATA__ JSON. */
export function extractFastStoreProduct(html: string): VtexRaw | null {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const product = pick(data, "props", "pageProps", "data", "product");
  if (!isObj(product)) return null;
  const sellers = product.sellers;
  const offer = pick(product, "offers", "offers", 0);
  const sellerOffer = Array.isArray(sellers) ? pick(sellers, 0, "commertialOffer") : undefined;
  if (!isObj(offer) || !isObj(sellerOffer)) return null;
  const item = isObj(offer.itemOffered) ? offer.itemOffered : {};
  const props = Array.isArray(item.properties) ? item.properties : [];
  const netContent = props.find((p) => isObj(p) && p.name === "Factor Neto");
  const sizeValues = isObj(netContent) && Array.isArray(netContent.values) ? netContent.values : [];
  let qty = num(sellerOffer.AvailableQuantity);
  if (typeof offer.availability === "string" && /OutOfStock/i.test(offer.availability)) qty = 0;
  const raw = {
    sku: str(product.sku) ?? "",
    name: str(product.name) ?? "",
    sizeText: str(sizeValues[0]),
    measurementUnit: (str(item.measurementUnit) ?? "un").toLowerCase(),
    unitMultiplier: num(item.unitMultiplier) ?? 1,
    price: sellerOffer.Price,
    listPrice: sellerOffer.ListPrice,
    availableQuantity: qty,
  };
  return raw as unknown as VtexRaw;
}

/** Jumbo: reads the product out of the VTEX IO __STATE__ cache. */
export function extractVtexIoProduct(html: string): VtexRaw | null {
  const m = /data-varname="__STATE__">\s*<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) return null;
  let state: unknown;
  try {
    state = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!isObj(state)) return null;
  const productKey = Object.keys(state).find((k) => /^Product:[^.]+$/.test(k));
  if (!productKey) return null;
  const item = state[`${productKey}.items.0`];
  const offer = state[`$${productKey}.items.0.sellers.0.commertialOffer`];
  if (!isObj(item) || !isObj(offer)) return null;
  const raw = {
    sku: str(item.itemId) ?? "",
    name: str(item.name) ?? str(item.nameComplete) ?? "",
    sizeText: null,
    measurementUnit: (str(item.measurementUnit) ?? "un").toLowerCase(),
    unitMultiplier: num(item.unitMultiplier) ?? 1,
    price: offer.Price,
    listPrice: offer.ListPrice,
    availableQuantity: offer.AvailableQuantity,
  };
  return raw as unknown as VtexRaw;
}

function pick(root: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
    } else {
      if (!isObj(cur)) return undefined;
      cur = cur[key];
    }
  }
  return cur;
}

// ---------- pack size ----------

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|ml|cc|gramos?|gr|g|litros?|lts?|l|unidades?|und?)\b/gi;

/** Every content amount named in a text, in base units (g, ml or unit). */
export function parseSizes(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(SIZE_RE)) {
    const amount = Number((m[1] as string).replace(",", "."));
    const unit = (m[2] as string).toLowerCase();
    let factor = 1;
    if (unit === "kg" || unit.startsWith("kilo") || unit.startsWith("l")) factor = 1000;
    if (unit === "ml" || unit === "cc") factor = 1;
    found.add(amount * factor);
  }
  return [...found];
}

/** The content of one sold unit in base units, or null when it cannot be known with certainty. */
function packContent(raw: VtexRaw): number | null {
  const base = MEASURE_BASE[raw.measurementUnit];
  if (base !== undefined) {
    // Sold by weight/volume: only a multiplier of 1 is understood.
    return raw.unitMultiplier === 1 ? base : null;
  }
  for (const text of [raw.sizeText, raw.name]) {
    if (!text) continue;
    const sizes = parseSizes(text);
    if (sizes.length === 1) return sizes[0] as number;
    if (sizes.length > 1) return null; // multipack or ambiguous text
  }
  return null;
}

// ---------- pricing ----------

/**
 * Prices one page. `json` is the reduced page data (`VtexRaw`); `[]` means the
 * store has no such product. Regular price = list price; the selling price is
 * the promo when lower. A page with only a selling price is skipped.
 */
export function parseVtexProduct(json: unknown, externalId: string, packSize: number): ReadResult {
  if (Array.isArray(json)) return json.length === 0 ? { ok: false, reason: "not_found" } : { ok: false, reason: "parse_error" };
  if (!isObj(json)) return { ok: false, reason: "parse_error" };
  const r = json as Partial<VtexRaw>;
  const price = num(r.price);
  const list = num(r.listPrice);
  const qty = num(r.availableQuantity);
  if (typeof r.sku !== "string" || r.sku === "" || price === null || list === null || qty === null) {
    return { ok: false, reason: "parse_error" };
  }
  if (r.sku.replace(/^0+/, "") !== externalId.replace(/^0+/, "")) return { ok: false, reason: "parse_error" };
  if (qty <= 0 || price <= 0 || list <= 0) return { ok: false, reason: "unavailable_in_city" };

  const content = packContent(r as VtexRaw);
  if (content === null || Math.abs(content - packSize) > 1e-6) return { ok: false, reason: "pack_mismatch" };

  if (list >= price) {
    return { ok: true, regularPriceCop: Math.round(list), promoPriceCop: price < list ? Math.round(price) : null };
  }
  return { ok: true, regularPriceCop: Math.round(price), promoPriceCop: null }; // list below price: odd data, never the lower one
}

// ---------- reader ----------

export function createVtexReader(
  storeId: StoreId,
  extract: (html: string) => VtexRaw | null,
  selector: CitySelector,
): StoreReader {
  return {
    storeId,
    async read(product: MappedProduct, ctx: ReaderContext): Promise<ReadResult> {
      const res = await ctx.fetchText(product.url, { headers: { ...selector.headers } });
      if (res.status === 404) return { ok: false, reason: "not_found" };
      if (res.status === 403 || res.status === 429) return { ok: false, reason: "blocked" };
      if (res.status < 200 || res.status >= 300 || res.body.length > MAX_BODY_CHARS) {
        return { ok: false, reason: "parse_error" };
      }
      const raw = extract(res.body);
      if (raw === null) return { ok: false, reason: "parse_error" };
      return parseVtexProduct(raw, product.externalId, product.packSize);
    },
  };
}
