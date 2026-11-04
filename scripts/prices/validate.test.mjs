import assert from "node:assert/strict";
import test from "node:test";
import { checkPrice } from "./validate.ts";

test("rejects prices outside 50..5 000 000", () => {
  assert.deepEqual(checkPrice(49, null), { ok: false, reason: "out_of_range" });
  assert.deepEqual(checkPrice(5_000_001, null), { ok: false, reason: "out_of_range" });
  assert.deepEqual(checkPrice(50, null), { ok: true });
  assert.deepEqual(checkPrice(5_000_000, null), { ok: true });
});

test("rejects non integers and non finite numbers", () => {
  assert.deepEqual(checkPrice(3.5, null), { ok: false, reason: "out_of_range" });
  assert.deepEqual(checkPrice(Number.NaN, null), { ok: false, reason: "out_of_range" });
  assert.deepEqual(checkPrice(Number.POSITIVE_INFINITY, null), { ok: false, reason: "out_of_range" });
  assert.deepEqual(checkPrice("9000", null), { ok: false, reason: "out_of_range" });
});

test("rejects jumps beyond x0.5 and x2 of the last known price", () => {
  assert.deepEqual(checkPrice(9000, 4000), { ok: false, reason: "jump" });
  assert.deepEqual(checkPrice(1900, 4000), { ok: false, reason: "jump" });
  assert.deepEqual(checkPrice(7900, 4000), { ok: true });
  assert.deepEqual(checkPrice(8000, 4000), { ok: true });
  assert.deepEqual(checkPrice(2000, 4000), { ok: true });
});
