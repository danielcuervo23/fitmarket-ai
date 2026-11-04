// Guards the legal review of the supermarkets (see docs/PRICE_SOURCES.md).
// The price runner only reads stores that this policy marks as allowed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(readFileSync(path.join(here, "policy.json"), "utf8"));
const entries = Object.entries(policy.stores);

test("policy covers exactly the five stores", () => {
  assert.deepEqual(Object.keys(policy.stores).sort(), [
    "Ara",
    "Carulla",
    "D1",
    "Exito",
    "Jumbo",
  ]);
});

test("checkedOn is a real ISO date not in the future", () => {
  assert.match(policy.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date(`${policy.checkedOn}T00:00:00Z`);
  assert.ok(!Number.isNaN(d.getTime()));
  assert.equal(d.toISOString().slice(0, 10), policy.checkedOn);
  assert.ok(d.getTime() <= Date.now() + 14 * 3600 * 1000, "date is in the future");
});

test("every store has a boolean verdict and a reason", () => {
  for (const [name, s] of entries) {
    assert.equal(typeof s.allowed, "boolean", name);
    assert.ok(typeof s.reason === "string" && s.reason.length > 0, name);
  }
});

test("allowed stores have a reading method, Bucaramanga coverage and polite delay", () => {
  for (const [name, s] of entries.filter(([, s]) => s.allowed === true)) {
    assert.notEqual(s.method, "none", name);
    assert.ok(["vtex_api", "jsonld_html", "json_api"].includes(s.method), name);
    assert.equal(s.bucaramanga.available, true, name);
    assert.ok(s.minDelayMs >= 2000, name);
    assert.ok(s.termsUrl.startsWith("https://"), name);
    assert.ok(s.robotsUrl.startsWith("https://"), name);
    assert.ok(s.termsSummary.length >= 40, name);
  }
});

test("forbidden stores are not read", () => {
  for (const [name, s] of entries.filter(([, s]) => s.allowed === false)) {
    assert.equal(s.method, "none", name);
  }
});

test("user agent names a contact", () => {
  assert.match(policy.userAgent, /^FitMarketPriceBot\/\d+\.\d+ \(\+https:\/\/.+\)$/);
  assert.equal(policy.userAgent, "FitMarketPriceBot/1.0 (+https://fitmarket-ai.vercel.app)");
  assert.ok(!policy.userAgent.includes("@"));
});
