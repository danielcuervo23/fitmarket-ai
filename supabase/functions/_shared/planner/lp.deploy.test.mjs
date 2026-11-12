// Guards the deploy wiring of the LP solver: the Edge Function must import the
// same highs version the tests use, and must ship highs.wasm as a static file.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("generate-weekly-plan deno.json imports the highs version pinned in package.json", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const deno = JSON.parse(await read("supabase/functions/generate-weekly-plan/deno.json"));
  assert.match(pkg.dependencies.highs, /^\d+\.\d+\.\d+$/, "exact version");
  assert.equal(deno.imports.highs, `npm:highs@${pkg.dependencies.highs}`);
});

test("supabase/config.toml ships highs.wasm with generate-weekly-plan", async () => {
  const toml = await read("supabase/config.toml");
  const section = toml.split(/^\[/m).find((s) => s.startsWith("functions.generate-weekly-plan]"));
  assert.ok(section, "[functions.generate-weekly-plan] section");
  assert.match(section, /static_files\s*=\s*\[[^\]]*"\.\/functions\/generate-weekly-plan\/highs\.wasm"[^\]]*\]/);
});

test("the wasm copy script takes the file from the installed highs package", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.match(pkg.scripts["functions:wasm"], /node_modules\/highs\/build\/highs\.wasm/);
  assert.match(pkg.scripts["functions:wasm"], /supabase\/functions\/generate-weekly-plan\/highs\.wasm/);
  const ignore = await read(".gitignore");
  assert.match(ignore, /^supabase\/functions\/generate-weekly-plan\/highs\.wasm$/m);
});
