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
  type SlimFood,
} from "./format.ts";

// Imports the files exported by the "Anotar precio" bookmarklet: validates them
// strictly, merges the products into data/store-products/<Store>.json and
// (optionally) writes the prices through the weekly runner's sink. Writing is
// all-or-nothing: every price is checked (range, jump guard, reference band for
// a first price) BEFORE anything is written. A price a person read on the
// store's own public page counts as source 'official' (the sink writes that).

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), {
    message: "not a real date",
  });

const entryFields = {
  foodId: z.string().min(1).max(80),
  externalId: z.string().regex(EXTERNAL_ID_RE),
  name: z.string().min(1).max(MAX_NAME).refine((n) => cleanName(n) === n, { message: "control characters or padding" }),
  packSize: z.number().positive().max(100_000),
  url: z.string().max(500),
  regularPriceCop: z.number().int().min(MIN_PRICE_COP).max(MAX_PRICE_COP),
  observedOn: isoDay,
};

const fileFields = {
  store: z.string().min(1).max(40),
  city: z.literal(CITY),
  capturedOn: isoDay,
  cityAttested: z.literal(true),
};

/** Version 1 (before packConfirmed): every pack is read as unconfirmed. */
const v1Schema = z
  .object({
    schemaVersion: z.literal(1),
    ...fileFields,
    entries: z.array(z.object(entryFields).strict()).min(1).max(200),
  })
  .strict();

const v2Schema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    ...fileFields,
    entries: z
      .array(z.object({ ...entryFields, packConfirmed: z.boolean() }).strict())
      .min(1)
      .max(200),
  })
  .strict();

export const manualExportSchema = z.discriminatedUnion("schemaVersion", [v1Schema, v2Schema]);

/** Same band as the planner's REFERENCE_MIN_RATIO / MAX (priceBook.ts) and the DANE sanity rule (dane/derive.ts). */
export const REFERENCE_MIN_RATIO = 0.33;
export const REFERENCE_MAX_RATIO = 3;

export interface ImportFood extends SlimFood {
  /** Static reference price in COP per base unit (foods.json). */
  refPriceCop: number;
}

export interface MappingEntry {
  foodId: string;
  externalId: string;
  name: string;
  packSize: number;
  url: string;
}

export interface PlannedPrice {
  /** The product with the pack this price was observed with (always the product's final pack). */
  product: MappedProduct;
  regularPriceCop: number;
  observedOn: string;
}

export interface ImportPlan {
  errors: string[];
  /** Entries older than MAX_AGE_DAYS skipped with skipStale. */
  stale: string[];
  /** Pack size changes accepted with allowPackChange. */
  packChanges: string[];
  /** Prices seen with an older pack, dropped with allowPackChange (never stored under the new pack). */
  dropped: string[];
  /** New content of each touched store's mapping file. */
  mappings: Partial<Record<StoreId, MappingEntry[]>>;
  changes: Partial<Record<StoreId, { added: string[]; updated: string[]; removed: string[] }>>;
  prices: PlannedPrice[];
  /** Store products that were mapped before and no longer are (made inactive on write). */
  retired: MappedProduct[];
}

export interface PlanInput {
  files: { name: string; json: unknown }[];
  policy: unknown;
  foods: readonly ImportFood[];
  /** Current content of data/store-products/<Store>.json per store (missing file: absent). */
  mappings: Partial<Record<string, MappingEntry[]>>;
  /** YYYY-MM-DD (UTC). */
  today: string;
  skipStale?: boolean;
  /** Accept packs the person typed by hand (packConfirmed false, or version 1 files). */
  allowUnconfirmedPack?: boolean;
  /** Accept a new pack size for a product already mapped or seen with another pack. */
  allowPackChange?: boolean;
}

interface Entry extends ManualEntry {
  storeId: StoreId;
  at: string;
  capturedOn: string;
  file: string;
}

