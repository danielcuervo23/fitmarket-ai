import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMappings } from "./mappings.ts";
import { policySchema } from "./policy.ts";
import { loadReaders } from "./readers/index.ts";
import { runWeekly } from "./run.ts";
import { createSupabaseSink } from "./supabaseSink.ts";
import { STORE_IDS, type StoreId } from "./types.ts";

// Weekly entry point (GitHub Actions workflow prices-weekly.yml).
//   node scripts/prices/main.ts [--dry-run]
// Exit codes: 0 ok, 1 some store failed, 2 bad configuration.

const CITY = "bucaramanga";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function configError(message: string): never {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--dry-run");
if (unknown.length > 0) configError(`Unknown argument(s): ${unknown.length}. Only --dry-run is accepted.`);
const dryRun = args.includes("--dry-run");

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
if (missing.length > 0) configError(`Missing environment variable(s): ${missing.join(", ")}`);
const supabaseUrl = process.env.SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
try {
  if (new URL(supabaseUrl).protocol !== "https:") throw new Error("not https");
} catch {
  configError("SUPABASE_URL must be a valid https URL");
}

const policy = policySchema.parse(JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8")));
const foods = JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8")) as { id: string }[];
const foodIds = new Set(foods.map((f) => f.id));

const hosts: Partial<Record<StoreId, string>> = {};
const patterns: Partial<Record<StoreId, string | undefined>> = {};
for (const id of STORE_IDS) {
  const store = policy.stores[id];
  if (!store) continue;
  hosts[id] = new URL(store.robotsUrl).hostname;
  patterns[id] = store.productPathPattern;
}

const readers = await loadReaders(path.join(root, "scripts/prices/stores"));
const mappings = loadMappings(path.join(root, "data/store-products"), foodIds, hosts, patterns);
const today = new Date().toISOString().slice(0, 10);

const summary = await runWeekly({
  policy,
  readers,
  mappings,
  sink: createSupabaseSink(supabaseUrl, serviceRoleKey),
  fetch,
  today,
  city: CITY,
  dryRun,
});

console.log(`Price run ${today} (${CITY})${dryRun ? " [dry run, nothing written]" : ""}`);
for (const [store, s] of Object.entries(summary.perStore)) {
  console.log(`${store}: read=${s.read} saved=${s.saved} skipped=${JSON.stringify(s.skipped)}`);
}
if (summary.failedStores.length > 0) {
  console.error(`Failed stores: ${summary.failedStores.join(", ")}`);
  process.exit(1);
}
