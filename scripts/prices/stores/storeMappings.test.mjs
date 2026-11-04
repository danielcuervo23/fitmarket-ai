import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadMappings } from "../mappings.ts";
import { policySchema } from "../policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("the VTEX store mapping files are valid for the allowed hosts and known foods", () => {
  const policy = policySchema.parse(JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8")));
  const foods = JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8"));
  const ids = new Set((Array.isArray(foods) ? foods : foods.foods).map((f) => f.id));
  const hosts = {};
  const patterns = {};
  for (const [id, s] of Object.entries(policy.stores)) {
    hosts[id] = new URL(s.robotsUrl).hostname;
    patterns[id] = s.productPathPattern;
  }
  const out = loadMappings(path.join(root, "data/store-products"), ids, hosts, patterns);
  assert.ok((out.Carulla ?? []).length >= 1);
  assert.ok((out.Jumbo ?? []).length >= 1);
});
