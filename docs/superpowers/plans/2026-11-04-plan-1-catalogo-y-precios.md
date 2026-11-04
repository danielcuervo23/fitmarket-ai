# Plan 1: Catálogo y precios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the food catalog and the store prices from code into Supabase, read weekly regular prices for Bucaramanga from the stores whose terms allow it, and show in the web when each price was updated or that it is "aproximado", without changing plans for current users.

**Architecture:** Three new public tables (`foods`, `store_products`, `prices`) plus `cities` and `profiles.city`, readable by signed-in users and writable only with the service role. The planner stops importing the catalog directly: it receives a `Catalog` and a `PriceBook` object. The Edge Function builds both from the database (paginated, cached per instance for 10 minutes, falling back to today's static catalog and price factors if the database is missing or broken). A weekly GitHub Actions job runs one reader module per allowed store and upserts regular prices with a service-role key kept in GitHub secrets.

**Tech Stack:** React 18 + Vite, Supabase (Postgres + RLS, Edge Functions on Deno), TypeScript with erasable syntax only, `node --test` (`*.test.mjs` importing `.ts` directly), `@supabase/supabase-js` 2.x, `zod` 4.6.7, GitHub Actions (Node 22).

**Spec:** `docs/superpowers/specs/2026-11-04-comidas-y-precios-design.md` (this plan implements phase 1, "Catálogo y precios", sections 6.1, 6.2, 7 and the price decisions in section 8).

## Global Constraints

- **TDD is mandatory.** Every step that adds behaviour starts with a test that is run and seen failing for the right reason; only then the minimal code; then cleanup. A task is not done until `npm run check` is green.
- **One branch per task** (`feat/plan1-tNN-<slug>`). Two agents never work on the same branch or the same file at the same time. The "Parallel waves" table below is the only allowed concurrency; at most 4 agents at once. Implementers do not launch subagents.
- **No secret in code, fixtures or logs.** Keys live in Supabase secrets (`SUPABASE_SERVICE_ROLE_KEY`) or GitHub environment secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `USDA_API_KEY`). `VITE_*` variables are public by design.
- **Validate every input:** database rows read by the function, store pages and API answers, mapping files, profile city, USDA/OFF answers. Invalid data is skipped and logged with a code, never trusted.
- **Least privilege:** new tables get `revoke all ... from anon, authenticated` then `grant select ... to authenticated` and a `for select to authenticated using (true)` policy; no insert/update/delete policy at all (service role bypasses RLS). The Edge Function reads the catalog with the caller's JWT client, not the service role. The price workflow has `permissions: contents: read` and runs in a protected GitHub environment named `prices`.
- **Performance at thousands of users:** prices are read once a week by the job, never per user. The function caches catalog and prices per instance (`CATALOG_CACHE_TTL_MS`, default 600 000, clamped 0–3 600 000), shares one in-flight load between concurrent requests, and reads with `.range()` pages of 1000 rows. Every lookup has an index.
- **Backward compatibility:** users without a city get exactly today's prices (static factors, labelled "aproximado"). The legacy macros (`kcal`, `protein`, `carbs`, `fat`), packs and reference prices of the ~70 foods are copied unchanged into `foods`. New plan fields are optional; old plans and old app versions keep working. Deploy order is **migrations → price job → Edge Function → web**, and every step works with the previous one still live.
- **Legal:** a store whose `robots.txt` or terms forbid reading is not read (`scripts/prices/policy.json` → `"allowed": false`). Only the regular price is stored, never the promotion price. The ICBF TCAC is not used. USDA FoodData Central (public domain) and Open Food Facts (ODbL, cited) are the nutrition sources.
- **Migrations** follow the repo pattern `supabase/migrations/NNN_snake_name.sql`; this plan owns 010, 011 and 012.
- **TypeScript run by Node:** only erasable syntax (no `enum`, no parameter properties, no namespaces); relative imports include the `.ts` extension.
- **Store ids** are the existing `supermarkets.id` values: `D1`, `Ara`, `Exito`, `Jumbo`, `Carulla`. City slugs match `^[a-z_]{2,40}$`; the launch city is `bucaramanga`.
- **Price source labels:** `official` (read from the store), `user` (reserved for plan 5), `estimate` (computed; shown as "aproximado"). Legacy `sample` reference prices count as `estimate`.
- **Freshness:** an `official`/`user` price older than `MAX_PRICE_AGE_DAYS = 45` is ignored and the estimate applies. A product missing from a weekly read keeps its last price and date.
- **Price sanity:** a read price is stored only if it is an integer between 50 and 5 000 000 COP and, when a previous price exists, between ×0.5 and ×2 of it; otherwise it is reported as an anomaly and skipped.
- **Copy:** Spanish first, every string in `es` and `en` through `defineMessages`. Label for estimates: "Aproximado" / "Approximate". Updated label: "Actualizado el {date}" / "Updated {date}".

### Parallel waves (disjoint files)

| Wave | Tasks (max 4 at once) | Waits for |
| --- | --- | --- |
| A | T1 legal review · T2 tables · T3 foods data · T4 catalog object | — (T1 starts first) |
| B | T5 price book · T7 city in profile · T8 price labels in web · T9 reader framework | T5←T4 · T7←T2 · T8←(field names only) · T9←T1, T2 |
| C | T6 loader in function · T10 VTEX readers · T11 D1 reader · T12 Ara reader | T6←T3, T5 · T10/T11/T12←T9 and only if T1 marks the store `allowed` |
| D | T13 docs and ordered rollout | all |

T4 → T5 touch the same planner files and must be sequential. T10, T11 and T12 each own their own files and may run together.

## Review Focus

1. **Function deployed before the migration, or tables empty/partial** (fewer than 40 active foods): the function must fall back to the static catalog and factors and produce the same plan as today, never a 500. Test in T6.
2. **User with no city, or a city with no read prices (e.g. `bogota`)**: every item must come out as `estimate` with today's numbers and show "Aproximado". Tests in T5 and T6.
3. **Stale or delisted products**: a price older than 45 days, or a `store_products` row with `is_active = false`, must not be used; the estimate (or "not carried") applies. Tests in T5.
4. **Reader gets a promotion-only page, a per-kg price for a pack, or a 10× parsing error**: it must keep the regular price or skip with an anomaly, never store the wrong number. Tests in T9 (sanity guard) and T10/T11 (fixtures).
5. **Old plans without `price_source` and old web against new plans**: the web must render both without crashing; missing source is shown as "Aproximado". Tests in T8 (and schema compatibility in T5).

---

### Task 1: Legal review of the five stores for Bucaramanga

**Files:**
- Create: `docs/PRICE_SOURCES.md`
- Create: `scripts/prices/policy.json`
- Test: `scripts/prices/policy.test.mjs`
- Modify: `package.json` (test glob `"scripts/*.test.mjs"` → `"scripts/**/*.test.mjs"`, so later `scripts/foods/` and `scripts/prices/` tests run in `npm test`)

**Interfaces:**
- Produces: `scripts/prices/policy.json` with this exact shape, read by T9's runner:

```json
{
  "checkedOn": "2026-11-05",
  "userAgent": "FitMarketPriceBot/1.0 (+<contact URL given by the owner>)",
  "stores": {
    "D1": {
      "allowed": true,
      "reason": "short text",
      "robotsUrl": "https://domicilios.tiendasd1.com/robots.txt",
      "disallowedPaths": ["/checkout"],
      "termsUrl": "https://...",
      "termsSummary": "what the terms say about automated access and reuse of prices",
      "method": "vtex_api | jsonld_html | json_api | none",
      "bucaramanga": { "available": true, "how": "cookie / query param / store id that selects Bucaramanga" },
      "minDelayMs": 3000
    }
  }
}
```

