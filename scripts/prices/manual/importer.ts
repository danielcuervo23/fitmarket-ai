import { z } from "zod";
import { parseMappings } from "../mappings.ts";
import { policySchema } from "../policy.ts";
import type { PriceSink } from "../run.ts";
import type { MappedProduct, StoreId } from "../types.ts";
import { checkPrice, MAX_PRICE_COP, MIN_PRICE_COP } from "../validate.ts";
import {
  CITY,
  EXTERNAL_ID_RE,
  MAX_AGE_DAYS,
  MAX_NAME,
  SCHEMA_VERSION,
  canonicalProductUrl,
  cleanName,
  isPlausiblePack,
  storeSitesFromPolicy,
  type ManualEntry,
  type ManualExport,
  type SlimFood,
} from "./format.ts";

// Imports the files exported by the "Anotar precio" bookmarklet: validates them
// strictly, merges the products into data/store-products/<Store>.json and
// (optionally) writes the prices through the weekly runner's sink, with the
// same range and jump checks. A price a person read on the store's own public
// page counts as source 'official' (the sink always writes that source).

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), {
    message: "not a real date",
  });

const entrySchema = z
  .object({
    foodId: z.string().min(1).max(80),
    externalId: z.string().regex(EXTERNAL_ID_RE),
    name: z.string().min(1).max(MAX_NAME).refine((n) => cleanName(n) === n, { message: "control characters or padding" }),
    packSize: z.number().positive().max(100_000),
    url: z.string().max(500),
    regularPriceCop: z.number().int().min(MIN_PRICE_COP).max(MAX_PRICE_COP),
    observedOn: isoDay,
  })
  .strict();

export const manualExportSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    store: z.string().min(1).max(40),
    city: z.literal(CITY),
    capturedOn: isoDay,
    cityAttested: z.literal(true),
    entries: z.array(entrySchema).min(1).max(200),
  })
  .strict();

export interface MappingEntry {
  foodId: string;
  externalId: string;
  name: string;
  packSize: number;
  url: string;
}

export interface PlannedPrice {
  product: MappedProduct;
  regularPriceCop: number;
  observedOn: string;
}

export interface ImportPlan {
  errors: string[];
  /** Entries older than MAX_AGE_DAYS skipped with skipStale. */
  stale: string[];
  /** New content of each touched store's mapping file. */
  mappings: Partial<Record<StoreId, MappingEntry[]>>;
  changes: Partial<Record<StoreId, { added: string[]; updated: string[]; removed: string[] }>>;
  prices: PlannedPrice[];
}

export interface PlanInput {
  files: { name: string; json: unknown }[];
  policy: unknown;
  foods: readonly SlimFood[];
  /** Current content of data/store-products/<Store>.json per store (missing file: absent). */
  mappings: Partial<Record<string, MappingEntry[]>>;
  /** YYYY-MM-DD (UTC). */
  today: string;
  skipStale?: boolean;
}

const DAY_MS = 86_400_000;
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
const byFood = (a: MappingEntry, b: MappingEntry) => (a.foodId < b.foodId ? -1 : a.foodId > b.foodId ? 1 : 0);

const sameMapping = (a: MappingEntry, b: MappingEntry) =>
  a.externalId === b.externalId && a.name === b.name && a.packSize === b.packSize && a.url === b.url;

export function formatMappings(entries: readonly MappingEntry[]): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

