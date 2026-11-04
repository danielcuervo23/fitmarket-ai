import { parseD1Product } from "../stores/d1.ts";
import {
  extractFastStoreProduct,
  extractVtexIoProduct,
  packContent,
  parseSizes,
  parseVtexProduct,
  regularAndPromo,
  vtexIoProductSlug,
  type VtexRaw,
} from "../stores/vtex.ts";
import type { ReadResult, StoreId } from "../types.ts";
import { MAX_PRICE_COP, MIN_PRICE_COP } from "../validate.ts";
import { canonicalProductUrl, cleanName, EXTERNAL_ID_RE, type StoreSite } from "./format.ts";

// Reads the product of the page a PERSON is viewing (the bookmarklet passes the
// page's own HTML). It never requests anything. It reuses the weekly readers'
// extraction and pricing rules, so a manual entry follows the same rules as an
// automatic one. Every value from the page is untrusted.

export interface PageProduct {
  storeId: StoreId;
  externalId: string;
  name: string;
  url: string;
  regularPriceCop: number;
  /** Pack content (g, ml or unit) confirmed by the store's rules; null when the person must type it. */
  packSize: number | null;
}

export type PageFailure = "unsupported_store" | "not_product_page" | "stale_page" | "no_data" | "unavailable" | "bad_price";

export type PageRead = { ok: true; product: PageProduct } | { ok: false; reason: PageFailure; message: string };

export interface PageInput {
  /** The page's serialized HTML (document.documentElement.outerHTML). */
  html: string;
  /** location.href now. */
  href: string;
  /** URL the document was loaded from; differs from href after in-app navigation. */
  documentUrl: string;
  sites: readonly StoreSite[];
  /** More pack sizes worth trying (e.g. the foods' usual packs). */
  extraPackCandidates?: readonly number[];
}

export const MESSAGES: Record<PageFailure, string> = {
  unsupported_store: "Esta página no es de Éxito, Carulla, Jumbo ni D1. Abre el producto en la página de la tienda.",
  not_product_page: "Esta no es la página de un producto. Abre un producto (su dirección termina en /p) y vuelve a tocar el botón.",
  stale_page: "Recarga la página (tecla F5) y vuelve a tocar el botón: los datos que tiene la página son de otro producto.",
  no_data: "No pude leer el precio de esta página. Recárgala (F5) e intenta de nuevo. No se guardó nada.",
  unavailable: "Este producto aparece agotado en la tienda. No se guardó nada; busca otro producto parecido.",
  bad_price: "El precio de esta página no parece real. No se guardó nada.",
};

const MAX_PACK = 100_000;

const fail = (reason: PageFailure): PageRead => ({ ok: false, reason, message: MESSAGES[reason] });

function isFastStore(storeId: StoreId): boolean {
  return storeId === "Exito" || storeId === "Carulla";
}

function extract(storeId: StoreId, html: string): VtexRaw | null {
  return isFastStore(storeId) ? extractFastStoreProduct(html) : extractVtexIoProduct(html);
}

/** The reduced page data as a tiny VTEX IO page, so D1's own reader (with its name rules) can price it. */
function miniIoHtml(raw: VtexRaw): string {
  const key = "Product:p";
  const state = {
    [key]: {},
    [`${key}.items.0`]: {
      itemId: raw.sku,
      name: raw.name,
      measurementUnit: raw.measurementUnit,
      unitMultiplier: raw.unitMultiplier,
    },
    [`$${key}.items.0.sellers.0.commertialOffer`]: {
      Price: raw.price,
      ListPrice: raw.listPrice,
      AvailableQuantity: raw.availableQuantity,
    },
  };
  const json = JSON.stringify(state).replace(/</g, "\\u003c");
  return `<template data-varname="__STATE__"><script>${json}</script></template>`;
}

/** Prices the reduced page for one pack size with the same rules as the store's weekly reader. */
function priceFor(storeId: StoreId, raw: VtexRaw, packSize: number): ReadResult {
  if (storeId === "D1") return parseD1Product(miniIoHtml(raw), raw.sku, packSize);
  return parseVtexProduct(raw, raw.sku, packSize);
}

function packCandidates(raw: VtexRaw, extra: readonly number[]): number[] {
  const out: number[] = [];
  const first = packContent(raw);
  if (first !== null) out.push(first);
  for (const text of [raw.sizeText, raw.name]) {
    if (!text) continue;
    out.push(...parseSizes(text));
    for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const asDecimal = Number(m[0].replace(",", "."));
      const asThousands = Number(m[0].replace(/[.,]/g, ""));
      out.push(asDecimal, asDecimal * 1000, asThousands);
    }
  }
  out.push(...extra, 1);
  return [...new Set(out)].filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_PACK);
}

function urlKey(href: string): string | null {
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

function firstSegment(href: string): string | null {
  try {
    return decodeURIComponent(new URL(href).pathname.split("/")[1] ?? "");
  } catch {
    return null;
  }
}

export function readProductPage(input: PageInput): PageRead {
  let host: string;
  try {
    host = new URL(input.href).hostname;
  } catch {
    return fail("unsupported_store");
  }
  const site = input.sites.find((s) => s.host === host);
  if (!site) return fail("unsupported_store");
  const url = canonicalProductUrl(input.href, site);
  if (url === null) return fail("not_product_page");
  const here = urlKey(input.href);
  if (here === null || urlKey(input.documentUrl) !== here) return fail("stale_page");

  const raw = extract(site.storeId, input.html);
  if (raw === null) return fail("no_data");
  if (!isFastStore(site.storeId) && vtexIoProductSlug(input.html) !== firstSegment(input.href)) return fail("stale_page");
  if (!EXTERNAL_ID_RE.test(raw.sku)) return fail("no_data");
  const name = cleanName(typeof raw.name === "string" ? raw.name : "");
  if (name === "") return fail("no_data");

  let packSize: number | null = null;
  let regular: number | null = null;
  for (const candidate of packCandidates(raw, input.extraPackCandidates ?? [])) {
    const r = priceFor(site.storeId, raw, candidate);
    if (r.ok) {
      packSize = candidate;
      regular = r.regularPriceCop;
      break;
    }
    if (r.reason === "unavailable_in_city") return fail("unavailable");
    if (r.reason !== "pack_mismatch") return fail("no_data");
  }
  // Pack not confirmed: every candidate was a pack mismatch, so price and stock were valid.
  regular ??= regularAndPromo(raw.price, raw.listPrice).regularPriceCop;
  if (!Number.isInteger(regular) || regular < MIN_PRICE_COP || regular > MAX_PRICE_COP) return fail("bad_price");

  return { ok: true, product: { storeId: site.storeId, externalId: raw.sku, name, url, regularPriceCop: regular, packSize } };
}

/** true when `packSize` is the pack the store's rules read on this page. */
export function confirmsPack(storeId: StoreId, html: string, packSize: number): boolean {
  const raw = extract(storeId, html);
  return raw !== null && priceFor(storeId, raw, packSize).ok;
}