const DAY_MS = 86_400_000;
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const byFood = (a: MappingEntry, b: MappingEntry) => (a.foodId < b.foodId ? -1 : a.foodId > b.foodId ? 1 : 0);
const productKey = (storeId: string, externalId: string) => `${storeId}:${externalId}`;
const toMapping = (e: ManualEntry): MappingEntry => ({
  foodId: e.foodId,
  externalId: e.externalId,
  name: e.name,
  packSize: e.packSize,
  url: e.url,
});
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
  const plan: ImportPlan = { errors: [], stale: [], packChanges: [], dropped: [], mappings: {}, changes: {}, prices: [], retired: [] };
  const accepted: Entry[] = [];

  // ---- 1. each file on its own ----
  for (const { name, json } of input.files) {
    const parsed = manualExportSchema.safeParse(json);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) plan.errors.push(`${name}: ${issue.path.join(".") || "(file)"}: ${issue.message}`);
      continue;
    }
    const file = parsed.data;
    const site = sites.find((s) => s.storeId === file.store);
    if (!site) {
      plan.errors.push(`${name}: store: "${file.store}" is not an allowed store in policy.json`);
      continue;
    }
    if (dayNumber(file.capturedOn) > today) plan.errors.push(`${name}: capturedOn: in the future`);
    const foodsSeen = new Set<string>();
    const idsSeen = new Set<string>();
    file.entries.forEach((raw, i) => {
      // Version 1 had no packConfirmed: every pack counts as typed by hand.
      const e: ManualEntry = { ...raw, packConfirmed: "packConfirmed" in raw && raw.packConfirmed === true };
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
      if (!e.packConfirmed && !input.allowUnconfirmedPack) {
        problems.push("packConfirmed: the pack was typed by hand (not confirmed by the page); re-capture it or pass --allow-unconfirmed-pack");
      }
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
      accepted.push({ ...e, storeId: site.storeId, at, capturedOn: file.capturedOn, file: name });
    });
  }
  if (plan.errors.length > 0) return plan;

  // ---- 2. merge, oldest export first so the newest choice for a food or a product wins ----
  accepted.sort((a, b) => a.capturedOn.localeCompare(b.capturedOn) || a.file.localeCompare(b.file));
  for (const e of accepted) {
    const before = input.mappings[e.storeId] ?? [];
    const current = plan.mappings[e.storeId] ?? before.map((m) => ({ ...m }));
    plan.mappings[e.storeId] = [...current.filter((m) => m.foodId !== e.foodId && m.externalId !== e.externalId), toMapping(e)];
  }
  for (const store of Object.keys(plan.mappings) as StoreId[]) plan.mappings[store] = (plan.mappings[store] ?? []).sort(byFood);

  // ---- 3. pack changes: a product's pack never changes silently ----
  const finalPack = new Map<string, MappingEntry>();
  for (const [store, list] of Object.entries(plan.mappings) as [StoreId, MappingEntry[]][]) {
    for (const m of list) finalPack.set(productKey(store, m.externalId), m);
  }
  const packsSeen = new Map<string, Set<number>>();
  const addPack = (key: string, pack: number) => packsSeen.set(key, (packsSeen.get(key) ?? new Set()).add(pack));
  for (const [store, list] of Object.entries(input.mappings)) {
    for (const m of list ?? []) addPack(productKey(store, m.externalId), m.packSize);
  }
  for (const e of accepted) addPack(productKey(e.storeId, e.externalId), e.packSize);
  for (const [key, packs] of packsSeen) {
    const final = finalPack.get(key);
    if (!final || packs.size < 2) continue;
    const message = `${key}: pack size changed (${[...packs].join(" -> ")}; now ${final.packSize})`;
    if (input.allowPackChange) plan.packChanges.push(message);
    else plan.errors.push(`${message}; check the product or pass --allow-pack-change`);
  }
  if (plan.errors.length > 0) return plan;

  // ---- 4. changes, retired products and a final check with the real loader ----
  for (const [store, after] of Object.entries(plan.mappings) as [StoreId, MappingEntry[]][]) {
    const before = input.mappings[store] ?? [];
    plan.changes[store] = {
      added: after.filter((a) => !before.some((b) => b.foodId === a.foodId)).map((a) => a.foodId),
      updated: after.filter((a) => before.some((b) => b.foodId === a.foodId && !sameMapping(a, b))).map((a) => a.foodId),
      removed: before.filter((b) => !after.some((a) => a.foodId === b.foodId)).map((b) => b.foodId),
    };
    for (const b of before) {
      if (!after.some((a) => a.externalId === b.externalId)) plan.retired.push({ storeId: store, ...b });
    }
    const site = sites.find((s) => s.storeId === store);
    try {
      parseMappings(after, store, new Set(foodsById.keys()), site?.host ?? "", site?.productPathPattern);
    } catch (e) {
      plan.errors.push((e as Error).message);
    }
  }

  // ---- 5. prices: each (product, day) once, only under the pack it was seen with ----
  const latest = new Map<string, PlannedPrice>();
  for (const e of accepted) {
    const key = productKey(e.storeId, e.externalId);
    const final = finalPack.get(key);
    if (!final) {
      plan.dropped.push(`${e.at}: ${key} seen ${e.observedOn} is no longer mapped to a food (a newer export replaced it)`);
      continue;
    }
    if (final.packSize !== e.packSize) {
      plan.dropped.push(`${e.at}: ${key} seen ${e.observedOn} with pack ${e.packSize}, product now ${final.packSize}`);
      continue;
    }
    latest.set(`${key}:${e.observedOn}`, {
      product: { storeId: e.storeId, ...final },
      regularPriceCop: e.regularPriceCop,
      observedOn: e.observedOn,
    });
  }
  plan.prices = [...latest.values()];
  return plan;
}

/** What the importer needs from the database: the weekly sink plus two calls (see supabaseSink.ts). */
export interface ManualPriceSink extends PriceSink {
  /** Official prices already stored since `since`, keyed `${storeProductId}:${observedOn}`. */
  existingPrices(ids: number[], city: string, since: string): Promise<Map<string, number>>;
  /** Marks store products inactive (they lost their food). */
  deactivateProducts(ids: number[]): Promise<void>;
}

