import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { policySchema } from "../policy.ts";
import { createSupabaseSink } from "../supabaseSink.ts";
import { storeSitesFromPolicy } from "./format.ts";
import { formatMappings, importManualPrices, type ImportFood, type ManualPriceSink, type MappingEntry } from "./importer.ts";

// Imports price files exported by the "Anotar precio" bookmarklet.
//   node scripts/prices/manual/import.ts [--write | --mappings-only] [options] <file.json>...
// Default: dry run (nothing changes; with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set it also
// checks the prices against the database, read only).
//   --mappings-only           update data/store-products/<Store>.json, no database
//   --write                   check every price, then (only if none is refused) write the prices,
//                             the products and the mapping files (needs both variables)
//   --skip-stale              skip entries older than 45 days instead of failing (CI, over all files)
//   --allow-unconfirmed-pack  accept packs typed by hand (never in CI)
//   --allow-pack-change       accept a new pack size for a product already mapped (never in CI)
//   --allow-price-outlier     accept a first price outside x0.33..x3 of the food's reference (never in CI)
// Exit codes: 0 ok, 1 invalid file or a price refused by the checks (nothing written), 2 bad usage.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FLAGS = new Set([
  "--write",
  "--mappings-only",
  "--skip-stale",
  "--allow-unconfirmed-pack",
  "--allow-pack-change",
  "--allow-price-outlier",
]);
const MAX_FILE_BYTES = 2_000_000;
const USAGE = `Usage: node scripts/prices/manual/import.ts [--write | --mappings-only] [${[...FLAGS].slice(2).join("] [")}] <file.json>...`;

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
const foods: ImportFood[] = (JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8")) as Record<string, unknown>[]).map(
  (f) => ({
    id: String(f.id),
    nameEs: String(f.nameEs),
    unit: String(f.unit),
    defaultPack: Number(f.defaultPack),
    refPriceCop: Number(f.refPriceCop),
  }),
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
const sink: ManualPriceSink | undefined =
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
  allowUnconfirmedPack: flags.has("--allow-unconfirmed-pack"),
  allowPackChange: flags.has("--allow-pack-change"),
  allowPriceOutlier: flags.has("--allow-price-outlier"),
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
for (const s of plan.packChanges) console.log(`  ALLOWED pack size changed: ${s}`);
for (const s of plan.dropped) console.log(`  price not stored: ${s}`);
for (const [store, c] of Object.entries(plan.changes)) {
  if (!c) continue;
  const prices = plan.prices.filter((p) => p.product.storeId === store).length;
  console.log(
    `${store}: +${c.added.length} food(s) [${c.added.join(", ")}], ~${c.updated.length} updated [${c.updated.join(", ")}], -${c.removed.length} removed [${c.removed.join(", ")}]; ${prices} price(s)`,
  );
}
if (plan.retired.length > 0) {
  console.log(`  products that lost their food (made inactive on --write): ${plan.retired.map((r) => `${r.storeId}:${r.externalId}`).join(", ")}`);
}

const prices = result.prices;
if (prices) {
  for (const [store, s] of Object.entries(prices.summary)) {
    console.log(`${store} prices: ${write ? "to save" : "would save"}=${s.saved} skipped=${JSON.stringify(s.skipped)}`);
  }
} else if (!mappingsOnly) {
  console.log("Prices were not checked against the database (no Supabase variables).");
}
if (prices && prices.refused > 0) {
  console.error(
    `Nothing was written: ${prices.refused} price(s) refused by the range, jump or reference checks. Review them before trying again.`,
  );
  process.exit(1);
}

// Files last: only after every check passed (and, with --write, after the database accepted the rows).
if (mappingsOnly || (write && prices?.written)) {
  for (const [store, entries] of Object.entries(plan.mappings)) {
    if (entries) writeFileSync(mappingFile(store), formatMappings(entries));
  }
}
if (write && prices?.written) console.log(`Written. Store products made inactive: ${prices.deactivated}.`);
