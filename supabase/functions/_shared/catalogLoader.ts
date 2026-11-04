import {
  STATIC_CATALOG,
  createCatalog,
  type Catalog,
  type DietTag,
  type FoodUnit,
  type Ingredient,
  type ShoppingCategory,
} from "./catalog.ts";
import { logEvent } from "./log.ts";
import { createCityPriceBook, type PriceBook, type PriceOffer } from "./planner/priceBook.ts";
import { STATIC_PRICE_BOOK } from "./planner/stores.ts";

export interface PlannerData {
  catalog: Catalog;
  prices: PriceBook;
  origin: "db" | "static";
}

/** The part of the Supabase client this module uses (a test can fake it). */
export interface CatalogQuery {
  eq(column: string, value: unknown): CatalogQuery;
  order(column: string): CatalogQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>;
}

export interface CatalogClient {
  from(table: string): { select(columns: string): CatalogQuery };
}

export interface LoadOptions {
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

/** A catalog this small is a broken or half-loaded table: use the built-in one. */
export const MIN_DB_FOODS = 40;

const PAGE_SIZE = 1000;
/** Safety stop: 50 000 rows is far beyond any real catalog. */
const MAX_PAGES = 50;
const DEFAULT_TTL_MS = 600_000;
const MAX_TTL_MS = 3_600_000;
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_CITY_ENTRIES = 50;

// ------------------------------------------------------------------ row mapping

const CATEGORIES: ReadonlySet<string> = new Set<ShoppingCategory>([
  "proteinas",
  "frutas_verduras",
  "lacteos",
  "granos",
  "bebidas",
  "condimentos",
  "otros",
]);
const UNITS: ReadonlySet<string> = new Set<FoodUnit>(["g", "ml", "unit"]);
const DIET_TAGS: ReadonlySet<string> = new Set<DietTag>([
  "lactose",
  "dairy",
  "egg",
  "gluten",
  "peanut",
  "tree_nut",
  "fish",
  "shellfish",
  "pork",
  "meat",
  "honey",
]);
const ID_PATTERN = /^[a-z0-9_]{2,40}$/;
const STORE_PATTERN = /^[A-Za-z0-9_]{1,20}$/;
const CITY_PATTERN = /^[a-z_]{2,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** numeric columns may arrive as numbers or numeric strings. */
function num(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") {
    value = Number(value);
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numIn(value: unknown, min: number, max: number): number | null {
  const n = num(value);

  return n !== null && n >= min && n <= max ? n : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= max ? value : null;
}

/**
 * One `foods` row to an Ingredient, or null when the row is not trustworthy.
 * Keys with no value are left out so a row for a built-in food equals it.
 */
export function foodRowToIngredient(row: unknown): Ingredient | null {
  if (!isRow(row)) {
    return null;
  }

  const id = typeof row.id === "string" && ID_PATTERN.test(row.id) ? row.id : null;
  const es = text(row.name_es, 80);
  const en = text(row.name_en, 80);
  const category = typeof row.shopping_category === "string" && CATEGORIES.has(row.shopping_category)
    ? (row.shopping_category as ShoppingCategory)
    : null;
  const unit = typeof row.unit === "string" && UNITS.has(row.unit) ? (row.unit as FoodUnit) : null;
  const kcal = numIn(row.kcal, 0, 900);
  const protein = numIn(row.protein_g, 0, 100);
  const carbs = numIn(row.carbs_g, 0, 100);
  const fat = numIn(row.fat_g, 0, 100);
  const pack = num(row.default_pack);
  const price = num(row.ref_price_cop);
  const priceSource = row.ref_price_source === "sample" || row.ref_price_source === "estimate"
    ? row.ref_price_source
    : null;
  const tags = row.diet_tags ?? [];

  if (
    id === null || es === null || en === null || category === null || unit === null ||
    kcal === null || protein === null || carbs === null || fat === null ||
    pack === null || pack <= 0 || price === null || price <= 0 || priceSource === null ||
    !Array.isArray(tags) || !tags.every((tag) => typeof tag === "string" && DIET_TAGS.has(tag))
  ) {
    return null;
  }

  const grams = row.grams_per_unit == null ? null : num(row.grams_per_unit);

  if ((row.grams_per_unit != null && (grams === null || grams <= 0)) || (unit === "unit" && grams === null)) {
    return null;
  }

  const ingredient: Ingredient = {
    id,
    name: { es, en },
    category,
    unit,
    per100: { kcal, protein, carbs, fat },
    tags: tags as DietTag[],
    pack,
    price,
    priceSource,
  };

  const pluralEs = text(row.plural_es, 80);
  const pluralEn = text(row.plural_en, 80);

  if (pluralEs !== null && pluralEn !== null) {
    ingredient.plural = { es: pluralEs, en: pluralEn };
  }

  if (row.whole_units === true) {
    ingredient.wholeUnits = true;
  }

  if (grams !== null) {
    ingredient.gramsPerUnit = grams;
  }

  return ingredient;
}

function priceRowToOffer(row: unknown): PriceOffer | null {
  if (!isRow(row)) {
    return null;
  }

  const packSize = num(row.pack_size);
  const price = num(row.regular_price_cop);

  if (
    typeof row.store_id !== "string" || !STORE_PATTERN.test(row.store_id) ||
    typeof row.food_id !== "string" || !ID_PATTERN.test(row.food_id) ||
    packSize === null || packSize <= 0 ||
    price === null || price < 0 ||
    (row.source !== "official" && row.source !== "user") ||
    typeof row.observed_on !== "string" || !DATE_PATTERN.test(row.observed_on)
  ) {
    return null;
  }

  return {
    storeId: row.store_id,
    foodId: row.food_id,
    packSize,
    regularPriceCop: price,
    source: row.source,
    observedOn: row.observed_on,
  };
}

function inactiveRow(row: unknown): { storeId: string; foodId: string } | null {
  if (
    !isRow(row) ||
    typeof row.store_id !== "string" || !STORE_PATTERN.test(row.store_id) ||
    typeof row.food_id !== "string" || !ID_PATTERN.test(row.food_id)
  ) {
    return null;
  }

  return { storeId: row.store_id, foodId: row.food_id };
}

// ---------------------------------------------------------------------- helpers

/** TTL from CATALOG_CACHE_TTL_MS: default 10 minutes, clamped to 0..1 hour. */
export function resolveCacheTtlMs(raw: string | undefined): number {
  const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);

  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), MAX_TTL_MS) : DEFAULT_TTL_MS;
}