- [ ] **Step 1: Write the failing test** `scripts/prices/policy.test.mjs` with `node:test`:
  - `test("policy covers exactly the five stores")`: `Object.keys(policy.stores).sort()` deep-equals `["Ara","Carulla","D1","Exito","Jumbo"]`.
  - `test("checkedOn is a real ISO date not in the future")`.
  - `test("allowed stores have a reading method, Bucaramanga coverage and polite delay")`: for each store with `allowed === true`: `method !== "none"`, `bucaramanga.available === true`, `minDelayMs >= 2000`, `termsUrl` and `robotsUrl` start with `https://`, `termsSummary.length >= 40`.
  - `test("forbidden stores are not read")`: `allowed === false` ⇒ `method === "none"`.
  - `test("user agent names a contact")`: `userAgent` matches `/^FitMarketPriceBot\/\d+\.\d+ \(\+https:\/\/.+\)$/`.
- [ ] **Step 2: Run** `node --test scripts/prices/policy.test.mjs` — Expected: FAIL, `policy.json` not found.
- [ ] **Step 3: Do the review.** For each of `domicilios.tiendasd1.com`, `aratiendas.com` (catalog pages), `exito.com`, `tiendasjumbo.co` (or the current Jumbo Colombia domain), `carulla.com`: fetch `robots.txt` (record allowed/disallowed paths relevant to product or search pages), read the terms of use and privacy/legal pages for clauses on automated access, scraping, crawlers or reuse of content, find whether prices are city-specific and how Bucaramanga is selected, and identify the least intrusive method (public product API used by the site itself, JSON-LD `Product` data, plain HTML). Ara: record whether its catalogs show regular prices or only promotion flyers; promotion-only ⇒ `allowed: false` with reason "solo volante de promoción". Any explicit prohibition, or a `Disallow` covering the needed paths ⇒ `allowed: false`. Write `docs/PRICE_SOURCES.md` in plain Spanish (one section per store: what was checked, date, quotes of the relevant clauses with links, decision, how it is read) and a summary table; add the disclaimer that it is not legal advice and needs the owner's OK. Fill `policy.json` accordingly. Leave the contact URL as `https://fitmarket.app/contacto` placeholder only if the owner has not provided one, and flag it in the doc.
- [ ] **Step 4: Change the test glob** in `package.json` to `"scripts/**/*.test.mjs"`.
- [ ] **Step 5: Run** `npm test` — Expected: PASS, including `policy.test.mjs` and the existing `scripts/vercelConfig.test.mjs`.
- [ ] **Step 6: Commit** `git add docs/PRICE_SOURCES.md scripts/prices/policy.json scripts/prices/policy.test.mjs package.json && git commit -m "docs: legal review of store price sources for Bucaramanga"`.

---

### Task 2: Tables, RLS and profile city (migrations 010 and 011)

**Files:**
- Create: `supabase/migrations/010_cities_and_profile_city.sql`
- Create: `supabase/migrations/011_food_catalog_and_prices.sql`
- Create: `supabase/tests/catalog_checks.sql` (manual verification queries with expected results in comments)
- Test: `scripts/catalogMigrations.test.mjs`

**Interfaces:**
- Produces (exact names used by T3, T6, T7, T9):
  - `public.cities(slug text pk check (slug ~ '^[a-z_]{2,40}$'), name text not null, sort_order smallint not null default 0, is_active boolean not null default true)`. Seed: `bucaramanga` (sort 1), `bogota`, `medellin`, `cali`, `barranquilla`, `cartagena`, `cucuta`, `pereira`, `manizales`, `ibague`, `villavicencio`, `santa_marta`.
  - `public.profiles.city text null references public.cities(slug) on delete set null` (NULL = not answered; existing rows stay NULL).
  - `public.foods` columns: `id text pk check (id ~ '^[a-z0-9_]{2,40}$')`, `name_es`, `name_en` (text not null, 1–80 chars), `plural_es`, `plural_en` (text null), `shopping_category text not null check in ('proteinas','frutas_verduras','lacteos','granos','bebidas','condimentos','otros')`, `unit text not null check in ('g','ml','unit')`, `whole_units boolean not null default false`, `grams_per_unit numeric(7,2) null check (> 0)` with `check (unit <> 'unit' or grams_per_unit is not null)`, `diet_tags text[] not null default '{}' check (diet_tags <@ array['lactose','dairy','egg','gluten','peanut','tree_nut','fish','shellfish','pork','meat','honey'])`, `kcal numeric(6,1) not null check 0–900`, `protein_g`, `carbs_g`, `fat_g` (`numeric(5,2) not null check 0–100`), `fiber_g`, `free_sugars_g`, `sat_fat_g` (`numeric(5,2) not null check 0–100`), `sodium_mg numeric(7,1) not null check 0–40000`, `iron_mg numeric(5,2) not null check 0–100`, `gaba_group text null check in ('cereales_tuberculos','frutas_verduras','lacteos','proteicos','grasas','azucares')`, `is_fruit_veg boolean not null default false`, `default_pack numeric(8,2) not null check (> 0)`, `ref_price_cop numeric(10,4) not null check (> 0)`, `ref_price_source text not null check in ('sample','estimate')`, `nutrition_source text not null check in ('usda','off')`, `nutrition_ref text not null` (FDC id or barcode), `is_active boolean not null default true`, `created_at`, `updated_at timestamptz not null default now()`; table checks `fiber_g <= carbs_g`, `free_sugars_g <= carbs_g`, `sat_fat_g <= fat_g`.
  - `public.store_products(id bigint generated always as identity pk, store_id text not null references supermarkets(id), food_id text not null references foods(id), external_id text not null (1–120), name text not null (1–200), pack_size numeric(8,2) not null check (> 0) -- in the food's unit, url text null check (url ~ '^https://'), is_active boolean not null default true, created_at, updated_at, unique (store_id, external_id))`, index on `(food_id)`.
  - `public.prices(id bigint identity pk, store_product_id bigint not null references store_products(id) on delete cascade, city text not null references cities(slug), source text not null check in ('official','user','estimate'), regular_price_cop integer not null check (between 50 and 5000000), observed_on date not null, created_at timestamptz not null default now(), unique (store_product_id, city, source, observed_on))`, index `prices_city_product_date_idx on (city, store_product_id, observed_on desc)`.
  - View `public.current_prices with (security_invoker = true)`: `distinct on (p.city, p.store_product_id)` the latest `official`/`user` row of active products, columns `city, store_id, food_id, store_product_id, pack_size, regular_price_cop, source, observed_on`, ordered `p.city, p.store_product_id, p.observed_on desc, (p.source = 'official') desc`.
  - A `set_updated_at` trigger on `foods` and `store_products` (reuse the existing trigger function if a previous migration created one; otherwise create `public.set_updated_at()` with `security invoker` and `set search_path = ''`).
  - Grants: `revoke all on cities, foods, store_products, prices, current_prices from anon, authenticated; grant select on ... to authenticated;` RLS enabled on the four tables with one policy each: `for select to authenticated using (true)`. No write policies.

