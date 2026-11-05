// Static checks on migration 015 (cooking preferences). Reads the SQL as text.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APPLIANCES, COOKING_LEVELS } from "../supabase/functions/_shared/recipes/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase", "migrations", "015_cooking_preferences.sql");
const checksPath = path.join(root, "supabase", "tests", "cooking_prefs_checks.sql");

function readSql(file) {
  return readFileSync(file, "utf8")
    .replace(/--[^\n]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const COLUMNS = ["cooking_weekday_minutes", "cooking_level", "kitchen_appliances", "batch_cooking"];

test("015 adds four nullable columns with checks and no default", () => {
  const sql = readSql(migrationPath);
  assert.match(sql, /alter table public\.profiles/);
  assert.match(sql, /add column if not exists cooking_weekday_minutes smallint check \(cooking_weekday_minutes in \(10, 20, 30\)\)/);
  assert.match(sql, /add column if not exists cooking_level text check \(cooking_level in \(/);
  assert.match(sql, /add column if not exists kitchen_appliances text\[\] check \(/);
  assert.match(sql, /cardinality\(kitchen_appliances\) between 1 and 8/);
  assert.match(sql, /add column if not exists batch_cooking boolean[,;]/);
  assert.doesNotMatch(sql, /\bdefault\b/);
  assert.doesNotMatch(sql, /not null/);
  for (const column of COLUMNS) {
    assert.match(sql, new RegExp(`comment on column public\.profiles\.${column} is '[^']+'`), column);
  }
});

test("015 checks list exactly the allowed values of recipes/types.ts", () => {
  const sql = readSql(migrationPath);
  const levels = sql.match(/check \(cooking_level in \(([^)]*)\)\)/)[1];
  assert.deepEqual([...levels.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...COOKING_LEVELS]);
  const appliances = sql.match(/kitchen_appliances <@ array\[([^\]]*)\]::text\[\]/)[1];
  assert.deepEqual([...appliances.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...APPLIANCES]);
  assert.ok(sql.includes(`between 1 and ${APPLIANCES.length})`));
});

test("015 creates no policy, grant or table and does not add health data", () => {
  const sql = readSql(migrationPath);
  assert.doesNotMatch(sql, /create (table|policy|function|view)/);
  assert.doesNotMatch(sql, /\b(grant|revoke)\b/);
  assert.doesNotMatch(sql, /drop /);
  assert.doesNotMatch(sql, /health|condition|diabet|kidney|pregnan/);
});

test("the staging check script rejects bad values inside a rolled-back transaction", () => {
  assert.ok(existsSync(checksPath));
  const sql = readSql(checksPath);
  assert.match(sql, /^ ?begin;/);
  assert.match(sql, /rollback; ?$/);
  assert.match(sql, /cooking_weekday_minutes = 15/);
  assert.match(sql, /kitchen_appliances = array\['fogon'\]/);
  assert.match(sql, /set cooking_weekday_minutes = null/);
});
