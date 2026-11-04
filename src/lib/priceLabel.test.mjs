import assert from "node:assert/strict";
import { test } from "node:test";
import { hasApproximatePrices, priceLabel } from "./priceLabel.ts";

const APPROX = { kind: "approximate" };

test("old plans without price fields are approximate", () => {
  assert.deepEqual(priceLabel({}), APPROX);
});

test("estimate source is approximate", () => {
  assert.deepEqual(priceLabel({ price_source: "estimate" }), APPROX);
});

test("legacy sample source is approximate", () => {
  assert.deepEqual(priceLabel({ price_source: "sample" }), APPROX);
});

test("official price with a date is shown as updated", () => {
  assert.deepEqual(
    priceLabel({ price_source: "official", price_updated_at: "2026-11-02" }),
    { kind: "updated", date: "2026-11-02" },
  );
});

test("user price with a date is shown as updated", () => {
  assert.deepEqual(
    priceLabel({ price_source: "user", price_updated_at: "2026-10-01" }),
    { kind: "updated", date: "2026-10-01" },
  );
});

test("official price without a date is approximate", () => {
  assert.deepEqual(priceLabel({ price_source: "official" }), APPROX);
});

test("unparseable or impossible dates are approximate", () => {
  for (const bad of ["not-a-date", "2026-02-31", "", 5, null]) {
    assert.deepEqual(
      priceLabel({ price_source: "official", price_updated_at: bad }),
      APPROX,
    );
  }
});

test("unknown source is approximate", () => {
  assert.deepEqual(
    priceLabel({ price_source: "hacked", price_updated_at: "2026-11-02" }),
    APPROX,
  );
});

test("hasApproximatePrices detects any approximate item", () => {
  assert.equal(
    hasApproximatePrices([
      { price_source: "official", price_updated_at: "2026-11-02" },
      {},
    ]),
    true,
  );
});

test("hasApproximatePrices is false when all are real", () => {
  assert.equal(
    hasApproximatePrices([
      { price_source: "official", price_updated_at: "2026-11-02" },
    ]),
    false,
  );
  assert.equal(hasApproximatePrices([]), false);
});