- [ ] **Step 1: Write the failing test** `scripts/catalogMigrations.test.mjs` (reads the SQL files as text, lower-cased, whitespace-collapsed):
  - `test("every new table has RLS enabled")` for `cities`, `foods`, `store_products`, `prices`.
  - `test("only select policies, only for authenticated")`: every `create policy` in 010/011 contains `for select` and `to authenticated`; none contains `for insert|update|delete|all`.
  - `test("anon and authenticated lose default privileges")`: `revoke all on` lists the four tables and `current_prices` `from anon, authenticated`.
  - `test("current_prices view is security invoker")`.
  - `test("profile city is nullable and references cities")`: 010 contains `add column if not exists city text references public.cities` and no `not null` on that line.
  - `test("prices lookups are indexed and idempotent")`: 011 contains the `unique (store_product_id, city, source, observed_on)` and `prices_city_product_date_idx`.
  - `test("migrations are idempotent")`: every `create table` uses `if not exists`, every `create policy` is preceded by `drop policy if exists` with the same name.
- [ ] **Step 2: Run** `node --test scripts/catalogMigrations.test.mjs` — Expected: FAIL, files not found.
- [ ] **Step 3: Write the two migrations** with the exact names above; header comment in the repo's style ("Requiere: 009"). Comments on each table and on `prices.source` explaining the three values.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Write `supabase/tests/catalog_checks.sql`**: as `authenticated` (`set local role authenticated; set local request.jwt.claims ...`) `select` from each table works and `insert into foods ...` fails with `permission denied`; as `anon` `select` fails; `explain` of `select * from current_prices where city = 'bucaramanga'` shows an index scan on `prices_city_product_date_idx`; inserting a duplicate price row for the same day fails with a unique violation. Each query has the expected result in a comment.
- [ ] **Step 6: Verify on a non-production database** (Supabase branch or staging project the owner provides): apply 010 and 011, run `catalog_checks.sql`, run the Supabase advisors (`supabase db advisors` or MCP `get_advisors`); expected: every check matches, no security advisor errors. If no staging database is available, stop and report it; do not apply to production.
- [ ] **Step 7: Commit** `git add supabase/migrations/010_cities_and_profile_city.sql supabase/migrations/011_food_catalog_and_prices.sql supabase/tests/catalog_checks.sql scripts/catalogMigrations.test.mjs && git commit -m "feat(db): add cities, foods, store_products and prices with read-only RLS"`.

---

### Task 3: Food data with extended nutrition and seed migration 012

**Files:**
- Create: `data/foods/foods.json` (one object per food; the source of truth for the seed)
- Create: `scripts/foods/nutrients.ts` (pure parsers for USDA FDC and Open Food Facts answers)
- Create: `scripts/foods/fetch-nutrition.ts` (CLI: fills extended fields in `foods.json` from the refs)
- Create: `scripts/foods/seedSql.ts` (pure `buildSeedSql`) and `scripts/foods/build-seed.ts` (CLI that writes `supabase/migrations/012_seed_foods.sql` with it)
- Create: `supabase/migrations/012_seed_foods.sql` (generated, committed)
- Create: `scripts/foods/fixtures/usda-*.json`, `scripts/foods/fixtures/off-*.json`
- Create: `docs/DATA_SOURCES.md`
- Modify: `src/i18n/messages/legal.ts`, `src/app/components/account/PrivacyScreen.tsx` (one attribution line: "Datos nutricionales: USDA FoodData Central (dominio público) y Open Food Facts (ODbL).")
- Test: `scripts/foods/nutrients.test.mjs`, `scripts/foods/foods.test.mjs`

**Interfaces:**
- Consumes: column names of `public.foods` from Task 2 (fixed above); `CATALOG` from `supabase/functions/_shared/catalog.ts`.
- Produces:
  - `foods.json` entry shape: `{ id, nameEs, nameEn, pluralEs?, pluralEn?, category, unit, wholeUnits, gramsPerUnit?, tags, kcal, proteinG, carbsG, fatG, fiberG, freeSugarsG, satFatG, sodiumMg, ironMg, gabaGroup, isFruitVeg, defaultPack, refPriceCop, refPriceSource, nutritionSource: "usda"|"off", nutritionRef, freeSugarsRule: "none"|"all"|"added" }`.
  - `parseUsdaFood(json: unknown): ExtendedNutrients | null` and `parseOffProduct(json: unknown): ExtendedNutrients | null` where `ExtendedNutrients = { fiberG: number; totalSugarsG: number; addedSugarsG: number | null; satFatG: number; sodiumMg: number; ironMg: number }` per 100 g. USDA nutrient numbers: fiber 1079, total sugars 2000 (or 269), added sugars 1235, saturated fat 1258, sodium 1093, iron 1089. OFF: `nutriments.fiber_100g`, `sugars_100g`, `saturated-fat_100g`, `sodium_100g` (g → mg ×1000), `iron_100g` (g → mg ×1000).
  - `freeSugars(n: ExtendedNutrients, rule): number`: `none` → 0 (whole fruit, vegetables, plain milk/yogurt, legumes, grains, meat, eggs); `all` → `totalSugarsG` (sugar, panela, honey); `added` → `addedSugarsG ?? totalSugarsG` (processed foods such as sliced bread, pasta, pre-cooked cornmeal).
  - `buildSeedSql(foods: FoodJson[]): string` — deterministic (sorted by id), `insert ... on conflict (id) do update set ...` so re-running is safe.

- [ ] **Step 1: Write failing parser tests** `scripts/foods/nutrients.test.mjs` using saved fixtures (no network): `parseUsdaFood(fixture lentils)` returns the fixture's numbers for the six fields; sodium for OFF is converted g→mg (`0.4 g` → `400`); a fixture missing sodium returns `null`; `freeSugars` returns `0`, total sugars and added-or-total for the three rules; malformed input (`null`, `{}`, strings as numbers) returns `null`.
- [ ] **Step 2: Run** `node --test scripts/foods/nutrients.test.mjs` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `scripts/foods/nutrients.ts`.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write failing data tests** `scripts/foods/foods.test.mjs`:
  - `test("same ids as the static catalog")`: sorted ids of `foods.json` deep-equal sorted `CATALOG` ids.
  - `test("legacy fields are unchanged")`: for every food, `kcal, proteinG, carbsG, fatG, unit, gramsPerUnit, wholeUnits, tags, category, defaultPack (= pack), refPriceCop (= price), refPriceSource (= priceSource), names, plurals` equal the `CATALOG` entry.
  - `test("extended nutrition is plausible")`: all extended fields are finite and ≥ 0; `fiberG <= carbsG + 0.5`, `freeSugarsG <= carbsG + 0.5`, `satFatG <= fatG + 0.5`; `sal` has `sodiumMg > 30000`; `azucar.freeSugarsG > 95`; every fruit has `freeSugarsG === 0`.
  - `test("GABA group and fruit/veg flag")`: `papa`, `papa_criolla`, `yuca`, `platano` have `gabaGroup: "cereales_tuberculos"` and `isFruitVeg: false`; every other `frutas_verduras` item, plus `ajo` and `cilantro`, has `isFruitVeg: true`; legumes are `proteicos`; `sal` has `gabaGroup: null`.
  - `test("every food cites its source")`: `nutritionSource` is `usda` or `off`; `usda` refs match `^\d+$`, `off` refs match `^\d{8,14}$`.
  - `test("seed migration is generated from foods.json")`: `buildSeedSql(foods)` equals the content of `supabase/migrations/012_seed_foods.sql`.
