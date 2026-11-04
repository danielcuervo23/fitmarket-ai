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
    assert.ok(s.minDelayMs >= 5000, name);
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

test("owner decision 2026-11-04: four stores allowed, Ara forbidden", () => {
  for (const name of ["Exito", "Carulla", "D1", "Jumbo"]) {
    assert.equal(policy.stores[name].allowed, true, name);
    assert.equal(policy.stores[name].method, "jsonld_html", name);
  }
  assert.equal(policy.stores.Ara.allowed, false);
  assert.equal(policy.stores.Ara.method, "none");
});

test("allowed stores never touch paths that robots.txt blocks", () => {
  for (const [name, s] of entries.filter(([, s]) => s.allowed === true)) {
    assert.ok(s.disallowedPaths.length > 0, name);
    assert.equal(s.readOnly, "product_pages", name);
    assert.ok(s.productPathPattern.endsWith("/p"), name);
  }
});

test("owner authorization and precautions are recorded", () => {
  assert.equal(policy.ownerAuthorization.date, "2026-11-04");
  assert.equal(policy.ownerAuthorization.legalReviewBeforePublicLaunch, "pending");
  assert.equal(policy.precautions.cadence, "weekly");
  assert.ok(policy.precautions.minDelayMs >= 5000);
  assert.deepEqual(policy.precautions.stopOnStatus, [429]);
  assert.deepEqual(policy.precautions.storeOnly, ["regularPrice", "packageSize"]);
  assert.ok(policy.precautions.neverStore.includes("images"));
  assert.ok(policy.precautions.neverStore.includes("descriptions"));
  assert.ok(policy.precautions.neverStore.includes("logos"));
  assert.ok(policy.precautions.neverRequest.includes("/api/"));
  assert.ok(policy.precautions.neverRequest.includes("/s?"));
  assert.ok(policy.precautions.neverRequest.includes("/busca*"));
  assert.match(policy.precautions.onStoreRequestToStop, /allowed: false/);
});

test("D1 is read on www.d1.com.co (domicilios.tiendasd1.com redirects there) with its own robots.txt", () => {
  const d1 = policy.stores.D1;
  assert.equal(d1.robotsUrl, "https://www.d1.com.co/robots.txt");
  assert.equal(d1.productPathPattern, "/<slug>/p");
  assert.match(d1.reason, /domicilios\.tiendasd1\.com/);
  for (const rule of ["/account/*", "/login/*", "/checkout/*", "/busca/*", "/quick-view/*", "/espiar/*", "/buscapagina/*"]) {
    assert.ok(d1.disallowedPaths.includes(rule), rule);
  }
});
