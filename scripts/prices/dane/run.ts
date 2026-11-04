import { createClient } from "@supabase/supabase-js";
import { deriveReferencePrices, type DaneMapping, type DeriveResult, type FoodInfo, type ReferencePrice } from "./derive.ts";
import { fetchWeekly, parseWeeklyResponse } from "./sipsa.ts";

// Weekly DANE SIPSA step: fetch (one request) -> parse -> map -> convert ->
// markup -> sanity -> upsert into city_reference_prices.

const CHUNK = 200;
const SOURCE = "dane_sipsa";

export interface ReferenceRow extends ReferencePrice {
  city: string;
  source: typeof SOURCE;
}

export interface ReferenceSink {
  upsertReferencePrices(rows: ReferenceRow[]): Promise<void>;
}

export interface DaneRunOptions {
  fetch: typeof fetch;
  foods: readonly FoodInfo[];
  mapping: Pick<DaneMapping, "products">;
  city: string;
  today: string;
  sink: ReferenceSink;
  dryRun?: boolean;
}

export interface DaneSummary extends Omit<DeriveResult, "prices"> {
  read: number;
  invalid: number;
  stored: number;
  dryRun: boolean;
}

export async function runDane(opts: DaneRunOptions): Promise<DaneSummary> {
  if (!/^[a-z][a-z0-9_-]{1,40}$/.test(opts.city)) throw new Error("city must be a lowercase slug");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.today) || Number.isNaN(Date.parse(`${opts.today}T00:00:00Z`))) {
    throw new Error("today must be a valid YYYY-MM-DD date");
  }

  // Any SipsaError here (HTTP, size, malformed XML) aborts before anything is written.
  const { rows, invalid } = parseWeeklyResponse(await fetchWeekly(opts.fetch));

  if (rows.length === 0) throw new Error("SIPSA: no rows for Bucaramanga, Centroabastos");

  const { prices, ...rest } = deriveReferencePrices({
    rows,
    mapping: opts.mapping,
    foods: opts.foods,
    today: opts.today,
  });
  const dryRun = opts.dryRun === true;

  if (!dryRun && prices.length > 0) {
    await opts.sink.upsertReferencePrices(prices.map((p) => ({ ...p, city: opts.city, source: SOURCE })));
  }

  return { ...rest, read: rows.length, invalid, stored: prices.length, dryRun };
}

interface Failure {
  message: string;
}
export interface ReferenceClient {
  from(table: string): {
    upsert(rows: unknown[], options: { onConflict: string }): PromiseLike<{ error: Failure | null }>;
  };
}

/** Writes with the service role (the only role allowed to write, see migration 013). */
export function createReferenceSinkFromClient(client: ReferenceClient): ReferenceSink {
  return {
    async upsertReferencePrices(rows) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK).map((r) => ({
          city: r.city,
          food_id: r.foodId,
          price_cop_per_unit: r.pricePerUnit,
          observed_on: r.observedOn,
          source: r.source,
        }));
        const { error } = await client.from("city_reference_prices").upsert(part, { onConflict: "city,food_id,source" });

        if (error) throw new Error(`writing city_reference_prices failed: ${error.message}`);
      }
    },
  };
}

export function createReferenceSink(url: string, serviceRoleKey: string): ReferenceSink {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return createReferenceSinkFromClient(client as unknown as ReferenceClient);
}
