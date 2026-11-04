// Pure helpers for the plan history list (FIX-06 / PERF-002).
// No runtime "@/" imports so `node --test` can load this file.

/** Plans shown per page in the history list. */
export const HISTORY_PAGE_SIZE = 20;

export interface WeeklyPlanHistoryItem {
  id: string;
  created_at: string;
  updated_at: string;
  estimated_total_cop: number;
  product_count: number;
  estimated_daily_kcal: number;
  is_current: boolean;
}

export interface WeeklyPlanHistoryPage {
  items: WeeklyPlanHistoryItem[];
  hasMore: boolean;
}

/**
 * Offset pagination, ordered by created_at desc, id desc (id breaks ties).
 * Future improvement: cursor pagination (created_at, id), so that deleting a
 * plan while paging cannot skip a row. Not needed today: the app has no way
 * to delete a single plan.
 *
 * Inclusive row range for `.range(from, to)`. It asks for one row more than
 * a page (21): if that extra row arrives, there is another page.
 */
export function historyPageRange(page: number): { from: number; to: number } {
  const from = Math.max(0, Math.floor(page)) * HISTORY_PAGE_SIZE;
  return { from, to: from + HISTORY_PAGE_SIZE };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Whole number (rejects strings, NaN, null and decimals). */
function isWholeNumber(value: unknown): value is number {
  return Number.isInteger(value);
}

function toItem(
  raw: unknown,
  isCurrent: boolean,
): WeeklyPlanHistoryItem | null {
  if (!isRecord(raw)) return null;

  const { id, created_at, updated_at } = raw;
  const total = raw.estimated_total_cop;
  const kcal = raw.estimated_daily_kcal;
  const count = raw.shopping_item_count;

  // Same rules as weeklyPlanSchema.ts: whole numbers, total >= 0, kcal > 0,
  // at least 1 product.
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(created_at) ||
    !isWholeNumber(total) ||
    total < 0 ||
    !isWholeNumber(kcal) ||
    kcal <= 0 ||
    !isWholeNumber(count) ||
    count < 1
  ) {
    return null;
  }

  return {
    id,
    created_at,
    updated_at: isNonEmptyString(updated_at) ? updated_at : created_at,
    estimated_total_cop: total,
    product_count: count,
    estimated_daily_kcal: kcal,
    is_current: isCurrent,
  };
}

/**
 * Turns the rows of one page (up to HISTORY_PAGE_SIZE + 1, newest first) into
 * list items. Rows without valid numbers are skipped. Only the very first row
 * of page 0 is the current plan; if that row is invalid, nothing is current.
 */
export function mapHistoryRows(
  rows: readonly unknown[] | null | undefined,
  page: number,
): WeeklyPlanHistoryPage {
  if (!rows?.length) {
    return { items: [], hasMore: false };
  }

  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  const items = rows
    .slice(0, HISTORY_PAGE_SIZE)
    .map((raw, index) => toItem(raw, page === 0 && index === 0))
    .filter((item): item is WeeklyPlanHistoryItem => item !== null);

  return { items, hasMore };
}

/**
 * True when the query failed because a column does not exist yet (migration
 * 009 not applied): Postgres 42703, PostgREST PGRST204 or "does not exist".
 */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42703" || code === "PGRST204" || message.includes("does not exist")
  );
}

/**
 * Adds the next page after the plans already shown, skipping ids already in
 * the list (if a new plan is saved meanwhile, rows shift by one between pages).
 */
export function appendUnique<T extends { id: string }>(
  current: readonly T[],
  next: readonly T[],
): T[] {
  const seen = new Set(current.map((item) => item.id));
  const result = [...current];
  for (const item of next) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