export type PriceSummary = Record<string, { saved: number; skipped: Record<string, number> }>;

export interface ApplyOptions {
  write: boolean;
  foods: readonly ImportFood[];
  today: string;
  /** Accept a first price outside x0.33 .. x3 of the food's reference price per pack. */
  allowPriceOutlier?: boolean;
  retired?: readonly MappedProduct[];
}

export interface ApplyResult {
  summary: PriceSummary;
  /** true when the products and prices were written (write mode and nothing refused). */
  written: boolean;
  /** Prices refused by a check; any refusal means nothing was written. */
  refused: number;
  deactivated: number;
}

/**
 * Checks every planned price against the database (read only), and only when none is refused
 * (and `write` is set) writes the products, the prices and the retired products. All or nothing.
 */
export async function applyPrices(plan: Pick<ImportPlan, "prices" | "retired">, sink: ManualPriceSink, opts: ApplyOptions): Promise<ApplyResult> {
  const summary: PriceSummary = {};
  const prices = plan.prices;
  const products = [...new Map(prices.map((p) => [productKey(p.product.storeId, p.product.externalId), p.product])).values()];
  const known = prices.length > 0 ? await sink.findProductIds(products) : new Map<string, number>();
  const knownIds = [...known.values()];
  const last = knownIds.length > 0 ? await sink.lastPrices(knownIds, CITY) : new Map<number, number>();
  const since = dayString(dayNumber(opts.today) - MAX_AGE_DAYS);
  const existing = knownIds.length > 0 ? await sink.existingPrices(knownIds, CITY, since) : new Map<string, number>();
  const foodsById = new Map(opts.foods.map((f) => [f.id, f]));

  const toWrite: PlannedPrice[] = [];
  let refused = 0;
  for (const p of prices) {
    const entry = (summary[p.product.storeId] ??= { saved: 0, skipped: {} });
    const skip = (reason: string, isRefusal: boolean) => {
      entry.skipped[reason] = (entry.skipped[reason] ?? 0) + 1;
      if (isRefusal) refused++;
    };
    const id = known.get(productKey(p.product.storeId, p.product.externalId));
    if (id !== undefined && existing.get(`${id}:${p.observedOn}`) === p.regularPriceCop) {
      skip("already_imported", false);
      continue;
    }
    const lastKnown = id === undefined ? null : (last.get(id) ?? null);
    const verdict = checkPrice(p.regularPriceCop, lastKnown);
    if (!verdict.ok) {
      skip(verdict.reason, true);
      continue;
    }
    if (lastKnown === null && !opts.allowPriceOutlier) {
      const food = foodsById.get(p.product.foodId);
      const reference = food ? food.refPriceCop * p.product.packSize : 0;
      const ratio = reference > 0 ? p.regularPriceCop / reference : Number.NaN;
      if (!(ratio >= REFERENCE_MIN_RATIO && ratio <= REFERENCE_MAX_RATIO)) {
        skip("outlier", true);
        continue;
      }
    }
    entry.saved++; // in a dry run or a refused batch: "would be saved"
    toWrite.push(p);
  }

  const result: ApplyResult = { summary, written: false, refused, deactivated: 0 };
  if (!opts.write || refused > 0) return result;

  if (toWrite.length > 0) {
    const ids = await sink.upsertProducts([
      ...new Map(toWrite.map((p) => [productKey(p.product.storeId, p.product.externalId), p.product])).values(),
    ]);
    const rows = toWrite.flatMap((p) => {
      const id = ids.get(productKey(p.product.storeId, p.product.externalId));
      return id === undefined ? [] : [{ storeProductId: id, city: CITY, regularPriceCop: p.regularPriceCop, observedOn: p.observedOn }];
    });
    if (rows.length > 0) await sink.upsertPrices(rows);
  }
  const retired = plan.retired ?? [];
  if (retired.length > 0) {
    const retiredIds = [...(await sink.findProductIds([...retired])).values()];
    if (retiredIds.length > 0) await sink.deactivateProducts(retiredIds);
    result.deactivated = retiredIds.length;
  }
  result.written = true;
  return result;
}

/** Plans the import and, when every file is valid and a sink is given, checks (and maybe writes) the prices. */
export async function importManualPrices(
  input: PlanInput & { sink?: ManualPriceSink; write: boolean; allowPriceOutlier?: boolean },
): Promise<{ plan: ImportPlan; prices: ApplyResult | null }> {
  const plan = planImport(input);
  if (plan.errors.length > 0 || !input.sink) return { plan, prices: null };
  const prices = await applyPrices(plan, input.sink, {
    write: input.write,
    foods: input.foods,
    today: input.today,
    allowPriceOutlier: input.allowPriceOutlier,
    retired: plan.retired,
  });
  return { plan, prices };
}
