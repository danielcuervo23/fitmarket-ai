import type { StoreId } from "../types.ts";
import { MAX_PRICE_COP, MIN_PRICE_COP } from "../validate.ts";
import {
  CITY,
  SCHEMA_VERSION,
  EXTERNAL_ID_RE,
  canonicalProductUrl,
  cleanName,
  exportFileName,
  isPlausiblePack,
  type ManualEntry,
  type ManualExport,
  type SlimFood,
  type StoreSite,
} from "./format.ts";
import type { PageProduct } from "./pageReader.ts";

// What the bookmarklet keeps in the store's localStorage between product pages,
// and the export built from it. Pure functions: the DOM layer only renders them.

export interface CaptureState {
  version: 2;
  store: StoreId;
  entries: ManualEntry[];
}

export type SaveResult =
  /** `replaced`: entries of another product or food that this save removed (empty for a plain update). */
  | { ok: true; state: CaptureState; entry: ManualEntry; replaced: ManualEntry[] }
  /** The entry is not acceptable; `message` says why. */
  | { ok: false; needsConfirmation?: false; message: string }
  /** Saving would replace `replaced`: ask the person, then save again with `replaceConfirmed`. */
  | { ok: false; needsConfirmation: true; message: string; replaced: ManualEntry[] };

export interface SaveInput {
  product: PageProduct;
  foodId: string;
  packSize: number;
  /** The page confirmed `packSize` with the store's rules. */
  packConfirmed: boolean;
  /** The person ticked "Revisé el tamaño a mano" (needed when the page did not confirm the pack). */
  packReviewed: boolean;
  /** "Tengo Bucaramanga seleccionada" ticked on this page; never remembered. */
  attested: boolean;
  today: string;
  foods: readonly SlimFood[];
  site: StoreSite;
  /** The person answered "Sí, reemplazar" to the replacement question. */
  replaceConfirmed?: boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const STOPWORDS = new Set(["de", "del", "la", "las", "los", "el", "con", "para", "en", "y"]);

export function emptyState(store: StoreId): CaptureState {
  return { version: 2, store, entries: [] };
}

/** Why an entry is not acceptable, or null when it is. */
function entryProblem(e: ManualEntry, foods: readonly SlimFood[], site: StoreSite): string | null {
  const food = foods.find((f) => f.id === e.foodId);
  if (!food) return "Elige un alimento de la lista.";
  if (typeof e.externalId !== "string" || !EXTERNAL_ID_RE.test(e.externalId)) return "El código del producto no es válido.";
  if (typeof e.name !== "string" || e.name === "" || cleanName(e.name) !== e.name) return "El nombre del producto no es válido.";
  if (!isPlausiblePack(e.packSize, food)) {
    const unit = food.unit === "unit" ? "unidades" : food.unit;
    return `El tamaño (${String(e.packSize)} ${unit}) no cuadra con "${food.nameEs}". Revisa el tamaño o elige otro producto.`;
  }
  if (typeof e.url !== "string" || canonicalProductUrl(e.url, site) !== e.url) return "Este producto no es de esta tienda.";
  if (!Number.isInteger(e.regularPriceCop) || e.regularPriceCop < MIN_PRICE_COP || e.regularPriceCop > MAX_PRICE_COP) {
    return "El precio no parece real.";
  }
  if (typeof e.observedOn !== "string" || !ISO_DAY.test(e.observedOn)) return "La fecha no es válida.";
  if (typeof e.packConfirmed !== "boolean") return "Falta saber si el tamaño se confirmó en la página.";
  return null;
}

export function saveEntry(state: CaptureState, input: SaveInput): SaveResult {
  if (input.attested !== true) {
    return { ok: false, message: "Marca la casilla: primero elige Bucaramanga en la tienda y confírmalo aquí." };
  }
  const entry: ManualEntry = {
    foodId: input.foodId,
    externalId: input.product.externalId,
    name: input.product.name,
    packSize: input.packSize,
    url: input.product.url,
    regularPriceCop: input.product.regularPriceCop,
    observedOn: input.today,
    packConfirmed: input.packConfirmed === true,
  };
  if (!entry.packConfirmed && input.packReviewed !== true) {
    return {
      ok: false,
      message: 'La página no confirma este tamaño. Revísalo en la página y marca "Revisé el tamaño a mano".',
    };
  }
  const problem = entryProblem(entry, input.foods, input.site);
  if (problem !== null) return { ok: false, message: problem };
  // One food has one product and one product belongs to one food. Replacing another
  // product or food is never silent: the person must confirm it first.
  const replaced = wouldReplace(state, entry);
  if (replaced.length > 0 && input.replaceConfirmed !== true) {
    return { ok: false, needsConfirmation: true, message: replaceQuestion(replaced, input.foods), replaced };
  }
  const rest = state.entries.filter((e) => e.foodId !== entry.foodId && e.externalId !== entry.externalId);
  const entries = [...rest, entry].sort((a, b) => a.foodId.localeCompare(b.foodId));
  return { ok: true, state: { ...state, entries }, entry, replaced };
}

/** Saved entries that saving `entry` would remove, except the same product for the same food (a plain update). */
function wouldReplace(state: CaptureState, entry: ManualEntry): ManualEntry[] {
  return state.entries.filter(
    (e) =>
      (e.foodId === entry.foodId || e.externalId === entry.externalId) &&
      !(e.foodId === entry.foodId && e.externalId === entry.externalId),
  );
}

const foodName = (foodId: string, foods: readonly SlimFood[]) => foods.find((f) => f.id === foodId)?.nameEs ?? foodId;

function replaceQuestion(replaced: readonly ManualEntry[], foods: readonly SlimFood[]): string {
  const list = replaced.map((e) => `«${e.name}» como ${foodName(e.foodId, foods)}`).join(" y ");
  const it = replaced.length > 1 ? "reemplazarlos" : "reemplazarlo";
  return `Ojo: ya tenías guardado ${list}. ¿Quieres ${it}?`;
}

/** The status line after a successful save: "Guardado: Arroz blanco (3 de 70)" or "Reemplazado: ...". */
export function savedMessage(result: Extract<SaveResult, { ok: true }>, foods: readonly SlimFood[]): string {
  const p = progress(result.state, foods);
  const verb = result.replaced.length > 0 ? "Reemplazado" : "Guardado";
  return `${verb}: ${foodName(result.entry.foodId, foods)} (${p.done} de ${p.total})`;
}

export function progress(
  state: CaptureState,
  foods: readonly SlimFood[],
): { done: number; total: number; missing: string[] } {
  const done = new Set(state.entries.map((e) => e.foodId));
  const missing = foods.filter((f) => !done.has(f.id)).map((f) => f.nameEs);
  return { done: foods.length - missing.length, total: foods.length, missing };
}

export function lastFoodFor(state: CaptureState, externalId: string): string | null {
  return state.entries.find((e) => e.externalId === externalId)?.foodId ?? null;
}

/** Reads the stored state; anything unreadable, foreign or invalid is dropped. */
export function parseState(
  raw: string | null,
  store: StoreId,
  foods: readonly SlimFood[],
  site: StoreSite,
): CaptureState {
  const state = emptyState(store);
  if (raw === null) return state;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return state;
  }
  if (typeof data !== "object" || data === null) return state;
  const d = data as { version?: unknown; store?: unknown; entries?: unknown };
  if (d.version !== 2 || d.store !== store || !Array.isArray(d.entries)) return state;
  const seenFoods = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of d.entries) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;
    const entry = {
      foodId: e.foodId,
      externalId: e.externalId,
      name: e.name,
      packSize: e.packSize,
      url: e.url,
      regularPriceCop: e.regularPriceCop,
      observedOn: e.observedOn,
      packConfirmed: e.packConfirmed,
    } as ManualEntry;
    if (entryProblem(entry, foods, site) !== null) continue;
    if (seenFoods.has(entry.foodId) || seenIds.has(entry.externalId)) continue;
    seenFoods.add(entry.foodId);
    seenIds.add(entry.externalId);
    state.entries.push(entry);
  }
  state.entries.sort((a, b) => a.foodId.localeCompare(b.foodId));
  return state;
}

