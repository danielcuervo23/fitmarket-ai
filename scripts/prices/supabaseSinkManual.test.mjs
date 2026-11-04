import assert from "node:assert/strict";
import test from "node:test";
import { createSinkFromClient } from "./supabaseSink.ts";

// The two calls the manual importer adds to the weekly sink. No network: a fake client records the query.

function fakeClient(data = []) {
  const log = [];
  return {
    log,
    from(table) {
      const step = { table, filters: [] };
      log.push(step);
      const q = {
        select(cols) {
          step.select = cols;
          return q;
        },
        update(values) {
          step.update = values;
          return q;
        },
        eq(col, val) {
          step.filters.push(["eq", col, val]);
          return q;
        },
        in(col, vals) {
          step.filters.push(["in", col, vals]);
          return q;
        },
        gte(col, val) {
          step.filters.push(["gte", col, val]);
          return q;
        },
        then: (resolve) => resolve({ data, error: null }),
      };
      return q;
    },
  };
}

test("existingPrices reads official Bucaramanga prices since a day, keyed by product and day", async () => {
  const client = fakeClient([{ store_product_id: 7, observed_on: "2026-11-04", regular_price_cop: 3900 }]);
  const out = await createSinkFromClient(client).existingPrices([7], "bucaramanga", "2026-09-20");
  assert.deepEqual([...out], [["7:2026-11-04", 3900]]);
  assert.equal(client.log[0].table, "prices");
  assert.deepEqual(client.log[0].filters, [
    ["eq", "city", "bucaramanga"],
    ["eq", "source", "official"],
    ["gte", "observed_on", "2026-09-20"],
    ["in", "store_product_id", [7]],
  ]);
});

test("deactivateProducts only sets is_active false on the given store products", async () => {
  const client = fakeClient();
  await createSinkFromClient(client).deactivateProducts([3, 4]);
  assert.equal(client.log[0].table, "store_products");
  assert.deepEqual(client.log[0].update, { is_active: false });
  assert.deepEqual(client.log[0].filters, [["in", "id", [3, 4]]]);
});

test("deactivateProducts with no ids does not touch the database", async () => {
  const client = fakeClient();
  await createSinkFromClient(client).deactivateProducts([]);
  assert.deepEqual(client.log, []);
});
