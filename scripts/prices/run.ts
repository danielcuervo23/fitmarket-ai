import { createStoreFetcher } from "./fetcher.ts";
import { policySchema } from "./policy.ts";
import { checkPrice } from "./validate.ts";
import type { MappedProduct, ReadResult, StoreId, StoreReader } from "./types.ts";

export interface PriceSink {
  /** Writes the products and returns key `${storeId}:${externalId}` -> store_products.id. */
  upsertProducts(products: MappedProduct[]): Promise<Map<string, number>>;
  /** Read-only twin of upsertProducts, used by dry runs. Unknown products are absent. */
  findProductIds(products: MappedProduct[]): Promise<Map<string, number>>;
  lastPrices(ids: number[], city: string): Promise<Map<number, number>>;
  /** Always stored with source 'official'. */
  upsertPrices(
    rows: { storeProductId: number; city: string; regularPriceCop: number; observedOn: string }[],
  ): Promise<void>;
}

export interface RunSummary {
  perStore: Record<string, { read: number; saved: number; skipped: Record<string, number> }>;
  failedStores: string[];
}

export interface RunOptions {
  policy: unknown;
  readers: StoreReader[];
  mappings: Record<string, MappedProduct[]>;
  sink: PriceSink;
  fetch: typeof fetch;
  today: string;
  city: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  dryRun?: boolean;
  /**
   * Explicit opt-in: write prices even when the store city selector is unverified (the readers
   * then read the store default region but the rows are stored under `city`). Off by default.
   */
  allowUnverifiedCity?: boolean;
}

const MIN_SAVED_RATIO = 0.5;

function count(skipped: Record<string, number>, reason: string, n = 1): void {
  skipped[reason] = (skipped[reason] ?? 0) + n;
}

function validateInputs(today: string, city: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00Z`))) {
    throw new Error("today must be a valid YYYY-MM-DD date");
  }
  if (!/^[a-z][a-z0-9_-]{1,40}$/.test(city)) throw new Error("city must be a lowercase slug");
}

export async function runWeekly(opts: RunOptions): Promise<RunSummary> {
  const policy = policySchema.parse(opts.policy);
  validateInputs(opts.today, opts.city);
  const summary: RunSummary = { perStore: {}, failedStores: [] };

  for (const [name, storePolicy] of Object.entries(policy.stores)) {
    const storeId = name as StoreId;
    const products = (opts.mappings[name] ?? []).filter((p) => p.storeId === storeId);
    const entry = { read: 0, saved: 0, skipped: {} as Record<string, number> };
    summary.perStore[name] = entry;

    if (storePolicy.allowed !== true) {
      count(entry.skipped, "store_not_allowed", products.length);
      continue;
    }
    const reader = opts.readers.find((r) => r.storeId === storeId);
    if (!reader) {
      count(entry.skipped, "no_reader", products.length);
      continue;
    }
    if (products.length === 0) continue;
    // Prices read with an unverified selector may belong to another region: never write them
    // as `city` unless the operator opted in. A dry run still reads and reports.
    const cityUnverified = reader.cityVerified !== true && opts.allowUnverifiedCity !== true;
    if (cityUnverified && !opts.dryRun) {
      count(entry.skipped, "city_unverified", products.length);
      continue;
    }

    try {
      const fetcher = createStoreFetcher({
        policy,
        storeId,
        fetch: opts.fetch,
        sleep: opts.sleep,
        now: opts.now,
      });
      const ids = opts.dryRun ? await opts.sink.findProductIds(products) : await opts.sink.upsertProducts(products);
      const last = await opts.sink.lastPrices([...ids.values()], opts.city);
      const rows: Parameters<PriceSink["upsertPrices"]>[0] = [];

      for (const product of products) {
        if (fetcher.stoppedBy() !== null) {
          count(entry.skipped, "store_stopped");
          continue;
        }
        let result: ReadResult;
        try {
          result = await reader.read(product, { city: opts.city, fetchText: fetcher.fetchText });
        } catch {
          count(entry.skipped, "reader_error");
          continue;
        }
        if (!result || result.ok !== true) {
          count(entry.skipped, result && result.ok === false ? String(result.reason) : "reader_error");
          continue;
        }
        entry.read++;
        const storeProductId = ids.get(`${storeId}:${product.externalId}`);
        const verdict = checkPrice(
          result.regularPriceCop,
          storeProductId === undefined ? null : (last.get(storeProductId) ?? null),
        );
        if (!verdict.ok) {
          count(entry.skipped, verdict.reason);
          continue;
        }
        entry.saved++; // in a dry run: "would be saved"
        if (storeProductId !== undefined) {
          // Only the regular price and the mapped pack size are ever stored; promos are dropped here.
          rows.push({
            storeProductId,
            city: opts.city,
            regularPriceCop: result.regularPriceCop,
            observedOn: opts.today,
          });
        }
      }

      if (cityUnverified) count(entry.skipped, "city_unverified", products.length); // dry run: would be blocked
      if (!opts.dryRun && rows.length > 0) await opts.sink.upsertPrices(rows);
      if (fetcher.stoppedBy() !== null || entry.saved / products.length < MIN_SAVED_RATIO) {
        summary.failedStores.push(name);
      }
    } catch {
      entry.saved = 0;
      count(entry.skipped, "store_error", products.length);
      summary.failedStores.push(name);
    }
  }
  return summary;
}
