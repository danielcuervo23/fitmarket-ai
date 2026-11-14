// Guards the deploy wiring of the LP solver: the Edge Function must import the
// same highs version the tests use, and must ship highs.wasm as a static file.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const fnSection = async () => {
  const toml = await read("supabase/config.toml");
  return toml.split(/^\[/m).find((s) => s.startsWith("functions.generate-weekly-plan]"));
};

test("generate-weekly-plan deno.json imports the highs version pinned in package.json", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const deno = JSON.parse(await read("supabase/functions/generate-weekly-plan/deno.json"));
  assert.match(pkg.dependencies.highs, /^\d+\.\d+\.\d+$/, "exact version");
  assert.equal(deno.imports.highs, `npm:highs@${pkg.dependencies.highs}`);
});

test("the installed highs is the version pinned in package.json", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const installed = JSON.parse(await read("node_modules/highs/package.json"));
  assert.equal(installed.version, pkg.dependencies.highs);
});

test("supabase/config.toml ships highs.wasm with generate-weekly-plan", async () => {
  const section = await fnSection();
  assert.ok(section, "[functions.generate-weekly-plan] section");
  assert.match(section, /static_files\s*=\s*\[[^\]]*"\.\/functions\/generate-weekly-plan\/highs\.wasm"[^\]]*\]/);
});

test("supabase/config.toml keeps JWT verification on for generate-weekly-plan", async () => {
  const section = await fnSection();
  assert.match(section, /^verify_jwt\s*=\s*true\s*$/m);
  assert.doesNotMatch(await read("supabase/config.toml"), /verify_jwt\s*=\s*false/);
});

test("the wasm copy runs the checked script, and the deploy helper copies before deploying", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["functions:wasm"], "node scripts/functions/copyHighsWasm.mjs");
  const deploy = pkg.scripts["deploy:plan-fn"];
  assert.match(deploy, /^npm run functions:wasm && supabase functions deploy generate-weekly-plan$/);
  const ignore = await read(".gitignore");
  assert.match(ignore, /^supabase\/functions\/generate-weekly-plan\/highs\.wasm$/m);
});

test("deploy docs copy the wasm first and never use --use-api", async () => {
  for (const doc of ["README.md", "docs/ROLLOUT-plan-2.md"]) {
    const text = await read(doc);
    assert.match(text, /npm ci && npm run functions:wasm/, doc);
    // a deploy command that passes the flag (prose saying "never --use-api" is fine)
    assert.doesNotMatch(text, /deploy generate-weekly-plan[^\n`(]*--use-api/, doc);
  }
});

test("ROLLOUT records the sha256 of the installed highs.wasm", async () => {
  const bytes = await readFile(new URL("node_modules/highs/build/highs.wasm", root));
  const sha = createHash("sha256").update(bytes).digest("hex");
  assert.ok((await read("docs/ROLLOUT-plan-2.md")).includes(sha), sha);
});