export function buildExport(state: CaptureState, today: string): { fileName: string; data: ManualExport } | null {
  if (state.entries.length === 0) return null;
  return {
    fileName: exportFileName(state.store, today),
    data: {
      schemaVersion: SCHEMA_VERSION,
      store: state.store,
      city: CITY,
      capturedOn: today,
      cityAttested: true,
      entries: state.entries.map((e) => ({ ...e })),
    },
  };
}

// ---------- food suggestion ----------

/** Lower case without accents (combining marks U+0300-U+036F removed). */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function words(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** 1 for the same word, 0.9 for a plural-like ending (huevo / huevos), else 0. */
function wordMatch(foodWord: string, productWords: readonly string[]): number {
  let best = 0;
  for (const w of productWords) {
    if (w === foodWord) return 1;
    if (w.startsWith(foodWord) && w.length - foodWord.length <= 2) best = 0.9;
  }
  return best;
}

/**
 * Hints for foods whose catalog name alone is ambiguous. `keywords`: phrases (all
 * their words must appear) that point to that food over any other; the longest
 * matching phrase wins. `not`: words that mean the product is something else
 * (another animal or cut, quail eggs...), so the food is never suggested.
 * `needs`: a word without which the food is never suggested (a pork leg is not loin).
 */
const SUGGEST_HINTS: Readonly<
  Record<string, { keywords?: readonly string[]; not?: readonly string[]; needs?: string }>
> = {
  pechuga_pollo: { keywords: ["pechuga pollo", "pechuga"], not: ["pavo", "cerdo", "res", "entero", "alas"] },
  pernil_pollo: { keywords: ["pierna pollo", "pernil", "muslo", "contramuslo"], not: ["pavo", "cerdo", "res", "entero", "alas"] },
  carne_molida_res: { keywords: ["carne molida"], not: ["cerdo", "pollo", "pavo"] },
  res_sobrebarriga: { needs: "sobrebarriga" },
  lomo_cerdo: { needs: "lomo", not: ["res", "pollo"] },
  huevo: { not: ["codorniz"] },
  leche_deslactosada: { keywords: ["deslactosada"] },
  arroz_integral: { keywords: ["arroz integral"] },
  aceite_vegetal: { keywords: ["girasol", "canola", "soya"] },
};

/** All words of `phrase` appear in the product words (plural-like endings allowed). */
function hasAll(phrase: string, productWords: readonly string[]): boolean {
  return words(phrase).every((w) => wordMatch(w, productWords) > 0);
}

/** The food the product name points to, or null. Specific hints first, then the catalog name words. */
export function suggestFood(productName: string, foods: readonly SlimFood[]): string | null {
  const productWords = words(productName);
  const allowed = foods.filter((f) => {
    const hint = SUGGEST_HINTS[f.id];
    if (hint?.needs !== undefined && wordMatch(hint.needs, productWords) === 0) return false;
    return !(hint?.not ?? []).some((w) => productWords.includes(w));
  });

  let hinted: { id: string; length: number } | null = null;
  for (const food of allowed) {
    for (const phrase of SUGGEST_HINTS[food.id]?.keywords ?? []) {
      const length = words(phrase).length;
      if ((!hinted || length > hinted.length) && hasAll(phrase, productWords)) hinted = { id: food.id, length };
    }
  }
  if (hinted) return hinted.id;

  let best: { id: string; score: number; matched: number } | null = null;
  for (const food of allowed) {
    const foodWords = words(food.nameEs);
    if (foodWords.length === 0) continue;
    let sum = 0;
    let matched = 0;
    for (const fw of foodWords) {
      const m = wordMatch(fw, productWords);
      sum += m;
      if (m > 0) matched++;
    }
    const score = sum / foodWords.length;
    if (matched === 0 || score < 0.5) continue;
    if (!best || score > best.score || (score === best.score && matched > best.matched)) {
      best = { id: food.id, score, matched };
    }
  }
  return best?.id ?? null;
}

/** The person's own calendar day, YYYY-MM-DD. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Foods whose Spanish name contains the typed text (accents and case ignored). */
export function filterFoods(query: string, foods: readonly SlimFood[]): SlimFood[] {
  const q = fold(query.trim());
  return q === "" ? [...foods] : foods.filter((f) => fold(f.nameEs).includes(q));
}

