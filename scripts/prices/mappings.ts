import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { checkProductUrl } from "./access.ts";
import { STORE_IDS, type MappedProduct, type StoreId } from "./types.ts";

// data/store-products/<StoreId>.json: which product of a store equals which
// food, and how much of the food's base unit (g, ml, unit) one pack holds.

const entrySchema = z
  .object({
    foodId: z.string().min(1),
    externalId: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    packSize: z.number().positive().max(100_000),
    url: z.string().url(),
  })
  .strict();

export function parseMappings(
  json: unknown,
  storeId: StoreId,
  foodIds: ReadonlySet<string>,
  allowedHost: string,
  productPathPattern?: string,
): MappedProduct[] {
  if (!Array.isArray(json)) throw new Error(`${storeId} mappings: expected an array`);
  const errors: string[] = [];
  const out: MappedProduct[] = [];
  const seen = new Set<string>();
  json.forEach((raw, i) => {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`entry ${i}: ${issue.path.join(".") || "(entry)"}: ${issue.message}`);
      }
      return;
    }
    const e = parsed.data;
    const problems: string[] = [];
    if (!foodIds.has(e.foodId)) problems.push(`foodId: unknown food "${e.foodId}"`);
    const url = productPathPattern
      ? checkProductUrl(e.url, allowedHost, productPathPattern, [])
      : checkBasicUrl(e.url, allowedHost);
    if (!url.ok) problems.push(`url: ${url.why}`);
    if (seen.has(e.externalId)) problems.push(`externalId: duplicate "${e.externalId}"`);
    seen.add(e.externalId);
    if (problems.length > 0) {
      for (const p of problems) errors.push(`entry ${i}: ${p}`);
      return;
    }
    out.push({ storeId, ...e });
  });
  if (errors.length > 0) throw new Error(`${storeId} mappings invalid:\n${errors.join("\n")}`);
  return out;
}

function checkBasicUrl(raw: string, host: string): { ok: true } | { ok: false; why: string } {
  const u = new URL(raw);
  if (u.protocol !== "https:") return { ok: false, why: "must be https" };
  if (u.hostname !== host) return { ok: false, why: `not on host ${host}` };
  return { ok: true };
}

/** Reads every data/store-products/<StoreId>.json that exists; a missing file is skipped. */
export function loadMappings(
  dir: string,
  foodIds: ReadonlySet<string>,
  hosts: Partial<Record<StoreId, string>>,
  patterns: Partial<Record<StoreId, string | undefined>>,
): Record<string, MappedProduct[]> {
  const out: Record<string, MappedProduct[]> = {};
  for (const storeId of STORE_IDS) {
    const file = path.join(dir, `${storeId}.json`);
    const host = hosts[storeId];
    if (!host || !existsSync(file)) continue;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`${storeId}.json: ${(e as Error).message}`);
    }
    out[storeId] = parseMappings(json, storeId, foodIds, host, patterns[storeId]);
  }
  return out;
}
