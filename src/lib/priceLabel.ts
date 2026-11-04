export type PriceLabel =
  | { kind: "approximate" }
  | { kind: "updated"; date: string };

interface PriceFields {
  price_source?: unknown;
  price_updated_at?: unknown;
}

const REAL_SOURCES = new Set(["official", "user"]);

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Only a real source (official or user) with a valid date counts as updated.
 * Everything else (old plans, "estimate", legacy "sample", bad data) is
 * approximate. Stale prices are already turned into estimates by the server.
 */
export function priceLabel(item: PriceFields): PriceLabel {
  if (
    typeof item.price_source === "string" &&
    REAL_SOURCES.has(item.price_source) &&
    isRealDate(item.price_updated_at)
  ) {
    return { kind: "updated", date: item.price_updated_at };
  }
  return { kind: "approximate" };
}

export function hasApproximatePrices(items: readonly PriceFields[]): boolean {
  return items.some((item) => priceLabel(item).kind === "approximate");
}
