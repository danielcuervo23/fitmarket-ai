import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSinkFromClient } from "./supabaseSink.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

// Records what the sink asks the database; no network.
function fakeClient({ upsertData, selectData, error = null } = {}) {
  const log = [];
  const client = {
    from(table) {
      const step = { table };
      log.push(step);
      const chain = {
        upsert(rows, options) {
          step.upsert = { rows, options };
          return {
            select: async (cols) => {
              step.select = cols;
              return { data: upsertData ?? [], error };
            },
            then: (resolve) => resolve({ error }),
          };
        },
        select(cols) {
          step.select = cols;
          step.filters = [];
          const q = {
            eq(col, val) {
              step.filters.push(["eq", col, val]);
              return q;
            },
            in(col, vals) {
              step.filters.push(["in", col, vals]);
              return q;
            },
            then: (resolve) => resolve({ data: selectData ?? [], error }),
          };
          return q;
        },
      };
      return chain;
    },
  };
  return { client, log };
}

const p = { storeId: "Exito", foodId: "arroz", externalId: "9", name: "Arroz", packSize: 500, url: "https://www.exito.com/a/p" };

test("upsertProducts writes snake_case rows keyed by store and external id and returns the id map", async () => {
  const { client, log } = fakeClient({ upsertData: [{ id: 7, store_id: "Exito", external_id: "9" }] });
  const ids = await createSinkFromClient(client).upsertProducts([p]);
  assert.equal(log[0].table, "store_products");
  assert.deepEqual(log[0].upsert.rows, [
    { store_id: "Exito", food_id: "arroz", external_id: "9", name: "Arroz", pack_size: 500, url: "https://www.exito.com/a/p", is_active: true },
  ]);
  assert.equal(log[0].upsert.options.onConflict, "store_id,external_id");
  assert.deepEqual([...ids], [["Exito:9", 7]]);
});

test("findProductIds only reads", async () => {
  const { client, log } = fakeClient({ selectData: [{ id: 7, store_id: "Exito", external_id: "9" }] });
  const ids = await createSinkFromClient(client).findProductIds([p]);
  assert.equal(log[0].upsert, undefined);
  assert.equal(ids.get("Exito:9"), 7);
});

test("upsertPrices writes official prices and is idempotent per day", async () => {
  const { client, log } = fakeClient();
  await createSinkFromClient(client).upsertPrices([
    { storeProductId: 7, city: "bucaramanga", regularPriceCop: 5000, observedOn: "2026-11-09" },
  ]);
  assert.equal(log[0].table, "prices");
  assert.deepEqual(log[0].upsert.rows, [
    { store_product_id: 7, city: "bucaramanga", source: "official", regular_price_cop: 5000, observed_on: "2026-11-09" },
  ]);
  assert.equal(log[0].upsert.options.onConflict, "store_product_id,city,source,observed_on");
});

test("lastPrices reads current_prices by city and ids", async () => {
  const { client, log } = fakeClient({ selectData: [{ store_product_id: 7, regular_price_cop: 4000 }] });
  const last = await createSinkFromClient(client).lastPrices([7], "bucaramanga");
  assert.equal(log[0].table, "current_prices");
  assert.deepEqual(log[0].filters, [["eq", "city", "bucaramanga"], ["in", "store_product_id", [7]]]);
  assert.equal(last.get(7), 4000);
});

test("lastPrices with no ids does not query", async () => {
  const { client, log } = fakeClient();
  assert.equal((await createSinkFromClient(client).lastPrices([], "bucaramanga")).size, 0);
  assert.equal(log.length, 0);
});

test("a database error is thrown without echoing credentials", async () => {
  const { client } = fakeClient({ error: { message: "permission denied" } });
  await assert.rejects(
    createSinkFromClient(client).upsertPrices([{ storeProductId: 1, city: "bucaramanga", regularPriceCop: 100, observedOn: "2026-11-09" }]),
    /permission denied/,
  );
});

test("main exits with code 2 and a clear message when the secrets are missing", () => {
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const res = spawnSync(process.execPath, [path.join(here, "main.ts"), "--dry-run"], { env, encoding: "utf8" });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /SUPABASE_URL/);
  assert.match(res.stderr, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("main never prints the secret values", () => {
  const env = { ...process.env, SUPABASE_URL: "not-a-url-SECRETURLVALUE", SUPABASE_SERVICE_ROLE_KEY: "SECRETKEYVALUE" };
  const res = spawnSync(process.execPath, [path.join(here, "main.ts"), "--dry-run"], { env, encoding: "utf8" });
  assert.equal(res.status, 2);
  assert.ok(!(res.stdout + res.stderr).includes("SECRET"));
});