- [ ] **Step 6: Run** `node --test scripts/foods/foods.test.mjs` — Expected: FAIL.
- [ ] **Step 7: Build the data.** Write `foods.json` copying legacy fields from `CATALOG`, choose one FDC id per food (Foundation or SR Legacy, raw/dry form matching the catalog convention) and, for Colombian packaged foods USDA lacks a good match for (`harina_maiz`, `panela`, `pan_tajado`, `queso_campesino` at least), one Open Food Facts barcode of a product sold in Colombia. Implement `fetch-nutrition.ts` (reads `USDA_API_KEY` from env, falls back to `DEMO_KEY`, sends the policy user agent to OFF, 1 request/second, writes only extended fields, never touches legacy fields) and run it once. Set `freeSugarsRule`, `gabaGroup` and `isFruitVeg` by hand following the test rules. Implement `build-seed.ts` and generate `012_seed_foods.sql` (`node scripts/foods/build-seed.ts`).
- [ ] **Step 8: Run** `node --test scripts/foods/` — Expected: PASS.
- [ ] **Step 9: Attribution.** Write `docs/DATA_SOURCES.md` (USDA FoodData Central: public domain, link; Open Food Facts: ODbL 1.0, link, list of barcodes used; TCAC of ICBF not used until written permission) and add the legal line to `legal.ts` (es/en) shown in `PrivacyScreen.tsx`. Run `npm run check` — Expected: PASS.
- [ ] **Step 10: Commit** `git add data/foods scripts/foods supabase/migrations/012_seed_foods.sql docs/DATA_SOURCES.md src/i18n/messages/legal.ts src/app/components/account/PrivacyScreen.tsx && git commit -m "feat(data): seed foods with extended nutrition from USDA and Open Food Facts"`.

---

### Task 4: Planner receives a `Catalog` instead of importing it

**Files:**
- Modify: `supabase/functions/_shared/catalog.ts` (add `Catalog`, `createCatalog`, `STATIC_CATALOG`; keep `CATALOG`, `getIngredient`, `CATALOG_IDS`, `gramsOf`, `nutritionOf`, `costOf` exports unchanged)
- Modify: `supabase/functions/_shared/planner/restrictions.ts`, `compose.ts`, `naming.ts`, `build.ts`, `generate.ts`
- Test: `supabase/functions/_shared/planner/catalog.test.mjs` (new); existing `planner.test.mjs`, `generate.test.mjs`, `catalog.validation.test.mjs` must pass untouched

**Interfaces:**
- Produces:

```ts
export interface Catalog {
  readonly all: readonly Ingredient[];
  get(id: string): Ingredient | undefined;
}
export function createCatalog(items: readonly Ingredient[]): Catalog; // throws on duplicate ids
export const STATIC_CATALOG: Catalog; // createCatalog(CATALOG)

// planner/generate.ts
export interface PlannerDeps { catalog?: Catalog }
export async function generatePlan(
  input: GenerateInput, rawCallModel: ModelCall,
  limits?: Partial<GenerationLimits>, deps?: PlannerDeps,
): Promise<GenerateOutcome>;
```
  - Every exported planner function that today calls `getIngredient` or reads `CATALOG` gets a trailing optional `catalog: Catalog = STATIC_CATALOG` parameter, or a `catalog?: Catalog` field when it already takes an options object (`fitToBudget`, `assemblePlan`, `renameMeals`). Names and existing parameter order do not change.
  - `restrictions.ts`: the module-level name index becomes `nameIndex(catalog)` memoised in a `WeakMap<Catalog, ...>`; `buildRestrictionRules(restrictions, catalog?)`, `explainRestriction(raw, catalog?)`, `allowedCatalog(rules, catalog?)`.
  - `FailureDiagnostics.totalFoods` = `catalog.all.length`.

- [ ] **Step 1: Write the failing test** `planner/catalog.test.mjs`:
  - `test("createCatalog rejects duplicate ids")`.
  - `test("STATIC_CATALOG matches CATALOG")`: same length, `get("huevo") === getIngredient("huevo")`.
  - `test("restrictions use the given catalog")`: a custom catalog = `CATALOG` plus `{ ...getIngredient("lentejas"), id: "bocadillo", name: { es: "Bocadillo", en: "Guava paste" } }`; `buildRestrictionRules(["bocadillo"], custom)` forbids `bocadillo`; with `STATIC_CATALOG` it lists `"bocadillo"` as unmatched.
  - `test("assemblePlan reads names from the given catalog")`: a custom catalog where `huevo` has `name.es = "Huevo campesino"`; a one-ingredient week built with it produces a shopping item named `"Huevo campesino"`.
  - `test("generatePlan reports totalFoods from deps.catalog")`: with restrictions that leave too few foods and a catalog of 30 items, `diagnostics.totalFoods === 30`.
- [ ] **Step 2: Run** `node --test supabase/functions/_shared/planner/catalog.test.mjs` — Expected: FAIL (`createCatalog` is not exported).
- [ ] **Step 3: Implement** the interfaces above, threading `catalog` from `generatePlan` through every call.
- [ ] **Step 4: Verify no hidden global use:** `grep -n "getIngredient\|CATALOG\b" supabase/functions/_shared/planner/*.ts` — Expected: matches only in default-parameter positions (`STATIC_CATALOG`) and imports, none in function bodies.
- [ ] **Step 5: Run** `npm run check` — Expected: PASS, with `planner.test.mjs` and `generate.test.mjs` unchanged.
- [ ] **Step 6: Commit** `git commit -am "refactor(planner): pass the catalog explicitly instead of importing it"` (plus `git add` of the new test).

---

### Task 5: `PriceBook` with city prices, freshness and estimate fallback

**Files:**
- Create: `supabase/functions/_shared/planner/priceBook.ts`
- Modify: `supabase/functions/_shared/planner/stores.ts` (export `STATIC_PRICE_BOOK` built on the existing `cheapestStore`/`carries`; factors unchanged)
- Modify: `supabase/functions/_shared/planner/build.ts`, `generate.ts`
- Modify: `supabase/functions/_shared/weeklyPlanSchema.ts` (optional item fields)
- Test: `supabase/functions/_shared/planner/priceBook.test.mjs`

**Interfaces:**
- Consumes: `Catalog`, `STATIC_CATALOG`, `PlannerDeps` (Task 4).
- Produces:

```ts
export type PriceSource = "official" | "user" | "estimate";
export const MAX_PRICE_AGE_DAYS = 45;
export interface PriceOffer {
  storeId: string; foodId: string; packSize: number;
  regularPriceCop: number; source: "official" | "user"; observedOn: string; // YYYY-MM-DD
}
export interface Quote {
  store: string; costCop: number; packs: number; packSize: number;
  source: PriceSource; observedOn: string | null;
}
export interface PriceBook {
  carries(storeId: string, foodId: string): boolean;
  quote(ingredient: Ingredient, qty: number, stores: string[]): Quote;
}
export function createCityPriceBook(offers: readonly PriceOffer[], options: {
  today: string; inactive?: ReadonlyArray<{ storeId: string; foodId: string }>;
  maxAgeDays?: number;
}): PriceBook;
// stores.ts
export const STATIC_PRICE_BOOK: PriceBook;
// generate.ts
export interface PlannerDeps { catalog?: Catalog; prices?: PriceBook }
```
  - `PlanShoppingItem` and the shared schema gain `price_source?: "official" | "user" | "estimate"` and `price_updated_at?: string` (`YYYY-MM-DD`, only when not an estimate).
  - Semantics of `createCityPriceBook(...).quote`: for each user store in order that `carries` the food, the cost is the minimum over that store's fresh offers of `ceil(qty / packSize - 1e-9) * regularPriceCop`, or, with no fresh offer, the static estimate for that store (`round(costOf(ingredient, qty) * priceFactor(store, ingredient))`, source `estimate`). The cheapest store wins; ties keep the user's order; `qty <= 0` costs 0. `carries`: an `inactive` row ⇒ false; else any offer ⇒ true; else the static `carries`.
  - `STATIC_PRICE_BOOK.quote` reproduces today exactly (`cheapestStore` + `costAt`), source `estimate`, `observedOn: null`, `packSize = ingredient.pack`.
  - `costAt`, `weekCost`, `fitToBudget` (`options.prices?`) and `assemblePlan` (`options.prices?`) default to `STATIC_PRICE_BOOK`. `assemblePlan` writes `quantity` from `quote.packs * quote.packSize` and the two new fields. `generatePlan` filters foods with `prices.carries` instead of `carriedByAny`.

