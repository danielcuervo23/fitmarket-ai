// Contracts shared by the price runner and the per-store readers (T10-T12).

export type StoreId = "D1" | "Ara" | "Exito" | "Jumbo" | "Carulla";
export const STORE_IDS: readonly StoreId[] = ["D1", "Ara", "Exito", "Jumbo", "Carulla"];

export interface MappedProduct {
  storeId: StoreId;
  foodId: string;
  externalId: string;
  name: string;
  /** Pack content in the food's base unit (g, ml or unit). */
  packSize: number;
  url: string;
}

export type ReadFailureReason =
  | "not_found"
  | "unavailable_in_city"
  | "parse_error"
  | "blocked"
  | "pack_mismatch";

export type ReadResult =
  | { ok: true; regularPriceCop: number; promoPriceCop: number | null }
  | { ok: false; reason: ReadFailureReason };

export interface FetchTextInit {
  headers?: Record<string, string>;
}

export interface ReaderContext {
  city: string;
  /**
   * Polite fetch: enforces robots.txt, the store's product path pattern, the
   * delay between requests and the stop-on-429 rule. A refused request returns
   * `{ status: 403, body: "" }` without touching the network.
   */
  fetchText(url: string, init?: FetchTextInit): Promise<{ status: number; body: string }>;
}

/**
 * A store reader parses ONE product page. It receives the mapped product, so it
 * must compare the pack size it finds on the page with `product.packSize` and
 * return `{ ok: false, reason: "pack_mismatch" }` when they differ (this keeps
 * per-kg prices from being saved as per-pack prices). The Bucaramanga selector
 * (cookie, query or store id) is a constant owned by the reader's own module.
 */
export interface StoreReader {
  storeId: StoreId;
  /** true only when the store city selector was confirmed to give Bucaramanga prices. Missing means unverified. */
  cityVerified?: boolean;
  read(product: MappedProduct, ctx: ReaderContext): Promise<ReadResult>;
}
