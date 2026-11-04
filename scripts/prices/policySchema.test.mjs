import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { policySchema } from "./policy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(path.join(here, "policy.json"), "utf8"));
const clone = () => structuredClone(raw);

test("policy.json passes the schema and keeps every precaution field", () => {
  const p = policySchema.parse(raw);
  assert.deepEqual(p.precautions.stopOnStatus, [429]);
  assert.equal(p.precautions.minDelayMs, 5000);
  assert.equal(p.stores.Exito.productPathPattern, "/<slug>/p");
  assert.equal(p.stores.Exito.readOnly, "product_pages");
  assert.equal(p.ownerAuthorization.by, "owner");
  assert.ok(p.precautions.neverRequest.includes("/api/"));
});

test("unknown fields are rejected, not silently stripped", () => {
  const top = clone();
  top.surprise = 1;
  assert.throws(() => policySchema.parse(top));
  const store = clone();
  store.stores.Exito.surprise = 1;
  assert.throws(() => policySchema.parse(store));
  const prec = clone();
  prec.precautions.surprise = 1;
  assert.throws(() => policySchema.parse(prec));
});

test("an allowed store needs a product path pattern and a delay of at least 5000 ms", () => {
  const noPattern = clone();
  delete noPattern.stores.Exito.productPathPattern;
  assert.throws(() => policySchema.parse(noPattern));
  const fast = clone();
  fast.stores.Exito.minDelayMs = 1000;
  assert.throws(() => policySchema.parse(fast));
});
