import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseSink } from "../supabaseSink.ts";
import type { PriceSink } from "../run.ts";
import { policySchema } from "../policy.ts";
import { storeSitesFromPolicy } from "./format.ts";
import { formatMappings, importManualPrices, type MappingEntry } from "./importer.ts";

// Imports price files exported by the "Anotar precio" bookmarklet.
//   node scripts/prices/manual/import.ts [--write | --mappings-only] [--skip-stale] <file.json>...
// Default: dry run (nothing changes; with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set it also
// checks the prices against the database, read only).
//   --mappings-only  update data/store-products/<Store>.json, no database
//   --write          update the mapping files AND write the prices (needs both variables)
//   --skip-stale     skip entries older than 45 days instead of failing (used by CI over all files)
// Exit codes: 0 ok, 1 invalid file or a price refused by the checks, 2 bad usage/configuration.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FLAGS = new Set(["--write", "--mappings-only", "--skip-stale"]);
const MAX_FILE_BYTES = 2_000_000;
const USAGE = "Usage: node scripts/prices/manual/import.ts [--write | --mappings-only] [--skip-stale] <file.json>...";

function configError(message: string): never {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const files = args.filter((a) => !a.startsWith("--"));
const unknown = [...flags].filter((f) => !FLAGS.has(f));
if (unknown.length > 0) configError(`Unknown option(s): ${unknown.join(", ")}\n${USAGE}`);
if (files.length === 0) configError(USAGE);
const write = flags.has("--write");
const mappingsOnly = flags.has("--mappings-only");
if (write && mappingsOnly) configError("Use either --write or --mappings-only, not both.");

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
if (write && !hasEnv) configError("--write needs the environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
if (hasEnv) {
  try {
    if (new URL(process.env.SUPABASE_URL as string).protocol !== "https:") throw new Error("not https");
  } catch {
    configError("SUPABASE_URL must be a valid https URL");
  }
}

function readJson(file: string): unknown {
  try {
    if (statSync(file).size > MAX_FILE_BYTES) configError(`${file}: larger than ${MAX_FILE_BYTES} bytes`);
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return configError(`${file}: ${(e as Error).message}`);
  }
}

const policy = JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8"));
const foods = (JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8")) as Record<string, unknown>[]).map(
  (f) => ({ id: String(f.id), nameEs: String(f.nameEs), unit: String(f.unit), defaultPack: Number(f.defaultPack) }),
);
const mappingsDir = process.env.PRICES_MAPPINGS_DIR ?? path.join(root, "data/store-products");
const mappingFile = (store: string) => path.join(mappingsDir, `${store}.json`);
const mappings: Record<string, MappingEntry[]> = {};
for (const { storeId: store } of storeSitesFromPolicy(policySchema.parse(policy))) {
  try {
    mappings[store] = JSON.parse(readFileSync(mappingFile(store), "utf8")) as MappingEntry[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") configError(`${store}.json: ${(e as Error).message}`);
  }
}

const today = new Date().toISOString().slice(0, 10);
const sink: PriceSink | undefined =
  hasEnv && !mappingsOnly
    ? createSupabaseSink(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string)
    : undefined;

const result = await importManualPrices({
  files: files.map((file) => ({ name: path.basename(file), json: readJson(file) })),
  policy,
  foods,
  mappings,
  today,
  skipStale: flags.has("--skip-stale"),
  sink,
  write,
});
const { plan } = result;

if (plan.errors.length > 0) {
  console.error(`Nothing was changed. ${plan.errors.length} problem(s):`);
  for (const e of plan.errors) console.error(`  ${e}`);
  process.exit(1);
}

const mode = write ? "write" : mappingsOnly ? "mappings only" : "dry run, nothing changed";
console.log(`Manual price import ${today} (bucaramanga) [${mode}]`);
for (const s of plan.stale) console.log(`  skipped (older than 45 days): ${s}`);
for (const [store, c] of Object.entries(plan.changes)) {
  if (!c) continue;
  const prices = plan.prices.filter((p) => p.product.storeId === store).length;
  console.log(
    `${store}: +${c.added.length} food(s) [${c.added.join(", ")}], ~${c.updated.length} updated [${c.updated.join(", ")}], -${c.removed.length} removed [${c.removed.join(", ")}]; ${prices} price(s)`,
  );
}
if (write || mappingsOnly) {
  for (const [store, entries] of Object.entries(plan.mappings)) {
    if (entries) writeFileSync(mappingFile(store), formatMappings(entries));
  }
}

let refused = 0;
if (result.prices) {
  for (const [store, s] of Object.entries(result.prices)) {
    console.log(`${store} prices: ${write ? "saved" : "would save"}=${s.saved} refused=${JSON.stringify(s.skipped)}`);
    refused += Object.values(s.skipped).reduce((a, b) => a + b, 0);
  }
} else if (!mappingsOnly) {
  console.log("Prices were not checked against the database (no Supabase variables).");
}
if (refused > 0) {
  console.error(`${refused} price(s) refused by the range/jump checks; review them before trying again.`);
  process.exit(1);
}
