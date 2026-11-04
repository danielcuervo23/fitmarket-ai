import { checkProductUrl } from "../access.ts";
import { STORE_IDS, type StoreId } from "../types.ts";

// The file a person exports from the "Anotar precio" bookmarklet and the
// importer reads (data/manual-prices/). Shared by both sides, so it has no
// Node or zod imports: it is bundled into the bookmarklet.

export const SCHEMA_VERSION = 1;
export const CITY = "bucaramanga";
/** An entry older than this is not imported (prices go stale). */
export const MAX_AGE_DAYS = 45;
/** Store product ids: digits, letters, "-" and "_" only. */
export const EXTERNAL_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
export const MAX_NAME = 200;
// Control characters and bidirectional overrides: never shown or stored.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
/** Packs outside [usual / 10, usual * 10] are refused: likely a per-kg or multipack mix-up. */
const PACK_RATIO = 10;

/** The few food fields the capture tool needs. */
export interface SlimFood {
  id: string;
  nameEs: string;
  unit: string;
  defaultPack: number;
}

/** A store page the capture tool may read: an allowed store from policy.json. */
export interface StoreSite {
  storeId: StoreId;
  host: string;
  productPathPattern: string;
  disallowedPaths: string[];
}

export interface ManualEntry {
  foodId: string;
  externalId: string;
  name: string;
  /** Content of one pack in the food's base unit (g, ml or unit). */
  packSize: number;
  /** Canonical product URL, no query string. */
  url: string;
  regularPriceCop: number;
  observedOn: string;
}

export interface ManualExport {
  schemaVersion: typeof SCHEMA_VERSION;
  store: StoreId;
  city: typeof CITY;
  capturedOn: string;
  cityAttested: true;
  entries: ManualEntry[];
}

interface PolicyLike {
  stores: Record<string, { allowed: boolean; robotsUrl: string; productPathPattern?: string; disallowedPaths: string[] }>;
}

export function storeSitesFromPolicy(policy: PolicyLike): StoreSite[] {
  const out: StoreSite[] = [];
  for (const storeId of STORE_IDS) {
    const store = policy.stores[storeId];
    if (!store || store.allowed !== true || !store.productPathPattern) continue;
    out.push({
      storeId,
      host: new URL(store.robotsUrl).hostname,
      productPathPattern: store.productPathPattern,
      disallowedPaths: [...store.disallowedPaths],
    });
  }
  return out;
}

export function isPlausiblePack(packSize: number, food: SlimFood): boolean {
  if (typeof packSize !== "number" || !Number.isFinite(packSize) || packSize <= 0) return false;
  if (food.unit === "unit" && !Number.isInteger(packSize)) return false;
  return packSize >= food.defaultPack / PACK_RATIO && packSize <= food.defaultPack * PACK_RATIO;
}

export function exportFileName(storeId: StoreId, day: string): string {
  return `precios-${storeId.toLowerCase()}-${day}.json`;
}

/** `https://<host>/<slug>/p` for a product page of `site`, or null for anything else. */
export function canonicalProductUrl(href: string, site: StoreSite): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  url.search = "";
  url.hash = "";
  const verdict = checkProductUrl(url.href, site.host, site.productPathPattern, site.disallowedPaths);
  return verdict.ok ? verdict.url.href : null;
}

/** Page text made safe to show and store: no control or direction characters, at most 200 characters. */
export function cleanName(name: string): string {
  return name.replace(UNSAFE_CHARS, "").trim().slice(0, MAX_NAME);
}
