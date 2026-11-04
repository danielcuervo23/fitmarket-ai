import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { root } from "./testData.mjs";

// The command line wrapper: no network is touched (no Supabase variables are set).

const cli = path.join(root, "scripts/prices/manual/import.ts");
const today = new Date().toISOString().slice(0, 10);
const carulla = readFileSync(path.join(root, "data/store-products/Carulla.json"), "utf8");

function setup(fileJson) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "manual-import-"));
  writeFileSync(path.join(dir, "Carulla.json"), carulla);
  const file = path.join(dir, `precios-carulla-${today}.json`);
  writeFileSync(file, JSON.stringify(fileJson));
  return { dir, file };
}

function run(args, dir, extraEnv = {}) {
  const env = { ...process.env, PRICES_MAPPINGS_DIR: dir, ...extraEnv };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });
}

const valid = () => ({
  schemaVersion: 2,
  store: "Carulla",
  city: "bucaramanga",
  capturedOn: today,
  cityAttested: true,
  entries: [
    {
      foodId: "pasta",
      externalId: "77001",
      name: "Pasta Doria spaghetti 500 g",
      packSize: 500,
      url: "https://www.carulla.com/pasta-doria-spaghetti-500-g/p",
      regularPriceCop: 3900,
      observedOn: today,
      packConfirmed: true,
    },
  ],
});

test("without files the command explains its usage and exits 2", () => {
  const { dir } = setup(valid());
  const r = run([], dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage/);
});

test("an unknown option exits 2", () => {
  const { dir, file } = setup(valid());
  assert.equal(run(["--force", file], dir).status, 2);
});

test("--write without the Supabase variables exits 2 and names them", () => {
  const { dir, file } = setup(valid());
  const r = run(["--write", file], dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /SUPABASE_URL/);
  assert.equal(readFileSync(path.join(dir, "Carulla.json"), "utf8"), carulla);
});

test("a dry run prints a summary and changes nothing", () => {
  const { dir, file } = setup(valid());
  const r = run([file], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/i);
  assert.match(r.stdout, /Carulla: \+1 food/);
  assert.equal(readFileSync(path.join(dir, "Carulla.json"), "utf8"), carulla);
});

test("--mappings-only updates the store mapping file and writes no prices", () => {
  const { dir, file } = setup(valid());
  const r = run(["--mappings-only", file], dir);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(readFileSync(path.join(dir, "Carulla.json"), "utf8"));
  assert.deepEqual(
    after.map((m) => m.foodId),
    ["arroz_blanco", "papa", "pasta"],
  );
});

test("an invalid file exits 1 and changes nothing", () => {
  const { dir, file } = setup({ ...valid(), cityAttested: false });
  const r = run(["--mappings-only", file], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cityAttested/);
  assert.equal(readFileSync(path.join(dir, "Carulla.json"), "utf8"), carulla);
});

test("the service role key is never printed", () => {
  const { dir, file } = setup({ ...valid(), cityAttested: false });
  const r = run(["--write", file], dir, { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "sekret-123" });
  assert.equal(r.status, 1);
  assert.ok(!`${r.stdout}${r.stderr}`.includes("sekret-123"));
});

test("a pack typed by hand is refused unless --allow-unconfirmed-pack is given", () => {
  const typed = valid();
  typed.entries[0].packConfirmed = false;
  const { dir, file } = setup(typed);
  const r = run(["--mappings-only", file], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--allow-unconfirmed-pack/);
  assert.equal(readFileSync(path.join(dir, "Carulla.json"), "utf8"), carulla);
  assert.equal(run(["--mappings-only", "--allow-unconfirmed-pack", file], dir).status, 0);
});

test("a pack change is refused unless --allow-pack-change is given", () => {
  const changed = valid();
  Object.assign(changed.entries[0], {
    foodId: "arroz_blanco",
    externalId: "445117",
    url: "https://www.carulla.com/arroz-diana-500-gr-479512/p",
    packSize: 1000,
    regularPriceCop: 5000,
  });
  const { dir, file } = setup(changed);
  const r = run(["--mappings-only", file], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--allow-pack-change/);
  const ok = run(["--mappings-only", "--allow-pack-change", file], dir);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /pack size changed/);
});

test("--allow-price-outlier is an accepted option", () => {
  const { dir, file } = setup(valid());
  assert.equal(run(["--allow-price-outlier", file], dir).status, 0);
});
