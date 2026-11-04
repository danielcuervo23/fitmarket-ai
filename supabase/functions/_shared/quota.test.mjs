import assert from "node:assert/strict";
import { positiveIntOr, shouldRefund } from "./quota.ts";

const billed = (n) => ({ modelCalls: n, billableCalls: n, refusedCalls: 0 });

// Answers OpenAI may have charged for never give the try back (this let a
// user generate without limit: every "bad" plan was refunded).
for (const code of ["goal_incoherent", "invalid_format", "generation_failed", "ai_empty"]) {
  assert.equal(shouldRefund(code, billed(3)), false, code);
  assert.equal(shouldRefund(code, billed(0)), false, `${code} is never refundable`);
}

// Our own outages cost nothing and are refunded...
for (const code of ["server_config", "ai_unavailable", "ai_timeout", "rate_limited"]) {
  assert.equal(shouldRefund(code, billed(0)), true, code);
  assert.equal(shouldRefund(code, undefined), true, `${code} without usage`);
  // ...unless some call in the same request may already have been charged.
  assert.equal(shouldRefund(code, billed(1)), false, `${code} after a billable call`);
}

// User-side outcomes are never refunded.
assert.equal(shouldRefund("budget_too_low", undefined), false);
assert.equal(shouldRefund("quota_exceeded", undefined), false);

assert.equal(positiveIntOr("12", 5), 12);
assert.equal(positiveIntOr(undefined, 5), 5);
assert.equal(positiveIntOr("", 5), 5);
assert.equal(positiveIntOr("0", 5), 5);
assert.equal(positiveIntOr("-3", 5), 5);
assert.equal(positiveIntOr("2.5", 5), 5);
assert.equal(positiveIntOr("abc", 5), 5);
// A setting above the ceiling is cut to it (e.g. a time budget beyond the
// Edge Function limit).
assert.equal(positiveIntOr("200000", 120000, 140000), 140000);

console.log("quota: all checks passed");
