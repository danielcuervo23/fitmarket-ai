// Static checks on migration 013 (city_reference_prices). Reads the SQL as text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase", "migrations", "013_city_reference_prices.sql"), "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ");

test("table shape: keys, checks and references", () => {
  assert.match(sql, /create table if not exists public\.city_reference_prices/);
  assert.match(sql, /city text not null references public\.cities \(slug\)/);
  assert.match(sql, /food_id text not null references public\.foods \(id\)/);
  assert.match(sql, /price_cop_per_unit numeric\(\d+,\d+\) not null check \(price_cop_per_unit > 0\)/);
  assert.match(sql, /observed_on date not null/);
  assert.match(sql, /source text not null check \(source = 'dane_sipsa'\)/);
  assert.match(sql, /primary key \(city, food_id, source\)/);
});

test("the foreign key on food_id is indexed", () => {
  assert.match(sql, /create index if not exists city_reference_prices_food_id_idx on public\.city_reference_prices \(food_id\)/);
});

test("RLS on, only a select policy for authenticated, no write access", () => {
  assert.match(sql, /alter table public\.city_reference_prices enable row level security/);
  const policies = [...sql.matchAll(/create policy [^;]*;/g)].map((m) => m[0]);
  assert.equal(policies.length, 1);
  assert.match(policies[0], /for select to authenticated using \(true\)/);
  assert.match(sql, /revoke all on public\.city_reference_prices from anon, authenticated/);
  assert.match(sql, /grant select on public\.city_reference_prices to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)/);
});

test("idempotent: policy is dropped before it is created", () => {
  assert.match(sql, /drop policy if exists "city_reference_prices_select_authenticated" on public\.city_reference_prices/);
});