- [ ] **Step 1: Write the failing test** `planner/priceBook.test.mjs`:
  - `test("static book reproduces today's prices")`: for every `CATALOG` item and stores `["D1","Ara","Jumbo"]`, `STATIC_PRICE_BOOK.quote(i, i.pack * 1.5, stores).costCop === costAt(i, i.pack * 1.5, stores)` from before the change (compute with `costOf` × `cheapestStore().factor`) and `source === "estimate"`.
  - `test("fresh official offer beats the estimate")`: offer `{ storeId: "D1", foodId: "huevo", packSize: 30, regularPriceCop: 16900, source: "official", observedOn: "2026-11-02" }`, today `2026-11-04`, `quote(huevo, 12, ["D1"])` → `{ store: "D1", costCop: 16900, packs: 1, packSize: 30, source: "official", observedOn: "2026-11-02" }`.
  - `test("stale offer falls back to estimate")`: same offer with `observedOn: "2026-09-01"` → `source: "estimate"`.
  - `test("cheapest of several packs for the needed quantity")`: 500 g at 4 000 and 1000 g at 7 000, qty 900 → cost 7 000.
  - `test("inactive product is not carried")` and `test("store without offers uses static carries")` (`salmon` at `D1` stays not carried).
  - `test("mixed stores pick the lowest cost, ties keep user order")`.
  - `test("assemblePlan adds price_source and price_updated_at")`: with the city book above, the egg item has `price_source: "official"`, `price_updated_at: "2026-11-02"`, `quantity` from 30-unit packs; with `STATIC_PRICE_BOOK`, `price_source: "estimate"` and no `price_updated_at`.
  - `test("no city prices means the same plan totals as before")`: a fixed week assembled with `STATIC_PRICE_BOOK` and with `createCityPriceBook([], { today })` has the same `estimated_total_cop` and per-item prices.
- [ ] **Step 2: Run** `node --test supabase/functions/_shared/planner/priceBook.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `priceBook.ts`, `STATIC_PRICE_BOOK`, and the `build.ts` / `generate.ts` changes.
- [ ] **Step 4: Schema.** Add the two optional fields to `shoppingItemSchema` (`z.enum(["official","user","estimate"]).optional()`, `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`), so the server keeps them when it parses before saving.
- [ ] **Step 5: Run** `npm run check` — Expected: PASS; update existing assertions in `planner.test.mjs` only where a shopping item deep-equality now includes `price_source: "estimate"`.
- [ ] **Step 6: Commit** `git add supabase/functions/_shared && git commit -m "feat(planner): price book with city prices, freshness and estimate fallback"`.

---

### Task 6: Load catalog and prices from the database in the Edge Function

**Files:**
- Create: `supabase/functions/_shared/catalogLoader.ts`
- Modify: `supabase/functions/_shared/buildGenerationInput.ts` (read and validate `profiles.city`)
- Modify: `supabase/functions/generate-weekly-plan/index.ts` (load planner data, pass `deps`)
- Test: `supabase/functions/_shared/catalogLoader.test.mjs`; extend the existing input-building tests if present, else add `supabase/functions/_shared/buildGenerationInput.test.mjs`

**Interfaces:**
- Consumes: `Catalog`, `createCatalog`, `STATIC_CATALOG` (T4); `PriceBook`, `createCityPriceBook`, `STATIC_PRICE_BOOK`, `PriceOffer` (T5); table/view names from T2.
- Produces:

```ts
export interface PlannerData { catalog: Catalog; prices: PriceBook; origin: "db" | "static" }
export const MIN_DB_FOODS = 40;
export function foodRowToIngredient(row: unknown): Ingredient | null;
export async function loadPlannerData(
  client: CatalogClient, city: string | null,
  options?: { now?: () => number; ttlMs?: number; timeoutMs?: number },
): Promise<PlannerData>;
export function resetPlannerDataCache(): void; // tests only
// CatalogClient = the subset of SupabaseClient used: from(table).select(cols).eq(col, v).order(col).range(a, b)
// buildGenerationInput.ts
export type GenerationRequest = GenerateInput & { city: string | null };
```
  - Queries: `foods` (`is_active = true`, ordered by `id`), `store_products` with `is_active = false` (inactive list), and, only when `city` is not null, `current_prices` filtered by `city`; each read in pages of 1000 with `.range()` until a short page. `timeoutMs` default 3000 per load (abort ⇒ fallback).
  - Cache: foods cached under one key, prices under `prices:<city>`, each with `ttlMs` (from `CATALOG_CACHE_TTL_MS`, default 600 000, clamped 0–3 600 000); concurrent callers share one in-flight promise; failures are not cached; on failure a stale cached value is served if present, else static.
  - Fallback to `{ catalog: STATIC_CATALOG, prices: STATIC_PRICE_BOOK, origin: "static" }` when the query errors, times out, or yields fewer than `MIN_DB_FOODS` valid foods; logs `catalog_fallback` with a reason code only.
  - City validation: `profiles.city` matching `^[a-z_]{2,40}$` else `null`.

- [ ] **Step 1: Write the failing test** `catalogLoader.test.mjs` with a fake client that records calls:
  - `test("maps a foods row to an Ingredient")`: a row for `huevo` built from the T3 column names → equals `getIngredient("huevo")` (`priceSource` from `ref_price_source`).
  - `test("rejects invalid rows")`: negative kcal, unknown unit, `unit: "unit"` without `grams_per_unit`, bad id → `null`, and they are skipped.
  - `test("paginates")`: fake returns 1000 then 5 foods → two `range` calls `(0,999)` and `(1000,1999)`.
  - `test("caches within TTL and shares concurrent loads")`: two sequential calls and two concurrent calls → one foods query; after `now` advances past `ttlMs` → a second query.
  - `test("falls back to static when the table is missing")`: fake answers `{ error: { code: "42P01" } }` → `origin: "static"`.
  - `test("falls back when too few foods")`: 10 valid rows → `origin: "static"`.
  - `test("no city means no price query and estimate prices")`: `city: null` → no `current_prices` call; `prices.quote(huevo, 12, ["D1"]).source === "estimate"`.
  - `test("city prices become offers")`: a `current_prices` row for D1 eggs → `quote(...).source === "official"`.
  - `test("same plan totals as static when DB mirrors the catalog")`: rows generated from `CATALOG` and no city → `assemblePlan` of a fixed week gives the same `estimated_total_cop` as with static deps.
  - In the input tests: `city: "bucaramanga"` passes through; `city: "Bucaramanga; drop"` and `null` become `null`.
- [ ] **Step 2: Run** `node --test supabase/functions/_shared/catalogLoader.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `catalogLoader.ts` and the `city` change in `buildGenerationInput.ts` (add `city` to the `profiles` select).
- [ ] **Step 4: Wire `index.ts`:** after building the input, `const plannerData = await loadPlannerData(supabase, input.city)` using the caller's JWT client, then `generatePlan(input, callOpenAI, limits, { catalog: plannerData.catalog, prices: plannerData.prices })`; log `catalog_origin` with `origin` only.
- [ ] **Step 5: Run** `npm run check` — Expected: PASS.
- [ ] **Step 6: Commit** `git add supabase/functions && git commit -m "feat(functions): read catalog and city prices from the database with cache and fallback"`.

