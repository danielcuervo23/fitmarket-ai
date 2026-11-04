// Fills the extended nutrition fields of data/foods/foods.json from USDA
// FoodData Central (public domain) and Open Food Facts (ODbL). It never changes
// the legacy fields (macros, packs, prices, names): only fiberG, freeSugarsG,
// satFatG, sodiumMg and ironMg, plus nutritionNote when something is missing.
//
// Usage: node scripts/foods/fetch-nutrition.ts [--usda-dump <file>]
//   USDA_API_KEY   optional; the public DEMO_KEY is used when it is not set
//                  (DEMO_KEY allows only ~10 requests per hour, so for the whole
//                  catalog pass --usda-dump with the official SR Legacy JSON,
//                  and run node with --max-old-space-size=4096).
// Network calls wait 1 second between requests. Answers are untrusted and are
// validated by the parsers; a failed lookup leaves the fields empty and adds a
// note instead of inventing numbers.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { usdaRequest } from "./usdaRequest.ts";
import { draftFoodsFileSchema, type DraftFoodJson } from "./foodSchema.ts";
import {
  buildExtendedFields,
  parseOffProduct,
  parseUsdaFood,
  type ExtendedNutrients,
} from "./nutrients.ts";

const FOODS_PATH = fileURLToPath(
  new URL("../../data/foods/foods.json", import.meta.url),
);
const POLICY_PATH = fileURLToPath(
  new URL("../prices/policy.json", import.meta.url),
);
const REQUEST_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function userAgent(): string {
  const policy = z
    .object({ userAgent: z.string().min(1) })
    .parse(JSON.parse(readFileSync(POLICY_PATH, "utf8")));
  return policy.userAgent;
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      return await response.json();
    }
    if (response.status === 429) {
      throw new Error(
        "Rate limit reached (HTTP 429). Use USDA_API_KEY or --usda-dump.",
      );
    }
    if (response.status === 404) {
      throw new Error("Not found (HTTP 404)");
    }
    await sleep(attempt * 3000);
  }
  throw new Error("Service unavailable after 3 attempts");
}

function loadUsdaDump(path: string): Map<string, unknown> {
  const dump = z
    .object({
      SRLegacyFoods: z.array(z.object({ fdcId: z.number() }).passthrough()),
    })
    .parse(JSON.parse(readFileSync(path, "utf8")));
  return new Map(dump.SRLegacyFoods.map((food) => [String(food.fdcId), food]));
}

async function lookup(
  food: DraftFoodJson,
  usdaDump: Map<string, unknown> | null,
  agent: string,
): Promise<ExtendedNutrients | null> {
  if (food.nutritionSource === "usda") {
    const fromDump = usdaDump?.get(food.nutritionRef);
    if (fromDump !== undefined) {
      return parseUsdaFood(fromDump);
    }
    const request = usdaRequest(food.nutritionRef, process.env.USDA_API_KEY);
    await sleep(REQUEST_DELAY_MS);
    return parseUsdaFood(await getJson(request.url, request.headers));
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(food.nutritionRef)}.json?fields=code,product_name,nutriments`;
  await sleep(REQUEST_DELAY_MS);
  return parseOffProduct(await getJson(url, { "User-Agent": agent }));
}

async function main(): Promise<void> {
  const dumpIndex = process.argv.indexOf("--usda-dump");
  const dumpPath = dumpIndex >= 0 ? process.argv[dumpIndex + 1] : undefined;
  const usdaDump = dumpPath ? loadUsdaDump(dumpPath) : null;
  const agent = userAgent();

  const foods = draftFoodsFileSchema.parse(
    JSON.parse(readFileSync(FOODS_PATH, "utf8")),
  );
  const allClamps: string[] = [];
  const missing: string[] = [];
  const updated: DraftFoodJson[] = [];

  for (const food of foods) {
    let nutrients: ExtendedNutrients | null = null;
    let note: string | undefined;
    try {
      nutrients = await lookup(food, usdaDump, agent);
      if (nutrients === null) {
        note = `${food.nutritionSource} ${food.nutritionRef}: answer incomplete or invalid`;
      }
    } catch (error) {
      note = `${food.nutritionSource} ${food.nutritionRef}: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (nutrients === null) {
      missing.push(`${food.id}: ${note}`);
      updated.push({ ...food, nutritionNote: note });
      continue;
    }

    const { fields, clamps } = buildExtendedFields(food, nutrients);
    allClamps.push(...clamps);
    const { nutritionNote: _old, ...rest } = food;
    updated.push({ ...rest, ...fields });
    console.log(`ok ${food.id}`);
  }

  writeFileSync(FOODS_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`\nClamps (${allClamps.length}):`);
  allClamps.forEach((line) => console.log(`  ${line}`));
  console.log(`\nMissing (${missing.length}):`);
  missing.forEach((line) => console.log(`  ${line}`));
}

await main();
