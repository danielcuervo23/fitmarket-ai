import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PriceSink } from "./run.ts";
import type { MappedProduct } from "./types.ts";

// Writes through the service role (the only role allowed to write prices, see
// migration 011). Keys come from the environment; they are never logged.

const CHUNK = 200;

const productRowSchema = z.object({ id: z.number().int(), store_id: z.string(), external_id: z.string() });
const lastRowSchema = z.object({ store_product_id: z.number().int(), regular_price_cop: z.number().int() });
const priceDayRowSchema = z.object({
  store_product_id: z.number().int(),
  observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  regular_price_cop: z.number().int(),
});

/** The weekly sink plus what the manual importer (scripts/prices/manual) needs. */
export interface SupabaseSink extends PriceSink {
  /** Official prices stored since `since` (YYYY-MM-DD), keyed `${storeProductId}:${observedOn}`. */
  existingPrices(ids: number[], city: string, since: string): Promise<Map<string, number>>;
  /** Marks store products inactive (they lost their food). */
  deactivateProducts(ids: number[]): Promise<void>;
}

interface Failure {
  message: string;
}
type Result = { data?: unknown; error: Failure | null };
// The small slice of the Supabase client this sink uses (easy to fake in tests).
export interface SinkClient {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function ok(result: Result, what: string): unknown {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const key = (storeId: string, externalId: string) => `${storeId}:${externalId}`;

export function createSinkFromClient(client: SinkClient): SupabaseSink {
  async function findProductIds(products: MappedProduct[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const byStore = new Map<string, string[]>();
    for (const p of products) byStore.set(p.storeId, [...(byStore.get(p.storeId) ?? []), p.externalId]);
    for (const [storeId, externalIds] of byStore) {
      for (const part of chunks(externalIds, CHUNK)) {
        const data = ok(
          await client.from("store_products").select("id,store_id,external_id").eq("store_id", storeId).in("external_id", part),
          "reading store_products",
        );
        for (const row of z.array(productRowSchema).parse(data)) out.set(key(row.store_id, row.external_id), row.id);
      }
    }
    return out;
  }

  return {
    findProductIds,

    async upsertProducts(products) {
      const out = new Map<string, number>();
      for (const part of chunks(products, CHUNK)) {
        const rows = part.map((p) => ({
          store_id: p.storeId,
          food_id: p.foodId,
          external_id: p.externalId,
          name: p.name,
          pack_size: p.packSize,
          url: p.url,
          is_active: true,
        }));
        const data = ok(
          await client.from("store_products").upsert(rows, { onConflict: "store_id,external_id" }).select("id,store_id,external_id"),
          "writing store_products",
        );
        for (const row of z.array(productRowSchema).parse(data)) out.set(key(row.store_id, row.external_id), row.id);
      }
      return out;
    },

    async lastPrices(ids, city) {
      const out = new Map<number, number>();
      for (const part of chunks(ids, CHUNK)) {
        const data = ok(
          await client.from("current_prices").select("store_product_id,regular_price_cop").eq("city", city).eq("source", "official").in("store_product_id", part),
          "reading current_prices",
        );
        for (const row of z.array(lastRowSchema).parse(data)) out.set(row.store_product_id, row.regular_price_cop);
      }
      return out;
    },

    async upsertPrices(rows) {
      for (const part of chunks(rows, CHUNK)) {
        const dbRows = part.map((r) => ({
          store_product_id: r.storeProductId,
          city: r.city,
          source: "official",
          regular_price_cop: r.regularPriceCop,
          observed_on: r.observedOn,
        }));
        ok(
          await client.from("prices").upsert(dbRows, { onConflict: "store_product_id,city,source,observed_on" }),
          "writing prices",
        );
      }
    },

    async existingPrices(ids, city, since) {
      const out = new Map<string, number>();
      for (const part of chunks(ids, CHUNK)) {
        const data = ok(
          await client
            .from("prices")
            .select("store_product_id,observed_on,regular_price_cop")
            .eq("city", city)
            .eq("source", "official")
            .gte("observed_on", since)
            .in("store_product_id", part),
          "reading prices",
        );
        for (const row of z.array(priceDayRowSchema).parse(data)) {
          out.set(`${row.store_product_id}:${row.observed_on}`, row.regular_price_cop);
        }
      }
      return out;
    },

    async deactivateProducts(ids) {
      for (const part of chunks(ids, CHUNK)) {
        ok(await client.from("store_products").update({ is_active: false }).in("id", part), "retiring store_products");
      }
    },
  };
}

export function createSupabaseSink(url: string, serviceRoleKey: string): SupabaseSink {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return createSinkFromClient(client);
}