---

### Task 7: City question in the profile (web)

**Files:**
- Create: `src/lib/cities.ts`
- Modify: `src/lib/profile.ts` (read/write `city`)
- Modify: `src/app/components/shared/BodyDataFields.tsx` (city select)
- Modify: `src/app/components/setup/ProfileScreen.tsx` (default `city: null`)
- Modify: `src/i18n/messages/setup.ts`
- Test: `src/lib/cities.test.mjs`

**Interfaces:**
- Consumes: `public.cities`, `profiles.city` (T2).
- Produces:
  - `export interface City { slug: string; name: string }`
  - `export const FALLBACK_CITIES: readonly City[]` (same 12 as the seed, `bucaramanga` first)
  - `export function normalizeCity(value: unknown, known: readonly City[]): string | null` (unknown or malformed ⇒ `null`)
  - `export async function fetchCities(client): Promise<City[]>` (active cities ordered by `sort_order`, memoised for the session, `FALLBACK_CITIES` on error)
  - Profile input/output gains `city: string | null`.
  - Messages: `profile.city` "¿En qué ciudad haces mercado?" / "Which city do you shop in?", `profile.cityHint` "La usamos para mostrarte precios de tu ciudad." / "We use it to show prices for your city.", `profile.cityNone` "Otra o prefiero no decirlo" / "Other or prefer not to say".
- [ ] **Step 1: Write the failing test** `src/lib/cities.test.mjs`: `normalizeCity("bucaramanga", FALLBACK_CITIES) === "bucaramanga"`; `"Bucaramanga"`, `"x; drop table"`, `""`, `42`, `null` → `null`; `FALLBACK_CITIES[0].slug === "bucaramanga"`; `fetchCities` with a fake client that errors returns `FALLBACK_CITIES`; with rows returns them in order; a second call does not query again.
- [ ] **Step 2: Run** `node --test src/lib/cities.test.mjs` — Expected: FAIL. (Like `profileUpdate.ts`, `cities.ts` uses only relative imports and receives the Supabase client as a parameter, so Node can load it.)
- [ ] **Step 3: Implement** `cities.ts`, the `profile.ts` field (normalised before saving), the select in `BodyDataFields.tsx` (native `<select>` with label and hint, `null` option last), the default in `ProfileScreen.tsx`, and the messages.
- [ ] **Step 4: Run** `npm run check` and `npm run build` — Expected: PASS. Open `/__preview/profile` in `npm run dev` and confirm the select renders, is keyboard-accessible and saves.
- [ ] **Step 5: Commit** `git add src && git commit -m "feat(web): ask which city the user shops in"`.

---

### Task 8: Show price freshness and "Aproximado" in the shopping list

**Files:**
- Create: `src/lib/priceLabel.ts`
- Modify: `src/lib/ai/types.ts` (`ShoppingItem` gains `price_source?` and `price_updated_at?`)
- Modify: `src/app/components/plan/market/ShoppingChecklistItem.tsx`
- Modify: `src/app/components/plan/MarketScreen.tsx` (one note when any item is approximate)
- Modify: `src/i18n/messages/app.ts`
- Test: `src/lib/priceLabel.test.mjs`

**Interfaces:**
- Consumes: field names `price_source`, `price_updated_at` (T5).
- Produces:

```ts
export type PriceLabel =
  | { kind: "approximate" }
  | { kind: "updated"; date: string; stale: boolean }; // stale = older than 45 days
export function priceLabel(
  item: { price_source?: unknown; price_updated_at?: unknown }, today: Date,
): PriceLabel;
export function hasApproximatePrices(items: readonly { price_source?: unknown }[]): boolean;
```
  - Messages: `market.priceApprox` "Aproximado" / "Approximate"; `market.priceUpdated` "Actualizado el {date}" / "Updated {date}"; `market.approxNote` "Los precios marcados como aproximados son estimados; pueden variar en tu tienda." / "Prices marked approximate are estimates and may differ at your store."
- [ ] **Step 1: Write the failing test** `src/lib/priceLabel.test.mjs`: `{}` → approximate (old plans); `{ price_source: "estimate" }` → approximate; `{ price_source: "official", price_updated_at: "2026-11-02" }` with today 2026-11-04 → `{ kind: "updated", date: "2026-11-02", stale: false }`; date 2026-09-01 → `stale: true`; `{ price_source: "official", price_updated_at: "not-a-date" }` → approximate; `{ price_source: "hacked" }` → approximate; `hasApproximatePrices([{ price_source: "official" }, {}])` → true.
- [ ] **Step 2: Run** `node --test src/lib/priceLabel.test.mjs` — Expected: FAIL. (`priceLabel.ts` has no `@/` imports, so Node can load it.)
- [ ] **Step 3: Implement** `priceLabel.ts`, the optional fields in `types.ts`, a small muted line under the price in `ShoppingChecklistItem.tsx` (date formatted with the i18n locale, e.g. "Actualizado el 2 nov"; text, not colour alone, carries the meaning), the note in `MarketScreen.tsx` when `hasApproximatePrices`, and the messages.
- [ ] **Step 4: Run** `npm run check` and `npm run build` — Expected: PASS. In `npm run dev`, open the market preview with an old sample plan (no fields) and confirm every price shows "Aproximado" and nothing breaks.
- [ ] **Step 5: Commit** `git add src && git commit -m "feat(web): show when each price was updated and mark estimates as approximate"`.

---

### Task 9: Weekly price reader framework and GitHub Actions job

**Files:**
- Create: `scripts/prices/types.ts`, `scripts/prices/robots.ts`, `scripts/prices/fetcher.ts`, `scripts/prices/validate.ts`, `scripts/prices/mappings.ts`, `scripts/prices/run.ts`, `scripts/prices/supabaseSink.ts`, `scripts/prices/readers/index.ts`, `scripts/prices/main.ts`
- Create: `scripts/prices/stores/.gitkeep` (store modules arrive in T10–T12)
- Create: `data/store-products/README.md` (format of the per-store mapping files)
- Create: `.github/workflows/prices-weekly.yml`
- Test: `scripts/prices/robots.test.mjs`, `scripts/prices/validate.test.mjs`, `scripts/prices/mappings.test.mjs`, `scripts/prices/run.test.mjs`

**Interfaces:**
- Consumes: `scripts/prices/policy.json` (T1); `store_products`, `prices` (T2); food ids from `data/foods/foods.json` (T3).
- Produces (used by T10–T12):

