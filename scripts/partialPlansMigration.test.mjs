// Static checks on migration 016 ("Quiero el plan igual" reuse). Reads the SQL as text.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MAX_PARTIAL_WEEK_CHARS } from "../supabase/functions/_shared/partialPlanStore.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(root, "supabase", "migrations");
const migrationPath = path.join(migrations, "016_partial_plan_results.sql");
const checksPath = path.join(root, "supabase", "tests", "partial_plan_results_checks.sql");

const readSql = (file) =>
  readFileSync(file, "utf8").replace(/--[^\n]*/g, " ").toLowerCase().replace(/\s+/g, " ");

test("016 is the only migration with its number", () => {
  assert.deepEqual(readdirSync(migrations).filter((f) => f.startsWith("016_")), ["016_partial_plan_results.sql"]);
});

test("016 creates one row per user, cascading with the account, with bounded columns", () => {
  const sql = readSql(migrationPath);
  assert.match(sql, /create table if not exists public\.partial_plan_results \(/);
  assert.match(sql, /user_id uuid primary key references auth\.users \(id\) on delete cascade/);
  assert.match(sql, /fingerprint text not null check \(fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /week jsonb not null check \(jsonb_typeof\(week\) = 'object' and octet_length\(week::text\) <= (\d+)\)/);
  assert.equal(Number(sql.match(/octet_length\(week::text\) <= (\d+)/)[1]), MAX_PARTIAL_WEEK_CHARS);
  assert.match(sql, /expires_at timestamptz not null/);
  assert.match(sql, /check \(expires_at <= created_at \+ interval '1 hour'\)/);
});

test("016 lets users only read and delete their own row; nobody but the service role writes", () => {
  const sql = readSql(migrationPath);
  assert.match(sql, /alter table public\.partial_plan_results enable row level security/);
  assert.match(sql, /for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /for delete to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(sql, /for (insert|update|all)/);
  assert.match(sql, /revoke all on table public\.partial_plan_results from anon/);
  assert.match(sql, /revoke insert, update, truncate, references, trigger on table public\.partial_plan_results from authenticated/);
});

test("016 stores no health or body data columns", () => {
  const sql = readSql(migrationPath);
  assert.doesNotMatch(sql, /\b(age|weight|height|sex|health|budget|restriction)\w*\s+(int|text|numeric|smallint|jsonb)/);
});

test("the staging check script runs inside a rolled-back transaction", () => {
  assert.ok(existsSync(checksPath));
  const sql = readSql(checksPath);
  assert.match(sql, /^ ?begin;/);
  assert.match(sql, /rollback; ?$/);
  assert.match(sql, /partial_plan_results/);
});
