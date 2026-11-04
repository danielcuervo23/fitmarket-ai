import assert from "node:assert/strict";
import test from "node:test";
import { usdaRequest } from "./usdaRequest.ts";

test("the USDA key travels in the X-Api-Key header, never in the URL", () => {
  const { url, headers } = usdaRequest("170567", "secret-key-123");
  assert.equal(headers["X-Api-Key"], "secret-key-123");
  assert.ok(!url.includes("secret-key-123"));
  assert.ok(!/api_key/i.test(url));
  assert.equal(url, "https://api.nal.usda.gov/fdc/v1/food/170567?format=abridged");
});

test("the food reference is URL-encoded and DEMO_KEY is the fallback", () => {
  const { url, headers } = usdaRequest("a/b c", undefined);
  assert.equal(headers["X-Api-Key"], "DEMO_KEY");
  assert.ok(url.includes("a%2Fb%20c"));
  assert.equal(usdaRequest("1", "").headers["X-Api-Key"], "DEMO_KEY");
});
