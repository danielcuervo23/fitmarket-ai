// Static checks on migrations 010 and 011 (cities, profile city, food catalog,
// store products and prices). They read the SQL as text; the live checks
// against a real database are in supabase/tests/catalog_checks.sql.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) =>
  readFileSync(path.join(root, "supabase", "migrations", name), "utf8")
    .toLowerCase()
    .replace(/\s+/g, " ");

const m010 = read("010_cities_and_profile_city.sql");
const m011 = read("011_food_catalog_and_prices.sql");
const all = `${m010} ${m011}`;

const policies = [...all.matchAll(/create policy [^;]*;/g)].map((m) => m[0]);

test("every new table has RLS enabled", () => {
  for (const table of ["cities", "foods", "store_products", "prices"]) {
    assert.ok(
      all.includes(`alter table public.${table} enable row level security`),
      `${table} must enable RLS`,
    );
  }
});

test("only select policies, only for authenticated", () => {
  assert.equal(policies.length, 4);
  for (const p of policies) {
    assert.match(p, /for select/);
    assert.match(p, /to authenticated/);
    assert.doesNotMatch(p, /for (insert|update|delete|all)/);
  }
});

test("anon and authenticated lose default privileges", () => {
  const revokes = [...all.matchAll(/revoke all on [^;]*;/g)].map((m) => m[0]).join(" ");
  for (const t of ["cities", "foods", "store_products", "prices", "current_prices"]) {
    assert.ok(revokes.includes(`public.${t}`), `revoke must list ${t}`);
  }
  assert.match(revokes, /from anon, authenticated/);
  assert.match(all, /grant select on [^;]*public\.current_prices[^;]* to authenticated/);
});

test("current_prices view is security invoker", () => {
  assert.match(m011, /create or replace view public\.current_prices with \(security_invoker = true\)/);
});

test("profile city is nullable and references cities", () => {
  const line = m010.match(/add column if not exists city text references public\.cities[^,;]*/);
  assert.ok(line, "profiles.city column missing");
  assert.doesNotMatch(line[0], /not null/);
  assert.match(line[0], /on delete set null/);
});

test("prices lookups are indexed and idempotent", () => {
  assert.match(m011, /unique \(store_product_id, city, source, observed_on\)/);
  assert.match(m011, /create index if not exists prices_city_product_date_idx on public\.prices \(city, store_product_id, observed_on desc\)/);
  assert.match(m011, /create index if not exists store_products_food_id_idx/);
});

test("migrations are idempotent", () => {
  for (const t of all.matchAll(/create table (?!if not exists)/g)) {
    assert.fail(`create table without if not exists at ${t.index}`);
  }
  for (const p of policies) {
    const name = p.match(/create policy ("[^"]+"|\S+) on (\S+)/);
    assert.ok(
      all.includes(`drop policy if exists ${name[1]} on ${name[2]}`),
      `missing drop policy if exists for ${name[1]}`,
    );
  }
});

test("catalog constraints match the contract", () => {
  assert.match(m010, /check \(slug ~ '\^\[a-z_\]\{2,40\}\$'\)/);
  assert.match(m010, /'bucaramanga', 'bucaramanga', 1|'bucaramanga'/);
  assert.match(m011, /fiber_g <= carbs_g/);
  assert.match(m011, /free_sugars_g <= carbs_g/);
  assert.match(m011, /sat_fat_g <= fat_g/);
  assert.match(m011, /unit <> 'unit' or grams_per_unit is not null/);
  assert.match(m011, /source in \('official', 'user', 'estimate'\)/);
  assert.match(m011, /url ~ '\^https:\/\/'/);
  assert.match(m011, /set search_path = ''/);
});
