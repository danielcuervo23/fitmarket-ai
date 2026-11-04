import assert from "node:assert/strict";
import {
  appendUnique,
  HISTORY_PAGE_SIZE,
  historyPageRange,
  isMissingColumnError,
  mapHistoryRows,
} from "./weeklyPlansHistory.ts";

const row = (n, overrides = {}) => ({
  id: `plan-${n}`,
  created_at: `2026-10-${String(n).padStart(2, "0")}T10:00:00Z`,
  updated_at: `2026-10-${String(n).padStart(2, "0")}T10:00:00Z`,
  estimated_total_cop: 180000,
  estimated_daily_kcal: 2100,
  shopping_item_count: 24,
  ...overrides,
});

// --- Paginado: 20 por página, se piden 21 para saber si hay más ---
assert.equal(HISTORY_PAGE_SIZE, 20);
assert.deepEqual(historyPageRange(0), { from: 0, to: 20 }, "page 0 asks rows 0..20 (21 rows)");
assert.deepEqual(historyPageRange(1), { from: 20, to: 40 }, "page 1 starts at row 20");
assert.deepEqual(historyPageRange(2), { from: 40, to: 60 });

// --- Mapeo de filas a elementos ---
{
  const { items, hasMore } = mapHistoryRows([row(3), row(2), row(1)], 0);
  assert.equal(hasMore, false, "3 rows: no more pages");
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    id: "plan-3",
    created_at: "2026-10-03T10:00:00Z",
    updated_at: "2026-10-03T10:00:00Z",
    estimated_total_cop: 180000,
    product_count: 24,
    estimated_daily_kcal: 2100,
    is_current: true,
  });
  assert.equal(items[1].is_current, false);
  assert.equal(items[2].is_current, false);
}

{
  // 21 rows came back: there is another page, and the 21st is not shown.
  const rows = Array.from({ length: 21 }, (_, i) => row(i + 1));
  const { items, hasMore } = mapHistoryRows(rows, 0);
  assert.equal(hasMore, true);
  assert.equal(items.length, 20);
  assert.equal(items.at(-1).id, "plan-20", "the extra 21st row is only a probe");
}

{
  // Exactly 20 rows: this is the last page.
  const rows = Array.from({ length: 20 }, (_, i) => row(i + 1));
  const { items, hasMore } = mapHistoryRows(rows, 0);
  assert.equal(hasMore, false);
  assert.equal(items.length, 20);
}

{
  // On later pages nothing is "current", not even the first row.
  const { items } = mapHistoryRows([row(5), row(4)], 1);
  assert.equal(items[0].is_current, false);
  assert.equal(items[1].is_current, false);
}

{
  // Rows without valid data are skipped (like buildHistorySummary did).
  const rows = [
    row(9),
    row(8, { estimated_total_cop: undefined }),
    row(7, { estimated_daily_kcal: null }),
    row(6, { shopping_item_count: null }),
    row(5, { estimated_total_cop: "180000" }),
    row(4, { estimated_daily_kcal: Number.NaN }),
    row(3, { estimated_total_cop: -1 }),
    row(2, { estimated_daily_kcal: 0 }),
    row(1, { shopping_item_count: 0 }),
    row(10, { shopping_item_count: 2.5 }),
    // The plan schema requires whole numbers for both summary values.
    row(13, { estimated_total_cop: 180000.5 }),
    row(14, { estimated_daily_kcal: 2100.25 }),
    row(11, { id: null }),
    row(12, { created_at: undefined }),
    null,
    "junk",
  ];
  const { items, hasMore } = mapHistoryRows(rows, 0);
  assert.deepEqual(items.map((i) => i.id), ["plan-9"]);
  assert.equal(hasMore, false);
}

{
  // The latest plan is "current" only if it is the first row; if the first
  // row is invalid and skipped, the next one must not become "current".
  const { items } = mapHistoryRows([row(2, { estimated_total_cop: null }), row(1)], 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].is_current, false);
}

{
  // A missing updated_at falls back to created_at instead of dropping the row.
  const { items } = mapHistoryRows([row(1, { updated_at: null })], 0);
  assert.equal(items[0].updated_at, "2026-10-01T10:00:00Z");
}

{
  // Empty / null input.
  assert.deepEqual(mapHistoryRows([], 0), { items: [], hasMore: false });
  assert.deepEqual(mapHistoryRows(null, 0), { items: [], hasMore: false });
}

// --- Detectar que la migración 009 aún no está aplicada ---
assert.equal(
  isMissingColumnError({ code: "42703", message: "column weekly_plans.shopping_item_count does not exist" }),
  true,
);
assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the column" }), true);
assert.equal(isMissingColumnError({ message: "column shopping_item_count does not exist" }), true);
assert.equal(isMissingColumnError({ code: "42501", message: "permission denied" }), false);
assert.equal(isMissingColumnError({ message: "Failed to fetch" }), false);
assert.equal(isMissingColumnError(null), false);

// --- Añadir la página siguiente sin repetir planes ya mostrados ---
{
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" }, d = { id: "d" };
  const shown = [a, b];
  assert.deepEqual(appendUnique(shown, [b, c, d]), [a, b, c, d], "b was already shown");
  assert.deepEqual(shown, [a, b], "does not mutate the current list");
  assert.deepEqual(appendUnique([], [c, c]), [c], "duplicates inside the new page too");
  assert.deepEqual(appendUnique([a], []), [a]);
}