export function planImport(input: PlanInput): ImportPlan {
  const policy = policySchema.parse(input.policy);
  const sites = storeSitesFromPolicy(policy);
  const foodsById = new Map(input.foods.map((f) => [f.id, f]));
  const today = dayNumber(input.today);
  const plan: ImportPlan = { errors: [], stale: [], mappings: {}, changes: {}, prices: [] };
  const accepted: { file: ManualExport; name: string }[] = [];

  for (const { name, json } of input.files) {
    const parsed = manualExportSchema.safeParse(json);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) plan.errors.push(`${name}: ${issue.path.join(".") || "(file)"}: ${issue.message}`);
      continue;
    }
    const file = parsed.data as ManualExport;
    const errorsBefore = plan.errors.length;
    const site = sites.find((s) => s.storeId === file.store);
    if (!site) {
      plan.errors.push(`${name}: store: "${file.store}" is not an allowed store in policy.json`);
      continue;
    }
    if (dayNumber(file.capturedOn) > today) plan.errors.push(`${name}: capturedOn: in the future`);
    const foodsSeen = new Set<string>();
    const idsSeen = new Set<string>();
    const fresh: ManualEntry[] = [];
    file.entries.forEach((e, i) => {
      const at = `${name}: entries.${i}`;
      const problems: string[] = [];
      const food = foodsById.get(e.foodId);
      if (!food) problems.push(`foodId: unknown food "${e.foodId}"`);
      else if (!isPlausiblePack(e.packSize, food)) problems.push(`packSize: ${e.packSize} is not plausible for ${e.foodId}`);
      if (canonicalProductUrl(e.url, site) !== e.url) problems.push("url: not a canonical product page of the store (no query string)");
      if (foodsSeen.has(e.foodId)) problems.push(`foodId: "${e.foodId}" appears twice`);
      if (idsSeen.has(e.externalId)) problems.push(`externalId: "${e.externalId}" appears twice`);
      foodsSeen.add(e.foodId);
      idsSeen.add(e.externalId);
      const seen = dayNumber(e.observedOn);
      if (seen > today) problems.push("observedOn: in the future");
      if (seen > dayNumber(file.capturedOn)) problems.push("observedOn: after capturedOn");
      if (problems.length > 0) {
        for (const p of problems) plan.errors.push(`${at}: ${p}`);
        return;
      }
      if (today - seen > MAX_AGE_DAYS) {
        if (input.skipStale) plan.stale.push(`${at}: ${e.foodId} seen ${e.observedOn}`);
        else plan.errors.push(`${at}: observedOn: older than ${MAX_AGE_DAYS} days`);
        return;
      }
      fresh.push(e);
    });
    if (plan.errors.length === errorsBefore && fresh.length > 0) accepted.push({ file: { ...file, entries: fresh }, name });
  }
  if (plan.errors.length > 0) return plan;

  // Oldest export first, so the newest choice for a food or a product wins.
  accepted.sort((a, b) => a.file.capturedOn.localeCompare(b.file.capturedOn) || a.name.localeCompare(b.name));
  const latest = new Map<string, PlannedPrice>();
  for (const { file } of accepted) {
    const storeId = file.store as StoreId;
    const before = input.mappings[storeId] ?? [];
    let current = plan.mappings[storeId] ?? before.map((m) => ({ ...m }));
    for (const e of file.entries) {
      const mapping: MappingEntry = { foodId: e.foodId, externalId: e.externalId, name: e.name, packSize: e.packSize, url: e.url };
      current = [...current.filter((m) => m.foodId !== e.foodId && m.externalId !== e.externalId), mapping];
      latest.set(`${storeId}:${e.externalId}:${e.observedOn}`, {
        product: { storeId, ...mapping },
        regularPriceCop: e.regularPriceCop,
        observedOn: e.observedOn,
      });
    }
    plan.mappings[storeId] = current.sort(byFood);
  }

  for (const [store, after] of Object.entries(plan.mappings) as [StoreId, MappingEntry[]][]) {
    const before = input.mappings[store] ?? [];
    plan.changes[store] = {
      added: after.filter((a) => !before.some((b) => b.foodId === a.foodId)).map((a) => a.foodId),
      updated: after
        .filter((a) => before.some((b) => b.foodId === a.foodId && !sameMapping(a, b)))
        .map((a) => a.foodId),
      removed: before.filter((b) => !after.some((a) => a.foodId === b.foodId)).map((b) => b.foodId),
    };
    const site = sites.find((s) => s.storeId === store);
    try {
      parseMappings(after, store, new Set(foodsById.keys()), site?.host ?? "", site?.productPathPattern);
    } catch (e) {
      plan.errors.push((e as Error).message);
    }
  }

  // Each product is written with its newest data; each (product, day) once.
  const newestProduct = new Map<string, MappedProduct>();
  for (const p of latest.values()) newestProduct.set(`${p.product.storeId}:${p.product.externalId}`, p.product);
  plan.prices = [...latest.values()].map((p) => ({
    ...p,
    product: newestProduct.get(`${p.product.storeId}:${p.product.externalId}`) ?? p.product,
  }));
  return plan;
}

export type PriceSummary = Record<string, { saved: number; skipped: Record<string, number> }>;

/** Writes (or, with write=false, only checks) the planned prices through the sink. */
export async function applyPrices(prices: readonly PlannedPrice[], sink: PriceSink, opts: { write: boolean }): Promise<PriceSummary> {
  const summary: PriceSummary = {};
  if (prices.length === 0) return summary;
  const products = [...new Map(prices.map((p) => [`${p.product.storeId}:${p.product.externalId}`, p.product])).values()];
  const ids = opts.write ? await sink.upsertProducts(products) : await sink.findProductIds(products);
  const last = await sink.lastPrices([...ids.values()], CITY);
  const rows: Parameters<PriceSink["upsertPrices"]>[0] = [];
  for (const p of prices) {
    const entry = (summary[p.product.storeId] ??= { saved: 0, skipped: {} });
    const id = ids.get(`${p.product.storeId}:${p.product.externalId}`);
    const verdict = checkPrice(p.regularPriceCop, id === undefined ? null : (last.get(id) ?? null));
    if (!verdict.ok) {
      entry.skipped[verdict.reason] = (entry.skipped[verdict.reason] ?? 0) + 1;
      continue;
    }
    entry.saved++; // in a dry run: "would be saved"
    if (id !== undefined) rows.push({ storeProductId: id, city: CITY, regularPriceCop: p.regularPriceCop, observedOn: p.observedOn });
  }
  if (opts.write && rows.length > 0) await sink.upsertPrices(rows);
  return summary;
}

/** Plans the import and, when every file is valid and a sink is given, writes or checks the prices. */
export async function importManualPrices(
  input: PlanInput & { sink?: PriceSink; write: boolean },
): Promise<{ plan: ImportPlan; prices: PriceSummary | null }> {
  const plan = planImport(input);
  if (plan.errors.length > 0 || !input.sink) return { plan, prices: null };
  return { plan, prices: await applyPrices(plan.prices, input.sink, { write: input.write }) };
}
