// Last line of defence before a price reaches the database: the same limits
// as the CHECK constraint on prices.regular_price_cop, plus a week-to-week
// jump guard (x0.5 .. x2 of the previous price).
export const MIN_PRICE_COP = 50;
export const MAX_PRICE_COP = 5_000_000;

export type PriceCheck = { ok: true } | { ok: false; reason: "out_of_range" | "jump" };

export function checkPrice(regular: unknown, lastKnown: number | null): PriceCheck {
  if (
    typeof regular !== "number" ||
    !Number.isInteger(regular) ||
    regular < MIN_PRICE_COP ||
    regular > MAX_PRICE_COP
  ) {
    return { ok: false, reason: "out_of_range" };
  }
  if (lastKnown !== null && (regular > lastKnown * 2 || regular < lastKnown * 0.5)) {
    return { ok: false, reason: "jump" };
  }
  return { ok: true };
}
