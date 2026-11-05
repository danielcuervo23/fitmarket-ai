// The generated recipe library (supabase/functions/_shared/recipes/library.generated.ts)
// must always match data/recipes. Fix a recipe, then run: node scripts/recipes/build-library.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GENERATED_PATH, loadLibrary } from "./build-library.ts";
import { buildLibraryModule } from "./libraryModule.ts";
import { RECIPES, RECIPE_LIBRARY_VERSION } from "../../supabase/functions/_shared/recipes/library.generated.ts";

const loadAll = () => {
  const { recipes, errors } = loadLibrary();
  assert.deepEqual(errors, []);
  return recipes;
};

test("library.generated.ts is in sync with data/recipes", () => {
  assert.equal(buildLibraryModule(loadAll()), readFileSync(GENERATED_PATH, "utf8").replaceAll("\r\n", "\n"));
});

test("the module does not depend on the order of the files", () => {
  const recipes = loadAll();
  assert.equal(buildLibraryModule([...recipes].reverse()), buildLibraryModule(recipes));
});

test("RECIPES is sorted by id and holds every recipe file", () => {
  const ids = RECIPES.map((recipe) => recipe.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.deepEqual(RECIPES, [...loadAll()].sort((a, b) => (a.id < b.id ? -1 : 1)));
});

test("RECIPE_LIBRARY_VERSION is the first 12 hex chars of the SHA-256 of the sorted JSON", () => {
  const expected = createHash("sha256").update(JSON.stringify(RECIPES)).digest("hex").slice(0, 12);
  assert.match(RECIPE_LIBRARY_VERSION, /^[0-9a-f]{12}$/);
  assert.equal(RECIPE_LIBRARY_VERSION, expected);
});

test("the version changes when a recipe changes", () => {
  const recipes = loadAll();
  const changed = recipes.map((recipe, index) => (index === 0 ? { ...recipe, minutes: recipe.minutes + 1 } : recipe));
  const version = (source) => source.match(/RECIPE_LIBRARY_VERSION = "([0-9a-f]{12})"/)[1];
  assert.notEqual(version(buildLibraryModule(changed)), version(buildLibraryModule(recipes)));
});

test("an invalid recipe folder gives every error and no recipes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "recipes-"));
  try {
    writeFileSync(path.join(dir, "malo.json"), "{ not json");
    writeFileSync(path.join(dir, "otro.json"), JSON.stringify({ id: "otro" }));
    const { recipes, errors } = loadLibrary(dir);
    assert.deepEqual(recipes, []);
    assert.ok(errors.some((error) => /malo\.json/.test(error)), errors.join("\n"));
    assert.ok(errors.some((error) => /otro/.test(error)), errors.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