```ts
export type StoreId = "D1" | "Ara" | "Exito" | "Jumbo" | "Carulla";
export interface MappedProduct {
  storeId: StoreId; foodId: string; externalId: string;
  name: string; packSize: number; url: string;
}
export type ReadResult =
  | { ok: true; regularPriceCop: number; promoPriceCop: number | null }
  | { ok: false; reason: "not_found" | "unavailable_in_city" | "parse_error" | "blocked" };
export interface ReaderContext {
  city: string;
  fetchText(url: string, init?: { headers?: Record<string, string> }): Promise<{ status: number; body: string }>;
}
export interface StoreReader { storeId: StoreId; read(product: MappedProduct, ctx: ReaderContext): Promise<ReadResult> }

// robots.ts
export function isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean;
// validate.ts
export function checkPrice(regular: number, lastKnown: number | null):
  { ok: true } | { ok: false; reason: "out_of_range" | "jump" };
// mappings.ts
export function parseMappings(json: unknown, storeId: StoreId, foodIds: ReadonlySet<string>, allowedHost: string): MappedProduct[]; // throws listing every invalid entry; allowedHost comes from policy robotsUrl
// run.ts
export interface PriceSink {
  upsertProducts(products: MappedProduct[]): Promise<Map<string, number>>; // key `${storeId}:${externalId}` -> store_products.id
  lastPrices(ids: number[], city: string): Promise<Map<number, number>>;
  upsertPrices(rows: { storeProductId: number; city: string; regularPriceCop: number; observedOn: string }[]): Promise<void>; // source 'official'
}
export interface RunSummary { perStore: Record<string, { read: number; saved: number; skipped: Record<string, number> }>; failedStores: string[] }
export async function runWeekly(opts: {
  policy: unknown; readers: StoreReader[]; mappings: Record<string, MappedProduct[]>;
  sink: PriceSink; fetch: typeof fetch; today: string; city: string;
  sleep?: (ms: number) => Promise<void>; dryRun?: boolean;
}): Promise<RunSummary>;
// supabaseSink.ts
export function createSupabaseSink(url: string, serviceRoleKey: string): PriceSink;
// readers/index.ts — imports every scripts/prices/stores/*.ts that exports `reader`
export async function loadReaders(dir: string): Promise<StoreReader[]>;
```
  - Mapping file: `data/store-products/<StoreId>.json` = array of `{ foodId, externalId, name, packSize, url }`, validated with `zod` (`url` must be `https://` on the store's domain from `policy.json`, `packSize > 0`, `foodId` known).
  - `fetcher.ts` builds `ReaderContext.fetchText`: sends `policy.userAgent`, waits `minDelayMs` between requests to the same host, 15 s timeout, checks `robots.txt` once per host with `isPathAllowed` (a disallowed path returns `{ status: 403 }` without a network call), no cookies kept beyond what the policy's `bucaramanga.how` needs.
  - `runWeekly` skips every store with `allowed !== true` and every store without a reader, stores only `regularPriceCop`, applies `checkPrice` against `lastPrices`, writes nothing when `dryRun`, and lists a store in `failedStores` when fewer than 50 % of its mapped products were saved. `main.ts` exits with code 1 if `failedStores` is not empty, reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from env (missing ⇒ exit 2 with a clear message, never printing values), accepts `--dry-run`, city fixed to `bucaramanga`.
  - Workflow: `on: schedule: - cron: "0 9 * * 1"` (Monday 04:00 Bogotá) and `workflow_dispatch` with a `dry_run` boolean input; `permissions: contents: read`; `environment: prices`; `concurrency: prices-weekly`; `timeout-minutes: 45`; steps checkout → setup-node 22 with npm cache → `npm ci` → `node scripts/prices/main.ts` (adds `--dry-run` when requested) with the two secrets as env.

- [ ] **Step 1: Write failing tests:**
  - `robots.test.mjs`: `Disallow: /checkout` blocks `/checkout/x` but allows `/p/arroz`; a specific `User-agent: FitMarketPriceBot` group overrides `*`; `Allow` longer match wins over `Disallow`; empty file allows all; `Disallow: /` blocks all.
  - `validate.test.mjs`: `checkPrice(49, null)` → `out_of_range`; `checkPrice(5_000_001, null)` → `out_of_range`; `checkPrice(3.5, null)` → `out_of_range` (not integer); `checkPrice(9000, 4000)` → `jump`; `checkPrice(1900, 4000)` → `jump`; `checkPrice(7900, 4000)` → ok.
  - `mappings.test.mjs`: valid file parses; unknown `foodId`, `http://` URL, URL on another domain, `packSize: 0` each throw with the entry index in the message.
  - `run.test.mjs` with fake readers, fake sink and fake fetch: a store with `allowed: false` is never called; promo result `{ regularPriceCop: 5000, promoPriceCop: 3900 }` saves 5000; `not_found` saves nothing and keeps counting as skipped; a `jump` result is skipped with reason `jump`; `dryRun` calls no `upsertPrices`; 1 of 3 saved ⇒ store in `failedStores`; the sink receives `observedOn === today` and `city === "bucaramanga"`; `loadReaders` on a temp dir with one module exporting `reader` and one helper without it returns one reader.
- [ ] **Step 2: Run** `node --test scripts/prices/` — Expected: FAIL (modules not found; `policy.test.mjs` from T1 still passes).
- [ ] **Step 3: Implement** the modules listed above.
- [ ] **Step 4: Run** `node --test scripts/prices/` — Expected: PASS.
- [ ] **Step 5: Add the workflow and `data/store-products/README.md`;** run `npm run check` — Expected: PASS. Confirm with `grep -rn "service_role\|eyJ" scripts .github` that no key is in the repo (Expected: only the env var name).
- [ ] **Step 6: Commit** `git add scripts/prices data/store-products/README.md .github/workflows/prices-weekly.yml && git commit -m "feat(prices): weekly price reader framework with robots, sanity checks and Supabase sink"`.

---

### Task 10: VTEX readers for Éxito, Carulla and Jumbo (only stores T1 allowed)

**Files:**
- Create: `scripts/prices/stores/vtex.ts` (shared parser), `scripts/prices/stores/exito.ts`, `carulla.ts`, `jumbo.ts` (only those with `allowed: true` and `method: "vtex_api"` in `policy.json`; a store T1 found on another platform uses `jsonld_html` parsing inside its own file)
- Create: `scripts/prices/stores/fixtures/vtex-*.json` (real answers saved once, trimmed, with no personal data or cookies)
- Create: `data/store-products/Exito.json`, `Carulla.json`, `Jumbo.json` (for the allowed ones)
- No shared file is modified: T9's `loadReaders` discovers every `scripts/prices/stores/*.ts` that exports `reader`, so T10, T11 and T12 can run in parallel.
- Test: `scripts/prices/stores/vtex.test.mjs`

**Interfaces:**
- Consumes: `StoreReader`, `ReaderContext`, `MappedProduct`, `ReadResult` (T9); `policy.stores[store].bucaramanga.how` (T1).
- Produces: `export function parseVtexProduct(json: unknown, externalId: string): ReadResult` and, per store file, `export const reader: StoreReader`.
  - Regular price rule: VTEX `commertialOffer.ListPrice` when `ListPrice >= Price > 0`, else `Price`; `promoPriceCop = Price` when `Price < ListPrice`, else `null`; `IsAvailable === false` or `AvailableQuantity === 0` ⇒ `unavailable_in_city`; empty array ⇒ `not_found`; any shape error ⇒ `parse_error`. Prices rounded to integer COP.

- [ ] **Step 1: Write the failing test** `vtex.test.mjs` with fixtures: product on promotion (`Price 3900`, `ListPrice 5000`) → `{ ok: true, regularPriceCop: 5000, promoPriceCop: 3900 }`; no promotion → `promoPriceCop: null`; unavailable → `unavailable_in_city`; `[]` → `not_found`; `{ "foo": 1 }` → `parse_error`; a per-kg item whose fixture shows `unitMultiplier` ≠ 1 is priced for the mapped pack (`ListPrice × unitMultiplier`), so a 1 kg pack of papa is not stored as a per-gram price. Per store: `reader.read` builds the URL the policy describes (including the Bucaramanga selector) — assert with a fake `fetchText` that records the URL and returns the fixture.
- [ ] **Step 2: Run** `node --test scripts/prices/stores/vtex.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `vtex.ts` and the allowed store files.
- [ ] **Step 4: Build the mapping files:** for each of the ~70 foods find, in the store's Bucaramanga catalog, the closest product matching the catalog unit and convention (raw/dry, plain), record `externalId`, `name`, `packSize` in the food's unit, `url`. Leave out foods with no reasonable match. Validate with `parseMappings` (run `node --test scripts/prices/`).
- [ ] **Step 5: Live dry run** (one store at a time, polite): `node scripts/prices/main.ts --dry-run` — Expected: each allowed store reads ≥ 50 % of its mapped products and the summary shows no `jump`/`out_of_range` surprises; fix mappings that are wrong.
- [ ] **Step 6: Run** `npm run check` — Expected: PASS. **Commit** `git add scripts/prices/stores/vtex.ts scripts/prices/stores/vtex.test.mjs scripts/prices/stores/exito.ts scripts/prices/stores/carulla.ts scripts/prices/stores/jumbo.ts scripts/prices/stores/fixtures/vtex-* data/store-products/Exito.json data/store-products/Carulla.json data/store-products/Jumbo.json && git commit -m "feat(prices): VTEX readers for allowed full-service stores in Bucaramanga"` (add only the files that exist).

---

### Task 11: D1 reader (only if T1 allowed it)

**Files:**
- Create: `scripts/prices/stores/d1.ts`, `scripts/prices/stores/fixtures/d1-*` (HTML or JSON as recorded in `policy.json.stores.D1.method`), `data/store-products/D1.json`
- Test: `scripts/prices/stores/d1.test.mjs`

**Interfaces:**
- Consumes: T9 types; `policy.stores.D1`.
- Produces: `export function parseD1Product(body: string, externalId: string): ReadResult`; `export const reader: StoreReader`.
  - Regular price: the non-discounted ("antes"/list) price when the page shows two prices, else the single price; JSON-LD `offers.price` counts as the regular price only when no list/strike-through price is present.

- [ ] **Step 1: Write the failing test** with fixtures: single price → regular; two prices (strike-through 5 990, current 4 990) → regular 5 990, promo 4 990; product page "agotado" / not sold in Bucaramanga → `unavailable_in_city`; 404 body → `not_found`; changed markup → `parse_error`; a price string `"$ 12.990"` parses as 12990 (dot is the thousands separator in Colombia).
- [ ] **Step 2: Run** `node --test scripts/prices/stores/d1.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `d1.ts`; no HTML parsing dependency — read JSON-LD or the site's own JSON with `JSON.parse`, or a narrow regular expression anchored on stable attributes.
- [ ] **Step 4: Build `data/store-products/D1.json`** as in T10 step 4 and run a live `--dry-run` for D1 (≥ 50 % read).
- [ ] **Step 5: Run** `npm run check` — Expected: PASS. **Commit** `git add scripts/prices/stores/d1.ts scripts/prices/stores/d1.test.mjs scripts/prices/stores/fixtures/d1-* data/store-products/D1.json && git commit -m "feat(prices): D1 reader for Bucaramanga"`.

---

### Task 12: Ara reader (only if T1 found regular prices and allowed it)

**Files:**
- Create: `scripts/prices/stores/ara.ts`, `scripts/prices/stores/fixtures/ara-*`, `data/store-products/Ara.json`
- Test: `scripts/prices/stores/ara.test.mjs`

**Interfaces:**
- Consumes: T9 types; `policy.stores.Ara`.
- Produces: `export function parseAraCatalogItem(body: string, externalId: string): ReadResult`; `export const reader: StoreReader`.

- [ ] **Step 0: Gate.** If `policy.stores.Ara.allowed` is `false` (for example "solo volante de promoción"), this task ends here: no code; Ara lives on estimates (and on user reports in plan 5). Report that to the integrator.
- [ ] **Step 1: Write the failing test** with fixtures: catalog entry with regular price → saved; entry marked as offer/"precio especial" with no regular price → `{ ok: false, reason: "not_found" }` (a promotion price is never stored as regular); item missing → `not_found`; broken file → `parse_error`.
- [ ] **Step 2: Run** `node --test scripts/prices/stores/ara.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `ara.ts`, build `data/store-products/Ara.json`, live `--dry-run` for Ara.
- [ ] **Step 4: Run** `npm run check` — Expected: PASS. **Commit** `git add scripts/prices/stores/ara.ts scripts/prices/stores/ara.test.mjs scripts/prices/stores/fixtures/ara-* data/store-products/Ara.json && git commit -m "feat(prices): Ara catalog reader for Bucaramanga"`.

---

### Task 13: Architecture docs and ordered rollout

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Database table list: `cities`, `foods`, `store_products`, `prices`, `current_prices`; "Why a catalog" now points to the DB with static fallback; new "Weekly prices" section; Known limits updated)
- Create: `docs/ROLLOUT-plan-1.md` (step-by-step deploy checklist in plain Spanish)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Full verification on the integration branch:** `npm run check && npm run build` — Expected: PASS. The `code-reviewer` agent audits the branch; critical findings are fixed and re-reviewed.
- [ ] **Step 2: Write `docs/ROLLOUT-plan-1.md`** with this order, each step with its check and its rollback:
  1. Apply migrations 010 → 011 → 012 to staging, run `supabase/tests/catalog_checks.sql` and advisors; then production (owner approves first). Check: `select count(*) from foods` = number of foods in `foods.json`. Old function keeps working (it ignores the new tables).
  2. Create GitHub environment `prices` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; run the workflow with `dry_run: true`, then a real run. Check: `select store_id, count(*) from current_prices where city = 'bucaramanga' group by 1`.
  3. Deploy `generate-weekly-plan` (optionally set `CATALOG_CACHE_TTL_MS`). Check: logs show `catalog_origin` = `db`; a user without a city gets the same total as before. Rollback: redeploy the previous function; the DB stays.
  4. Deploy the web. Check: market screen shows "Actualizado el …" for Bucaramanga users with read prices and "Aproximado" otherwise; old plans in the history still open.
- [ ] **Step 3: Update `docs/ARCHITECTURE.md`** as listed. Run `npm run check` — Expected: PASS.
- [ ] **Step 4: Commit** `git add docs/ARCHITECTURE.md docs/ROLLOUT-plan-1.md && git commit -m "docs: catalog and prices architecture and rollout order"`.

---

## Self-review notes

- **Spec coverage:** catalog in DB with the new nutrition fields (T2, T3); `store_products` and `prices` with city and source (T2); USDA/OFF, no TCAC (T3); planner reads DB with cache and estimate fallback (T4–T6); weekly readers respecting robots/terms, regular price, keep last price, show date (T1, T9–T12, T8); city on the profile (T2, T7); RLS, no secrets, validation, pagination, cache (Global Constraints, T2, T6, T9); compatibility and deploy order (T5, T6, T8, T13). Out of scope and left to later plans: optimizer and rules (plan 2), recipes and catalog expansion with new Colombian foods (plan 3), other registration questions (plan 4), user price reports and per-store list (plan 5).
- **Decisions taken here** (owner can change): existing macros are kept exactly as today and only the new fields come from USDA/OFF, so current plans do not change; estimates are computed in code from the reference price and store factors (no `estimate` rows are seeded); prices older than 45 days fall back to the estimate; users without a city keep today's behaviour; old plans without a source are shown as "Aproximado"; the job writes with the service role (as the owner asked) inside a protected GitHub environment.
- **Type consistency:** `Catalog`/`STATIC_CATALOG` (T4) → T5, T6; `PriceBook`/`Quote`/`PriceOffer`/`STATIC_PRICE_BOOK`/`createCityPriceBook` (T5) → T6; `price_source`/`price_updated_at` (T5) → T8; `StoreReader`/`ReadResult`/`MappedProduct`/`loadReaders` (T9) → T10–T12; column names (T2) → T3, T6, T9.
