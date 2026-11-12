import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyHighsWasm, HIGHS_WASM_DEST, HIGHS_WASM_SOURCE } from "./copyHighsWasm.mjs";

const withTmp = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), "highs-wasm-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

test("copies the wasm file into the function folder", () =>
  withTmp(async (dir) => {
    const src = join(dir, "highs.wasm");
    await writeFile(src, new Uint8Array([0, 97, 115, 109]));
    const dest = join(dir, "fn", "highs.wasm");
    await copyHighsWasm(src, dest);
    assert.deepEqual([...(await readFile(dest))], [0, 97, 115, 109]);
  }));

test("a missing source fails loudly and says how to fix it", () =>
  withTmp(async (dir) => {
    await assert.rejects(copyHighsWasm(join(dir, "nope.wasm"), join(dir, "out.wasm")), (e) => {
      assert.match(e.message, /highs\.wasm not found/);
      assert.match(e.message, /npm ci/);
      return true;
    });
  }));

test("an empty source file is rejected", () =>
  withTmp(async (dir) => {
    const src = join(dir, "highs.wasm");
    await writeFile(src, new Uint8Array());
    await assert.rejects(copyHighsWasm(src, join(dir, "out.wasm")), /empty/);
  }));

test("default paths go from node_modules/highs to the generate-weekly-plan folder", () => {
  assert.equal(HIGHS_WASM_SOURCE, "node_modules/highs/build/highs.wasm");
  assert.equal(HIGHS_WASM_DEST, "supabase/functions/generate-weekly-plan/highs.wasm");
});
