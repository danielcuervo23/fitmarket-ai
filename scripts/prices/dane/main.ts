import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapping } from "./derive.ts";
import { createReferenceSink, runDane } from "./run.ts";

// Weekly DANE SIPSA step (workflow prices-weekly.yml):
//   node scripts/prices/dane/main.ts [--dry-run]
// Exit codes: 0 ok, 1 the run failed, 2 bad configuration.

const CITY = "bucaramanga";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function configError(message: string): never {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.some((a) => a !== "--dry-run")) configError("Only --dry-run is accepted.");
const dryRun = args.includes("--dry-run");

let supabaseUrl = "";
let serviceRoleKey = "";
if (!dryRun) {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
  if (missing.length > 0) configError(`Missing environment variable(s): ${missing.join(", ")}`);
  supabaseUrl = process.env.SUPABASE_URL as string;
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  try {
    if (new URL(supabaseUrl).protocol !== "https:") throw new Error("not https");
  } catch {
    configError("SUPABASE_URL must be a valid https URL");
  }
}

type Food = { id: string; unit: "g" | "ml" | "unit"; refPriceCop: number; gramsPerUnit?: number };
let foods: Food[];
let mapping: ReturnType<typeof loadMapping>;
try {
  foods = JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8")) as Food[];
  mapping = loadMapping(
    JSON.parse(readFileSync(path.join(root, "scripts/prices/dane/mapping.json"), "utf8")),
    new Set(foods.map((f) => f.id)),
  );
} catch (e) {
  configError(`Invalid DANE configuration: ${(e as Error).message}`);
}

const today = new Date().toISOString().slice(0, 10);

try {
  const summary = await runDane({
    fetch,
    foods,
    mapping,
    city: CITY,
    today,
    sink: dryRun ? { upsertReferencePrices: async () => {} } : createReferenceSink(supabaseUrl, serviceRoleKey),
    dryRun,
  });
  console.log(`DANE SIPSA run ${today} (${CITY})${dryRun ? " [dry run, nothing written]" : ""}`);
  console.log(`rows=${summary.read} invalid=${summary.invalid} stored=${summary.stored} missing=${summary.missing.length} stale=${summary.stale.length}`);
  for (const a of summary.anomalies) console.warn(`anomaly skipped: ${a.foodId} derived=${a.pricePerUnit} static=${a.refPriceCop}`);
} catch (e) {
  console.error(`DANE SIPSA run failed: ${(e as Error).message}`);
  process.exit(1);
}
