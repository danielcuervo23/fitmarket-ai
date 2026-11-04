import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { STORE_IDS, type StoreReader } from "../types.ts";

// Readers are discovered, not registered: every module in the stores folder
// that exports a `reader` is picked up. Adding a store never edits a shared file.

const MODULE_FILE = /\.(ts|mjs|js)$/;

function isReader(value: unknown): value is StoreReader {
  if (typeof value !== "object" || value === null) return false;
  const r = value as { storeId?: unknown; read?: unknown };
  return typeof r.read === "function" && (STORE_IDS as readonly unknown[]).includes(r.storeId);
}

export async function loadReaders(dir: string): Promise<StoreReader[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && MODULE_FILE.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name))
    .map((e) => e.name)
    .sort();
  const readers: StoreReader[] = [];
  const owner = new Map<string, string>();
  for (const file of files) {
    const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as { reader?: unknown };
    if (mod.reader === undefined) continue;
    if (!isReader(mod.reader)) throw new Error(`${file}: "reader" export is not a valid StoreReader`);
    const first = owner.get(mod.reader.storeId);
    if (first) throw new Error(`duplicate reader for ${mod.reader.storeId}: ${first} and ${file}`);
    owner.set(mod.reader.storeId, file);
    readers.push(mod.reader);
  }
  return readers;
}