/** Today's date in Colombia (UTC-5, no daylight saving) as YYYY-MM-DD. */
export function bogotaToday(nowMs: number): string {
  return new Date(nowMs - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** A load failure carrying only a short, safe code for the logs. */
class LoadFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "LoadFailure";
    this.code = code;
  }
}

const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/;

function failureCode(error: unknown): string {
  return error instanceof LoadFailure ? error.code : "exception";
}

/** Reads every page of a query, 1000 rows at a time, until a short page. */
async function readAll(build: () => CatalogQuery): Promise<unknown[]> {
  const rows: unknown[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const from = pageIndex * PAGE_SIZE;
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new LoadFailure(typeof error.code === "string" && SAFE_CODE.test(error.code) ? error.code : "query_error");
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return rows;
    }
  }

  throw new LoadFailure("too_many_rows");
}

/** The client subset has no abort, so a slow read is raced against a timer. */
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LoadFailure("timeout")), timeoutMs);
  });

  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

// ------------------------------------------------------------------------ cache

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function resetPlannerDataCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Fresh cached value, else one shared load. A failed load is not cached; the
 * last good value (even if expired) is served instead, and with none the
 * error reaches the caller.
 */
async function cached<T>(
  key: string,
  options: Required<LoadOptions>,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;

  if (hit && hit.expiresAt > options.now()) {
    return hit.value;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;

  if (pending) {
    return pending;
  }

  const started = withTimeout(load(), options.timeoutMs)
    .then((value) => {
      if (options.ttlMs > 0) {
        if (cache.size >= MAX_CITY_ENTRIES && !cache.has(key)) {
          cache.delete(cache.keys().next().value as string);
        }

        cache.set(key, { value, expiresAt: options.now() + options.ttlMs });
      }

      return value;
    })
    .catch((error: unknown) => {
      if (hit) {
        logEvent("catalog_stale_served", { reason: failureCode(error) });
        return hit.value;
      }

      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, started);

  return started;
}

// ---------------------------------------------------------------------- loaders

async function loadFoods(client: CatalogClient): Promise<Catalog> {
  const rows = await readAll(() =>
    client
      .from("foods")
      .select(
        "id, name_es, name_en, plural_es, plural_en, shopping_category, unit, whole_units, grams_per_unit, diet_tags, kcal, protein_g, carbs_g, fat_g, default_pack, ref_price_cop, ref_price_source",
      )
      .eq("is_active", true)
      .order("id")
  );
  const items = new Map<string, Ingredient>();
  let skipped = 0;

  for (const row of rows) {
    const ingredient = foodRowToIngredient(row);

    if (ingredient && !items.has(ingredient.id)) {
      items.set(ingredient.id, ingredient);
    } else {
      skipped += 1;
    }
  }

  if (skipped > 0) {
    logEvent("catalog_rows_skipped", { reason: "invalid_row", count: skipped });
  }

  if (items.size < MIN_DB_FOODS) {
    throw new LoadFailure("too_few_foods");
  }

  return createCatalog([...items.values()]);
}

interface CityPrices {
  offers: PriceOffer[];
  inactive: { storeId: string; foodId: string }[];
}

async function loadCityPrices(client: CatalogClient, city: string): Promise<CityPrices> {
  const [priceRows, inactiveRows] = await Promise.all([
    readAll(() =>
      client
        .from("current_prices")
        .select("store_id, food_id, store_product_id, pack_size, regular_price_cop, source, observed_on")
        .eq("city", city)
        .order("store_product_id")
    ),
    readAll(() =>
      client.from("store_products").select("store_id, food_id").eq("is_active", false).order("id")
    ),
  ]);
  const offers = priceRows.map(priceRowToOffer).filter((offer): offer is PriceOffer => offer !== null);
  const inactive = inactiveRows
    .map(inactiveRow)
    .filter((row): row is { storeId: string; foodId: string } => row !== null);

  if (offers.length < priceRows.length) {
    logEvent("prices_rows_skipped", { reason: "invalid_row", count: priceRows.length - offers.length });
  }

  return { offers, inactive };
}

const STATIC_DATA: PlannerData = {
  catalog: STATIC_CATALOG,
  prices: STATIC_PRICE_BOOK,
  origin: "static",
};

/**
 * The catalog and price book the planner works from. Reads the database with
 * the caller's client (never the service role); any problem (error, missing
 * table, timeout, too few foods) returns today's built-in data instead, so a
 * plan can always be made. No city means estimate prices, as before.
 */
export async function loadPlannerData(
  client: CatalogClient,
  city: string | null,
  options: LoadOptions = {},
): Promise<PlannerData> {
  const resolved: Required<LoadOptions> = {
    now: options.now ?? Date.now,
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const safeCity = city !== null && CITY_PATTERN.test(city) ? city : null;

  const [catalogResult, pricesResult] = await Promise.allSettled([
    cached("foods", resolved, () => loadFoods(client)),
    safeCity === null
      ? Promise.resolve(null)
      : cached(`prices:${safeCity}`, resolved, () => loadCityPrices(client, safeCity)),
  ]);

  if (catalogResult.status === "rejected") {
    logEvent("catalog_fallback", { reason: failureCode(catalogResult.reason) });
    return STATIC_DATA;
  }

  if (pricesResult.status === "rejected") {
    logEvent("catalog_fallback", { reason: `prices_${failureCode(pricesResult.reason)}` });
    return { catalog: catalogResult.value, prices: STATIC_PRICE_BOOK, origin: "db" };
  }

  const cityPrices = pricesResult.value;

  return {
    catalog: catalogResult.value,
    prices: cityPrices
      ? createCityPriceBook(cityPrices.offers, {
          today: bogotaToday(resolved.now()),
          inactive: cityPrices.inactive,
        })
      : STATIC_PRICE_BOOK,
    origin: "db",
  };
}
