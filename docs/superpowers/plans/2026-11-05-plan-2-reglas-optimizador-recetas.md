# Plan 2: Reglas, optimizador ("el contador") y recetas sencillas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plan the user receives meets the measurable rules of their goals (or says exactly what to change), at the lowest cost with their supermarkets' prices, built only from simple Colombian recipes that fit their time, skill and kitchen.

**Architecture:** The AI ("el cocinero") stops inventing dishes: it picks one recipe id per day and meal from a recipe library that lives in the repo (`data/recipes/*.json`, validated and compiled into a TypeScript module). Pure, tested code turns the profile and goals into a `RuleSet` (levels 1 to 5, section 3 of the spec). A linear-programming optimizer ("el contador", `javascript-lp-solver`) then scales each recipe's ingredient roles and picks interchangeable ingredients to meet the rules at minimum cost with the `PriceBook`. Level 1 (safety) and the budget are hard constraints; levels 2 to 5 have penalised slack, so one solve tells us whether the plan meets every rule and, if not, which rules clash and by how much. The function answers with a plan, the new `goals_unreachable` error (with what to change and a "Quiero el plan igual" option that relaxes only levels 2 to 5), or `budget_too_low`. Old web versions keep working: new plan fields are optional and the new error falls back to an existing code when the app does not send a version that understands it.

**Tech Stack:** React 18 + Vite, Supabase (Postgres + RLS, Edge Functions on Deno), TypeScript with erasable syntax only, `node --test` (`*.test.mjs` importing `.ts` directly, Node 24 locally / 22 in CI), `zod` 4.6.7 (scripts and the shared plan schema), `javascript-lp-solver` 0.4.24 (new), OpenAI strict JSON schema.

**Spec:** `docs/superpowers/specs/2026-11-04-comidas-y-precios-design.md`, latest version at commit `1cb89bd` of branch `docs/spec-comidas-precios` (worktree `C:\Users\juand\Downloads\FitMarket-wt-spec`). This plan implements phases 2 and 3 (sections 3, 6.4, 6.5, the "Recetas sencillas", "Cocinar una vez para varios días", "Salud", "Hogar", "Versiones viejas" and "Revisión de recetas" decisions of sections 5 and 8). Phase 1 (Plan 1) is done on branch `feat/plan-1-catalogo-precios`; this plan starts from it.

## Global Constraints

- **TDD is mandatory.** Every behaviour starts with a test that is run and seen failing for the right reason; then the minimal code; then cleanup. A task is not done until `npm run check` is green.
- **One branch per task** (`feat/plan2-tNN-<slug>`, from the latest merged state). Two agents never work on the same branch or the same file at the same time; the "Parallel waves" table is the only allowed concurrency, at most 4 agents at once. Implementers do not launch subagents.
- **No secret in code, fixtures, recipes or logs.** `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` stay in Supabase secrets. `VITE_*` values are public by design. Logs carry codes and counts only (never profile data, health data or request bodies).
- **Validate every input:** the request body (size cap 2048 chars, typed fields, anything else ignored), the profile's cooking columns (invalid value → default), DB food rows (invalid micro-nutrients → food has no `micro`), recipe files (zod schema at build time plus a sync test), the AI answer (strict schema plus `parseComposition`). Never trust the AI or the client.
- **Least privilege:** no new table. Migration 015 only adds nullable columns with `check` constraints to `profiles`, covered by its existing own-row RLS policies. The function keeps reading with the caller's JWT client; the service role is used only where Plan 1 already uses it (save, refund).
- **Hard limits never relax:** forbidden foods, level 1 safety rules and the household budget are never broken, also not by "Quiero el plan igual". The final shopping list total (whole packs, `PriceBook.quote`) is always `<=` the weekly budget.
- **Performance at thousands of users:** recipes are served from code (no query, no cache). Catalog and prices keep Plan 1's per-instance cache. Supabase Edge Functions cap **CPU time at 2 s per request** (wall clock 150 s free / 400 s paid; the generation keeps its 120 s budget, `GENERATION_TIME_BUDGET_MS` ceiling 140 s). The optimizer is pure LP (no integer branching) and shares `OPTIMIZER_CPU_BUDGET_MS = 900` per request across all attempts; when spent it returns the best result so far.
- **Backward compatibility:** every new plan field is optional; old plans and old web versions render as before. The app sends `appVersion` in the request body; clients without it, or older than `MIN_VERSION_GOALS_UNREACHABLE = "0.1.0"`, never receive `goals_unreachable` (fallback: `budget_too_low` when a budget increase fixes it, else `goal_incoherent`). Codes in plans (`notices`, `compliance.unmet[].rule`) are plain strings, never enums, so a newer server cannot break an older web's schema.
- **Deploy order is respected:** migration 015 → Edge Function `generate-weekly-plan` → web. Each step works with the previous one still live (the function reads the cooking columns in a separate query and uses defaults if they are missing; the new web handles plans without recipe fields and an old function that ignores the body).
- **Migrations** follow `supabase/migrations/NNN_snake_name.sql`; this plan owns **015** only.
- **TypeScript run by Node:** only erasable syntax (no `enum`, no parameter properties, no namespaces); relative imports include the `.ts` extension.
- **Generated files are never edited by hand:** `supabase/functions/_shared/catalogMicro.generated.ts` (from `data/foods/foods.json`) and `supabase/functions/_shared/recipes/library.generated.ts` (from `data/recipes/*.json`). A sync test fails if they drift.
- **Copy:** Spanish first, every string in `es` and `en` through `defineMessages`. Recipe steps use student language: short sentences, one action each, no technical cooking terms without explanation.
- **Recipes need the owner's OK:** every AI-drafted recipe has `"status": "pending_owner_ok"`. The owner approves a sample (section "Lo que necesita el dueño" of `docs/ROLLOUT-plan-2.md`); approved ones change to `"approved"`. Both statuses are usable in production only after the owner gives the go-ahead in rollout step 3.
- **Big decisions wait for the owner:** Task 17 deletes the old free-composition code and runs only after the owner's explicit OK.

### Rule values (spec section 3, copied verbatim into code constants)

| Level | Code | Applies to | Value |
| --- | --- | --- | --- |
| 1 | `kcal_safety` | all | kcal/day `>= max(BMR, 1200 ♀ / 1500 ♂ / 1400 unknown, 800, 0.75·TDEE)` and `<= 1.15·TDEE` (never above 4000) |
| 1 | `protein_safety_max` | all | protein `<= 2.5 g/kg` (`<= 1.2 g/kg` with `kidney_disease`) |
| 1 | `protein_muscle_floor` | muscle | protein `>= 1.4 g/kg` |
| 1 | `budget` | all | household packs cost `<= weekly_budget_cop` |
| 2 | `kcal_range` | all | target ±10 %, intersected with the goal band (below) and clipped into `kcal_safety` |
| 2 | `protein_min` / `protein_max` | all | maintenance 1.0–2.0 g/kg (target 1.2); fat and muscle 1.6–2.2 (target 1.8); recomposition 2.0–2.4 (target 2.2); kidney 0.8–1.2 (target 1.0) |
| 2 | `carbs_min_muscle` | muscle | carbs `>= 3 g/kg` |
| 2 | `meal_protein_muscle` | muscle | desayuno, almuerzo and cena each 20–40 g protein |
| 3 | `fruit_veg_min` | healthy, fat | `>= 400 g` fruit/veg per day (`is_fruit_veg`, never papa, papa_criolla, yuca, platano) |
| 3 | `fiber_min` | healthy, fat | `>= 25 g` fiber |
| 3 | `free_sugar_max` | healthy, energy | free sugars `< 10 %` kcal |
| 3 | `sodium_max` | healthy | sodium `< 2000 mg` |
| 3 | `fat_max` / `sat_fat_max` | healthy | fat `<= 30 %` kcal; saturated fat `< 10 %` kcal |
| 3 | `legumes_week` | healthy | `>= 2` meals per week with a legume (`lentejas`, `frijol`, `garbanzo`, `arveja_seca`) |
| 3 | `distinct_foods_week` | healthy | `>= 15` distinct foods per week |
| 3 | `gaba_groups_day` | all | `>= 4` of the 6 GABA groups each day |
| 3 | `meal_kcal_share_max` | energy | no meal `> 40 %` of the day's kcal |
| 3 | `breakfast_protein_min` / `breakfast_fiber_min` | energy | desayuno `>= 15 g` protein and `>= 3 g` fiber |
| 3 | `iron_sources_week` | energy | `>= 5` meals per week with an iron source (food with `iron_mg >= 1.5` per 100 g and GABA group `proteicos` or `frutas_verduras`) |
| 4 | — | family | same recipes for every member, portions scaled per member (no numeric rule yet) |
| 5 | `cheap_protein_share` | save | `>= 50 %` of weekly protein from `huevo`, `lentejas`, `frijol`, `garbanzo`, `arveja_seca`, `pernil_pollo`, `sardina_lata`; always elastic, never reported as a blocker |

Goal kcal bands (factor × TDEE): maintenance `[0.90, 1.10]` target 1.00; fat `[0.75, 0.85]` target 0.80, and the daily deficit is also capped at `min(0.01·weightKg, 1) · 7700 / 7` kcal; fat + energy `[0.85, 0.935]` target 0.85 (notice `deficit_capped_energy`); muscle `[1.05, 1.15]` target 1.10; fat + muscle (recomposition) `[0.95, 1.00]` target 0.975. "Strictly less than" rules use 0.099 instead of 0.10 and 1999 instead of 2000.

Goal blocking: `age < 18` → fat removed, notice `fat_blocked_minor`; `age > 65` → fat removed, notices `fat_blocked_senior` + `see_professional`; BMI `< 18.5` → fat removed, `fat_blocked_low_bmi`; BMI `>= 35` → `see_professional`; any of `diabetes`, `kidney_disease`, `pregnancy_lactation`, `eating_disorder` → fat and muscle removed, `goals_blocked_health` + `see_professional`. Health conditions are collected in Plan 3; here they are an optional input that defaults to none.

Household: each member other than the user is an adult in maintenance at `REFERENCE_ADULT_KCAL = 2000` until Plan 3 collects ages. Shopping quantities use `householdFactor = 1 + (householdSize − 1) · 2000 / userKcal`. Rules are measured on the user's own portion.

Cooking defaults (no answer in the profile): `weekdayMinutes: 20`, `level: "basic"`, `appliances: ["estufa", "licuadora"]`, `batch: false`. Weekday recipes must fit `minutes <= cap` (10 → 10, 20 → 20, 30 → 45, since 30 means "30+") and the user's level; weekend recipes may take up to `WEEKEND_MAX_MINUTES = 60` and one level more.

### Parallel waves (disjoint files)

| Wave | Tasks (max 4 at once) | Waits for |
| --- | --- | --- |
| A | T1 micro-nutrients · T2 goal targets · T4 recipe format · T8 LP adapter | — |
| B | T3 rule set and evaluation · T6 cooking preferences · T7 recipe eligibility | T3←T1, T2 · T6←T4 · T7←T1, T4 |
| C | T5 initial recipe set · T9 optimizer model · T11 compose with recipes · T12 plan output | T5←T4, T7 · T9←T3, T7, T8 · T11←T7 · T12←T3, T4 |
| D | T10 optimizer solve · T16 web recipe view | T10←T9, T12 · T16←T12 |
| E | T13 generation pipeline | T3, T5, T6, T7, T10, T11, T12 |
| F | T14 request and compat · T15 web "no se puede cumplir" · T17 cleanup (only with owner OK) | T14←T13 · T15←T13 · T17←T13 |
| G | T18 docs and ordered rollout | all |

`package.json` is touched by T8 (dependency and wider test glob), T12 (test hook) and T15 (version), always in different waves. Until T8 merges, wave A tasks run their new tests by path.

## Review Focus

1. **Rounding after the LP breaks the budget.** The LP works with fractional packs and quantities; rounding to whole packs, whole eggs and 5 g steps can push the real total over a tight budget. The assembled total must always be `<=` the budget, or the result must be `over_budget`, never a plan above budget. Test in T10 (`rounded plan never exceeds budget`).
2. **A restriction + kitchen combination that leaves almost no recipes** (vegan with only a microwave, or lactose + gluten + fish-free at 10 minutes). Expected: `restrictions_too_strict` with `availableRecipes` per slot, never a crash, an empty meal or a forbidden food. Tests in T7 and T13.
3. **Old web against the new function.** The old web sends `{}` and does not know `goals_unreachable`; it must receive `budget_too_low` (with numbers) or `goal_incoherent`, and plans with the new optional fields must still parse. Tests in T12 and T14.
4. **Worst-case CPU in the Edge Function.** All goals, household of 6, 5 stores, 28 distinct recipes and 3 attempts must stay inside `OPTIMIZER_CPU_BUDGET_MS`; when the budget is spent the optimizer returns its best result instead of starting another solve. Test in T10.
5. **Swapped ingredients and dish names.** When the optimizer picks an alternative (frijol instead of lentejas), the dish name must change with it, and the shopping list must contain exactly the foods on the menu. Tests in T7 (`expandMeal`) and T13.

---

### Task 1: Micro-nutrients on every ingredient (DB and static fallback)

**Files:**
- Modify: `supabase/functions/_shared/catalog.ts` (types, `microOf`, merge static micro into `CATALOG`)
- Create: `supabase/functions/_shared/catalogMicro.generated.ts` (generated)
- Modify: `supabase/functions/_shared/catalogLoader.ts` (select and map the 7 columns)
- Create: `scripts/foods/microModule.ts`
- Modify: `scripts/foods/build-seed.ts` (also writes the generated module)
- Test: `supabase/functions/_shared/catalog.micro.test.mjs`, `supabase/functions/_shared/catalogLoader.test.mjs` (add cases), `scripts/foods/microModule.test.mjs`

**Interfaces:**
- Produces (in `catalog.ts`):

```ts
export type GabaGroup = "cereales_tuberculos" | "frutas_verduras" | "lacteos" | "proteicos" | "grasas" | "azucares";
/** Per 100 g / 100 ml, same basis as `per100`. */
export interface MicroNutrients {
  fiberG: number; freeSugarsG: number; satFatG: number; sodiumMg: number; ironMg: number;
  gabaGroup: GabaGroup | null; isFruitVeg: boolean;
}
export interface MicroTotals { fiberG: number; freeSugarsG: number; satFatG: number; sodiumMg: number; ironMg: number; fruitVegG: number }
// Ingredient gains: micro?: MicroNutrients
export const STARCHY_NOT_FRUIT_VEG: ReadonlySet<string>; // papa, papa_criolla, yuca, platano
export function microOf(ingredient: Ingredient, quantity: number): MicroTotals | null; // null when no micro
```
- Produces (generated): `export const STATIC_MICRO: Readonly<Record<string, MicroNutrients>>`.
- Produces (scripts): `buildMicroModule(foods: FoodsFile): string`.

- [ ] **Step 1: Write the failing tests**

```js
// catalog.micro.test.mjs
test("every static ingredient carries micro-nutrients", () => {
  for (const item of CATALOG) assert.ok(item.micro, item.id);
});
test("microOf scales per 100 g and counts fruit/veg grams", () => {
  const brocoli = getIngredient("brocoli");
  assert.deepEqual(microOf(brocoli, 200), { fiberG: 5.2, freeSugarsG: 0, satFatG: 0.22, sodiumMg: 66, ironMg: 1.46, fruitVegG: 200 });
});
test("starchy foods never count as fruit/veg", () => {
  for (const id of ["papa", "papa_criolla", "yuca", "platano"]) assert.equal(microOf(getIngredient(id), 300).fruitVegG, 0);
});
test("unit foods use gramsPerUnit", () => {
  assert.equal(microOf(getIngredient("banano"), 2).fruitVegG, 240);
});
// catalogLoader.test.mjs (new cases)
test("a row with valid micro columns maps to ingredient.micro", ...);      // fiber_g "2.6" (string) accepted
test("a row with an out-of-range micro column keeps the food without micro", ...); // sodium_mg 50000 → micro undefined, food kept
// microModule.test.mjs
test("catalogMicro.generated.ts is in sync with foods.json", () => {
  assert.equal(buildMicroModule(foods), readFileSync(GENERATED, "utf8"));
});
```
Use floating comparisons with a 1e-9 tolerance helper where products are not exact.

- [ ] **Step 2: Run them and see them fail**

Run: `node --test supabase/functions/_shared/catalog.micro.test.mjs scripts/foods/microModule.test.mjs supabase/functions/_shared/catalogLoader.test.mjs`
Expected: FAIL (`microOf` is not exported; generated file missing).

- [ ] **Step 3: Implement**
  - `buildMicroModule` writes a header ("GENERADO por scripts/foods/build-seed.ts … No editar a mano"), then `STATIC_MICRO` sorted by id, from `fiberG, freeSugarsG, satFatG, sodiumMg, ironMg, gabaGroup, isFruitVeg` of `foods.json`. `build-seed.ts` writes it next to the SQL seed. Run `node scripts/foods/build-seed.ts` and commit the output (012 must come out byte-identical).
  - `catalog.ts`: `CATALOG` merges `micro: STATIC_MICRO[id]`. `microOf` returns null without `micro`; `fruitVegG` is grams when `isFruitVeg` and id not in `STARCHY_NOT_FRUIT_VEG`.
  - Loader: add `fiber_g, free_sugars_g, sat_fat_g, sodium_mg, iron_mg, gaba_group, is_fruit_veg` to the `foods` select; map with the same ranges as the SQL checks in migration 011 (`0..100`, sodium `0..40000`, `gaba_group` in the six values or null); any invalid value → no `micro`, count it, and log `catalog_micro_missing { count }` once per load.

- [ ] **Step 4: Run the tests and see them pass**, then `npm run check`.

- [ ] **Step 5: Commit** — `feat(catalog): micro-nutrients on ingredients from the DB and the static copy`

---

### Task 2: Goal targets, safety floor and blocked goals

**Files:**
- Create: `supabase/functions/_shared/planner/rules/targets.ts`
- Test: `supabase/functions/_shared/planner/rules/targets.test.mjs`

**Interfaces:**
- Consumes: `calcBmr`, `BodyProfile`, `NutritionTargets` from `nutrition.ts` (unchanged).
- Produces:

```ts
export type HealthCondition = "diabetes" | "kidney_disease" | "pregnancy_lactation" | "eating_disorder";
export type NoticeCode = "fat_blocked_minor" | "fat_blocked_senior" | "fat_blocked_low_bmi" | "goals_blocked_health" | "see_professional" | "deficit_capped_energy";
export interface Range { min: number; max: number }
export interface GoalTargets {
  effectiveGoals: string[];             // goals after blocking
  strategy: NutritionTargets["strategy"];
  bmr: number; tdee: number; weightKg: number;
  kcal: number;                          // daily target
  kcalRange: Range;                      // level 2
  kcalSafety: Range;                     // level 1
  proteinG: Range & { target: number };  // level 2, g/day
  proteinSafetyMaxG: number;             // level 1
  proteinFloorG: number | null;          // level 1, muscle only
  carbsMinG: number | null;              // level 2, muscle only
  notices: NoticeCode[];
}
export const REFERENCE_ADULT_KCAL = 2000;
export function safetyFloorKcal(profile: BodyProfile, bmr: number): number;
export function buildTargets(profile: BodyProfile, goals: string[], health?: HealthCondition[]): GoalTargets;
export function toNutritionTargets(targets: GoalTargets): NutritionTargets; // fat 27 % of kcal, carbs = rest, as calcTargets does today
export function householdFactor(householdSize: number, userKcal: number): number;
```

- [ ] **Step 1: Write the failing tests** (values from the "Rule values" table)

```js
const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };
test("fat: 20 % deficit inside the 15–25 % band", () => {
  const t = buildTargets(man, ["fat"]);
  assert.equal(t.strategy, "deficit");
  assert.ok(t.kcalRange.min >= Math.round(0.75 * t.tdee) && t.kcalRange.max <= Math.round(0.85 * t.tdee));
  assert.deepEqual([t.proteinG.min, t.proteinG.max], [112, 154]);
});
test("fat deficit capped at 1 % of weight per week", () => { /* 50 kg very_active woman: tdee - kcal <= 0.5*7700/7 */ });
test("fat + energy caps the deficit at 15 % and adds a notice", () => {
  const t = buildTargets(man, ["fat", "energy"]);
  assert.ok(t.kcal >= Math.round(0.85 * t.tdee)); assert.ok(t.notices.includes("deficit_capped_energy"));
});
test("muscle: surplus band, 1.4 g/kg floor and 3 g/kg carbs", () => {
  const t = buildTargets(man, ["muscle"]);
  assert.equal(t.proteinFloorG, 98); assert.equal(t.carbsMinG, 210);
});
test("recomposition: 2.0–2.4 g/kg, -5 % to maintenance", () => { /* fat+muscle */ });
test("safety floor wins over the goal band", () => {
  const t = buildTargets({ age: 30, weightKg: 45, heightCm: 150, activity: "sedentary", sex: "male" }, ["fat"]);
  assert.equal(t.kcalSafety.min, 1500); assert.ok(t.kcalRange.min >= 1500); assert.ok(t.kcal >= 1500);
});
test("unknown sex floor is 1400 and never below 800", ...);
test("minors and seniors lose fat; seniors see a professional", () => {
  assert.deepEqual(buildTargets({ ...man, age: 16 }, ["fat", "healthy"]).effectiveGoals, ["healthy"]);
  assert.deepEqual(buildTargets({ ...man, age: 66 }, ["fat"]).notices, ["fat_blocked_senior", "see_professional"]);
});
test("BMI < 18.5 blocks fat; BMI >= 35 recommends a professional", ...);
test("health conditions give maintenance; kidney caps protein at 1.2 g/kg", () => {
  const t = buildTargets(man, ["muscle"], ["kidney_disease"]);
  assert.equal(t.strategy, "maintenance"); assert.equal(t.proteinSafetyMaxG, 84); assert.equal(t.proteinG.max, 84);
});
test("protein max never above 2.5 g/kg", ...);
test("householdFactor: 1 for one person; others at 2000 kcal", () => {
  assert.equal(householdFactor(1, 2500), 1); assert.equal(householdFactor(3, 2000), 3); assert.equal(householdFactor(2, 2500), 1.8);
});
```

- [ ] **Step 2: Run and see them fail** — `node --test supabase/functions/_shared/planner/rules/targets.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement** `buildTargets`: block goals first (order of checks as in Global Constraints), pick the band from the effective goals, cap the fat deficit, compute `kcalSafety`, then `kcalRange = (target ± 10 %) ∩ band`, shifted up into `kcalSafety` when the floor is above it (and `kcal = max(kcal, kcalSafety.min)`). Round kcal and grams to integers. BMI = `weightKg / (heightCm/100)^2`.

- [ ] **Step 4: Run and see them pass.**

- [ ] **Step 5: Commit** — `feat(rules): goal targets with safety floor and blocked goals`

---

### Task 3: Rule set and rule evaluation

**Files:**
- Create: `supabase/functions/_shared/planner/rules/ruleSet.ts`
- Create: `supabase/functions/_shared/planner/rules/evaluate.ts`
- Test: `supabase/functions/_shared/planner/rules/ruleSet.test.mjs`, `supabase/functions/_shared/planner/rules/evaluate.test.mjs`

**Interfaces:**
- Consumes: `GoalTargets` (T2), `MicroNutrients`, `microOf`, `nutritionOf`, `Catalog` (T1), `ComposedWeek`, `Slot` (`planner/types.ts`).
- Produces:

```ts
export type RuleLevel = 1 | 2 | 3 | 4 | 5;
export type RuleCode =
  | "kcal_safety" | "protein_safety_max" | "protein_muscle_floor" | "budget"
  | "kcal_range" | "protein_min" | "protein_max" | "carbs_min_muscle" | "meal_protein_muscle"
  | "fruit_veg_min" | "fiber_min" | "free_sugar_max" | "sodium_max" | "fat_max" | "sat_fat_max"
  | "legumes_week" | "distinct_foods_week" | "gaba_groups_day" | "meal_kcal_share_max"
  | "breakfast_protein_min" | "breakfast_fiber_min" | "iron_sources_week" | "cheap_protein_share";
export type RuleUnit = "kcal" | "g" | "mg" | "g_per_kg" | "pct_kcal" | "pct_protein" | "count";
export type Metric = "kcal" | "protein" | "carbs" | "fat" | "satFat" | "freeSugars" | "fiber" | "sodium" | "fruitVeg" | "cheapProtein" | "dayKcal";
export interface LinearRule {
  code: RuleCode; level: RuleLevel;
  scope: "day" | "meal" | "week";
  slots?: readonly Slot[];                 // meal scope only
  terms: Partial<Record<Metric, number>>;  // Σ coef·metric
  min?: number; max?: number;              // bound on Σ
  slackScale: number;                      // |bound|, or targets.kcal when the bound is 0
  display: { unit: RuleUnit; target: number };
}
export interface StructuralRule { code: "gaba_groups_day" | "legumes_week" | "distinct_foods_week" | "iron_sources_week"; level: 3; min: number }
export interface RuleSet { targets: GoalTargets; linear: LinearRule[]; structural: StructuralRule[] }
export interface Shortfall { rule: RuleCode; level: RuleLevel; unit: RuleUnit; target: number; achieved: number }
export const LEGUME_IDS: ReadonlySet<string>;
export const CHEAP_PROTEIN_IDS: ReadonlySet<string>;
export function isIronSource(ingredient: Ingredient): boolean;
export function buildRuleSet(targets: GoalTargets): RuleSet;
export function evaluateWeek(week: ComposedWeek, rules: RuleSet, catalog: Catalog, tolerance?: number): Shortfall[]; // default tolerance 0.02
```
Share rules are written with a zero bound, e.g. `free_sugar_max`: `{ freeSugars: 4, kcal: -0.099 }, max: 0`; `meal_kcal_share_max`: `{ kcal: 1, dayKcal: -0.4 }, max: 0`; `cheap_protein_share`: `{ cheapProtein: 1, protein: -0.5 }, min: 0`. `budget` is a code only (the optimizer owns that constraint). `display` for protein rules uses `g_per_kg`; for share rules `pct_kcal` / `pct_protein`.

- [ ] **Step 1: Write the failing tests**

```js
test("base rules exist for every plan", () => {
  const codes = buildRuleSet(buildTargets(man, [])).linear.map((r) => r.code);
  for (const c of ["kcal_safety", "kcal_range", "protein_safety_max", "protein_min", "protein_max"]) assert.ok(codes.includes(c));
});
test("healthy adds the WHO rules at level 3", ...);       // fruit_veg_min 400, fiber_min 25, sodium_max 1999 ...
test("fat adds fruit/veg and fiber but not sodium", ...);
test("energy adds breakfast and 40 % share rules", ...);
test("free_sugar_max appears once with healthy + energy", ...);
test("save adds an elastic level-5 cheap protein rule", ...);
test("muscle adds meal protein for three slots", () => {
  const r = buildRuleSet(buildTargets(man, ["muscle"])).linear.find((x) => x.code === "meal_protein_muscle");
  assert.deepEqual([r.slots, r.min, r.max, r.level], [["desayuno", "almuerzo", "cena"], 20, 40, 2]);
});
// evaluate.test.mjs — fixture weeks built from catalog ids
test("a week that meets every healthy rule has no shortfalls", ...);
test("too little fiber reports fiber_min with achieved grams (worst day)", ...);
test("a week with one legume meal reports legumes_week 1 of 2", ...);
test("gaba_groups_day counts groups with at least 10 g", ...);
test("tolerance: 2 % under a minimum is not a shortfall", ...);
test("protein shortfall is reported in g/kg", () => { /* achieved = worst-day protein / weightKg, 2 decimals */ });
```

- [ ] **Step 2: Run and see them fail.**

- [ ] **Step 3: Implement.** `evaluateWeek` computes per-day and per-meal metric totals with `nutritionOf` and `microOf` (foods without `micro` contribute 0), checks each linear rule (for day rules report the worst day, for week rules the weekly total), then structural rules: a GABA group counts on a day when its foods sum `>= 10 g`; a legume or iron-source meal is a meal containing at least one such food.

- [ ] **Step 4: Run and see them pass.**

- [ ] **Step 5: Commit** — `feat(rules): goal rule set by priority level and week evaluation`

---

### Task 4: Recipe format, validation and generated library

**Files:**
- Create: `supabase/functions/_shared/recipes/types.ts`
- Modify: `supabase/functions/_shared/planner/types.ts` (`ComposedMeal.recipeId?: string`)
- Create: `scripts/recipes/recipeSchema.ts`, `scripts/recipes/build-library.ts`, `scripts/recipes/libraryModule.ts`
- Create: `data/recipes/` with 6 seed recipes: `avena_con_banano.json`, `huevos_pericos_con_arepa.json`, `lentejas_con_arroz.json`, `pollo_guisado_con_papa.json` (batch), `arroz_con_huevo_y_tomate.json`, `yogur_con_fruta.json`
- Create: `supabase/functions/_shared/recipes/library.generated.ts` (generated)
- Test: `scripts/recipes/recipeSchema.test.mjs`, `scripts/recipes/libraryModule.test.mjs`

**Interfaces:**
- Produces (`recipes/types.ts`):

```ts
export type Appliance = "estufa" | "microondas" | "olla_arrocera" | "freidora_aire" | "licuadora" | "horno" | "sandwichera" | "olla_presion";
export type CookingLevel = "basic" | "comfortable" | "enjoys";   // "Lo básico", "Me defiendo", "Me gusta cocinar"
export type IngredientRole = "protein" | "carb" | "veg" | "fat" | "fixed";
export type ScalableRole = Exclude<IngredientRole, "fixed">;
export interface RecipeAlternative { food: string; qty: number; name?: { es: string; en: string } }
export interface RecipeLine { food: string; qty: number; role: IngredientRole; optional?: boolean; inName?: boolean; alternatives?: RecipeAlternative[] }
export interface Recipe {
  id: string; status: "pending_owner_ok" | "approved"; source: "ai_draft" | "owner";
  name: { es: string; en: string }; slots: Slot[];
  minutes: number; level: CookingLevel; appliances: Appliance[];
  batch: { ok: boolean; keepsDays: number };     // keepsDays 1..4
  lines: RecipeLine[];                            // qty per ONE serving, in the food's unit
  scale?: Partial<Record<ScalableRole, [number, number]>>;
  steps: { es: string[]; en: string[] };
}
export const DEFAULT_ROLE_SCALE: Readonly<Record<ScalableRole, readonly [number, number]>>; // protein [0.5,2], carb [0.5,2], veg [0.75,2.5], fat [0.5,1.5]
export interface CookingPrefs { weekdayMinutes: 10 | 20 | 30; level: CookingLevel; appliances: Appliance[]; batch: boolean }
export const DEFAULT_COOKING: CookingPrefs; // { weekdayMinutes: 20, level: "basic", appliances: ["estufa", "licuadora"], batch: false }
export type RecipeWeek = Record<Day, Record<Slot, string>>; // recipe id per meal
```
- Produces (generated): `export const RECIPES: readonly Recipe[]` sorted by id and `export const RECIPE_LIBRARY_VERSION: string` (first 12 hex chars of the SHA-256 of the sorted JSON).
- Produces (scripts): `recipeFileSchema` (zod), `validateRecipes(recipes, foodIds: Set<string>, foodUnits: Map<string, FoodUnit>): string[]` (cross-file errors), `buildLibraryModule(recipes): string`.

Validation rules: `id` matches `^[a-z0-9_]{3,60}$` and equals the file name; `slots` 1–4 distinct; `minutes` 1–120; 1–10 lines, at least one non-`fixed`; `qty > 0`, and `<= 4` for `unit` foods; every `food` and alternative exists in `foods.json`, alternatives distinct and different from the line food; a line with `inName: true` must give `name` on every alternative; `steps.es` and `steps.en` 1–8 items of the same length, each 1–160 chars; `appliances` 1–8 distinct; `scale` ranges `0 < min <= 1 <= max <= 3`.

- [ ] **Step 1: Write the failing tests**

```js
test("the six seed recipes are valid", () => { assert.deepEqual(validateRecipes(loadAll(), foodIds, foodUnits), []); });
test("unknown food is rejected with the recipe id", () => {
  assert.match(validateRecipes([withLine(base, { food: "caviar", qty: 10, role: "protein" })], foodIds, foodUnits)[0], /lentejas_con_arroz.*caviar/);
});
test("an inName line needs a name on each alternative", ...);
test("steps in es and en must have the same count and <= 160 chars", ...);
test("more than 4 units of a unit food is rejected", ...);
test("file name must equal id", ...);
test("library.generated.ts is in sync with data/recipes", () => {
  assert.equal(buildLibraryModule(loadAll()), readFileSync(GENERATED, "utf8"));
});
```

- [ ] **Step 2: Run and see them fail.**

- [ ] **Step 3: Implement** the schema, the cross-file validator, the module builder and `build-library.ts` (usage `node scripts/recipes/build-library.ts`; exits 1 and prints every error when invalid). Write the six seed recipes by hand-checking quantities (one adult serving, e.g. `lentejas` 70 g dry, `arroz_blanco` 70 g dry), all `"status": "pending_owner_ok"`, `"source": "ai_draft"`; `lentejas_con_arroz` has `lentejas` with `inName: true` and alternatives `frijol` (name "Fríjoles con arroz" / "Beans with rice") and `garbanzo`. Generate the library and commit it.

- [ ] **Step 4: Run and see them pass.**

- [ ] **Step 5: Commit** — `feat(recipes): recipe format, validation and generated library`

---

### Task 5: Initial recipe set (48 recipes, pending the owner's OK)

**Files:**
- Create: `data/recipes/*.json` (42 more, total `>= 48`)
- Modify: `supabase/functions/_shared/recipes/library.generated.ts` (regenerated)
- Create: `docs/RECIPES.md` (how to add or fix a recipe; the owner-review checklist)
- Test: `scripts/recipes/coverage.test.mjs`

**Interfaces:**
- Consumes: `resolveRecipe`, `RestrictionRules`, `buildRestrictionRules` (T7, restrictions.ts), `RECIPES`, `DEFAULT_COOKING` (T4), `STATIC_CATALOG`, `STATIC_PRICE_BOOK`.

Why 48: seven frequent restriction profiles (none, vegetarian, vegan, lactose, gluten, fish/shellfish, pork) × four slots need at least 4 usable options each with the default kitchen (stove + blender, basic, 20 minutes), so that a week with repeats still varies and the optimizer has room to trade cost and nutrients. With recipes reused across almuerzo/cena and many recipes valid for several profiles, 48 is the smallest round set that passes the coverage matrix below (12 desayunos, 14 almuerzos, 12 cenas, 10 snacks, counting slot membership); more recipes cost owner review time without changing the coverage.

- [ ] **Step 1: Write the failing coverage test**

```js
const PROFILES = { none: [], vegetarian: ["vegetarian"], vegan: ["vegan"], lactose: ["lactose"], gluten: ["gluten"], fish: ["fish", "shellfish"], pork: ["pork"] };
test("at least 48 recipes, all pending or approved", () => { assert.ok(RECIPES.length >= 48); });
for (const [name, restrictions] of Object.entries(PROFILES)) for (const slot of SLOTS) {
  test(`${name} has enough ${slot} recipes with the default kitchen`, () => {
    const usable = RECIPES.filter((r) => r.slots.includes(slot) && isWeekdayUsable(resolveRecipe(r, ctx(restrictions))));
    assert.ok(usable.length >= (name === "vegan" || slot === "snacks" ? 3 : 4), `${usable.length}`);
  });
}
test("at least 12 batch-friendly lunch or dinner recipes", ...);
test("every slot has at least one weekend recipe of 30–60 minutes", ...);
test("at least 70 % of recipes are basic, <= 20 min and need only estufa/licuadora", ...);
test("no recipe step mentions an appliance the recipe does not list", ...); // keyword map: horno, microondas, freidora, sandwichera, olla a presión, olla arrocera
```

- [ ] **Step 2: Run and see it fail** — `node --test scripts/recipes/coverage.test.mjs` → FAIL (6 recipes).

- [ ] **Step 3: Write the recipes** (AI-drafted, Colombian, cheap staples: arepas, calentado, huevos pericos, changua, lentejas, fríjoles, arroz con pollo, sudado de pollo, sopa de verduras, tortilla de papa, pasta con atún, ensalada de garbanzos, avena en hojuelas, colada, salpicón, maduro con queso…). Each one: one adult serving, ≤ 6 steps in student language ("Pica la cebolla en cuadritos", never "sofríe" without saying what it means), `status: "pending_owner_ok"`. Run `node scripts/recipes/build-library.ts` after each batch.

- [ ] **Step 4: Run the coverage and schema tests and see them pass**, then `npm run check`.

- [ ] **Step 5: Commit** — `feat(recipes): initial set of 48 simple recipes pending owner review`

---

### Task 6: Cooking preferences in the profile (migration 015) and generation input

**Files:**
- Create: `supabase/migrations/015_cooking_preferences.sql`
- Create: `supabase/tests/cooking_prefs_checks.sql`
- Modify: `supabase/functions/_shared/buildGenerationInput.ts`
- Test: `scripts/cookingPrefsMigration.test.mjs`, `supabase/functions/_shared/buildGenerationInput.test.mjs` (add cases)

**Interfaces:**
- Consumes: `CookingPrefs`, `DEFAULT_COOKING`, `Appliance`, `CookingLevel` (T4).
- Produces: `export function normalizeCooking(row: unknown): CookingPrefs` and `GenerationRequest = GenerateInput & { city: string | null; cooking: CookingPrefs }`.

Migration (exact columns; nullable, no default, so adding them does not rewrite the table; NULL = not answered):

```sql
alter table public.profiles
  add column if not exists cooking_weekday_minutes smallint check (cooking_weekday_minutes in (10, 20, 30)),
  add column if not exists cooking_level text check (cooking_level in ('basic', 'comfortable', 'enjoys')),
  add column if not exists kitchen_appliances text[] check (
    kitchen_appliances <@ array['estufa','microondas','olla_arrocera','freidora_aire','licuadora','horno','sandwichera','olla_presion']::text[]
    and cardinality(kitchen_appliances) between 1 and 8),
  add column if not exists batch_cooking boolean;
```
Plus a `comment on column` for each (Spanish), the idempotent header used by 010–014, and no new policy (the own-row policies of `profiles` already cover the columns). Health conditions are **not** added here (sensitive data, Plan 3 with the privacy-policy update).

- [ ] **Step 1: Write the failing tests**

```js
// cookingPrefsMigration.test.mjs (text checks, like referencePricesMigration.test.mjs)
test("015 adds four nullable columns with checks and no default", ...);
test("015 creates no policy, grant or table", ...);
// buildGenerationInput.test.mjs
test("missing cooking columns (old DB) give the defaults", async () => { /* cooking query returns error 42703 */ assert.deepEqual(data.cooking, DEFAULT_COOKING); });
test("invalid values fall back per field", () => {
  assert.deepEqual(normalizeCooking({ cooking_weekday_minutes: 15, cooking_level: "chef", kitchen_appliances: ["horno", "x"], batch_cooking: "yes" }),
    { weekdayMinutes: 20, level: "basic", appliances: ["horno"], batch: false });
});
test("empty appliance list falls back to estufa + licuadora", ...);
```
`supabase/tests/cooking_prefs_checks.sql` asserts in a transaction that `cooking_weekday_minutes = 15` and an unknown appliance are rejected, and `NULL` is accepted (run in staging, rollout step 1).

- [ ] **Step 2: Run and see them fail.**

- [ ] **Step 3: Implement** the migration and a fifth parallel query in `buildGenerationInputFromDb` that selects only the four columns (separate on purpose, like `city`); any error → `DEFAULT_COOKING`.

- [ ] **Step 4: Run and see them pass.**

- [ ] **Step 5: Commit** — `feat(profile): optional cooking preferences with safe defaults`

---

### Task 7: Recipe eligibility and meal expansion

**Files:**
- Create: `supabase/functions/_shared/recipes/eligibility.ts`
- Create: `supabase/functions/_shared/recipes/expand.ts`
- Test: `supabase/functions/_shared/recipes/eligibility.test.mjs`, `supabase/functions/_shared/recipes/expand.test.mjs`

**Interfaces:**
- Consumes: `Recipe`, `RecipeLine`, `CookingPrefs`, `DEFAULT_ROLE_SCALE` (T4); `isAllowed`, `RestrictionRules` (restrictions.ts); `Catalog`; `PriceBook.carries`.
- Produces:

```ts
export interface EligibilityContext { rules: RestrictionRules; catalog: Catalog; prices: PriceBook; stores: string[]; cooking: CookingPrefs }
export interface ResolvedRecipe extends Recipe { weekendOnly: boolean } // lines keep only usable foods/alternatives
export const WEEKEND_MAX_MINUTES = 60;
export const MIN_RECIPES_PER_SLOT = 3;
export function weekdayMinutesCap(minutes: CookingPrefs["weekdayMinutes"]): number; // 10→10, 20→20, 30→45
export function resolveRecipe(recipe: Recipe, ctx: EligibilityContext): ResolvedRecipe | null;
export function eligibleRecipes(recipes: readonly Recipe[], ctx: EligibilityContext): ResolvedRecipe[];
export function countBySlot(recipes: readonly ResolvedRecipe[]): Record<Slot, number>;
// expand.ts
export type LineChoice = Record<number, string>;          // line index → chosen food id
export type RoleScales = Partial<Record<ScalableRole, number>>;
export function primaryChoice(recipe: ResolvedRecipe): LineChoice;
export function recipeName(recipe: ResolvedRecipe, choice: LineChoice): { es: string; en: string };
export function lineQty(recipe: ResolvedRecipe, index: number, food: string): number; // base qty of the line or of the alternative
export function expandMeal(recipe: ResolvedRecipe, choice: LineChoice, scales: RoleScales): ComposedMeal; // sets recipeId
```
A food is usable when it is in the catalog, has `micro`, `isAllowed`, and (if `stores` is not empty) some store `carries` it. Per line: a usable primary stays; an unusable primary is replaced by its first usable alternative (moved into `food`/`qty`, its `name` kept for `recipeName`); with none usable, an `optional` line is dropped, otherwise the recipe is ineligible. Unusable alternatives are removed. Appliances must be a subset of `cooking.appliances`. Weekday-ok: `minutes <= weekdayMinutesCap` and level `<=` user level; weekend-ok: `minutes <= 60` and level `<=` user level + 1; neither → null; weekend-ok only → `weekendOnly: true`.

- [ ] **Step 1: Write the failing tests**

```js
test("vegan drops recipes with egg and swaps nothing into meat", ...);
test("a forbidden primary is replaced by its first allowed alternative", () => {
  const r = resolveRecipe(lentejas, ctx({ excludedIds: ["lentejas"] }));
  assert.equal(r.lines[0].food, "frijol"); assert.deepEqual(recipeName(r, primaryChoice(r)).es, "Fríjoles con arroz");
});
test("a forbidden optional line (cilantro) is dropped, the recipe stays", ...);
test("a recipe needing horno is excluded with the default kitchen", ...);
test("35-minute basic recipe is weekendOnly with the 20-minute default", ...);
test("an 'enjoys' recipe is excluded for a basic cook even on weekends", ...);
test("30 means up to 45 minutes on weekdays", ...);
test("a food no selected store carries makes its line unusable", ...);
// expand.test.mjs
test("expandMeal scales each role and keeps fixed lines", () => {
  const meal = expandMeal(r, primaryChoice(r), { protein: 1.5, carb: 1 });
  assert.deepEqual(meal.items.find((i) => i.id === "lentejas").qty, 105); assert.equal(meal.items.find((i) => i.id === "sal").qty, 2);
});
test("choosing an alternative changes the name when the line is inName", ...);
test("choosing an alternative of a non-inName line keeps the name", ...);
```

- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Quantities in `expandMeal` are not rounded here (T10 rounds).
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(recipes): eligibility by restrictions, stores, kitchen and time; meal expansion`

---

### Task 8: LP solver adapter (`javascript-lp-solver`)

**Files:**
- Modify: `package.json` (dependency `"javascript-lp-solver": "0.4.24"`; test glob `"supabase/functions/_shared/**/*.test.mjs"` replacing the two `_shared` globs)
- Create: `supabase/functions/generate-weekly-plan/deno.json` — `{ "imports": { "javascript-lp-solver": "npm:javascript-lp-solver@0.4.24" } }`
- Create: `supabase/functions/_shared/planner/lp.ts`
- Create: `supabase/functions/_shared/planner/javascript-lp-solver.d.ts` (ambient `declare module` with the `Solve` signature used)
- Test: `supabase/functions/_shared/planner/lp.test.mjs`

**Library choice (decided):** `javascript-lp-solver` 0.4.24 — pure JavaScript, MIT, no dependencies, about 100 KB, the same bare import works in Node (from `node_modules`) and in Deno (through the function's `deno.json` import map), and nothing to instantiate at cold start. Our model is small (about 112 role-scale variables, up to 60 pack variables and up to 150 slack variables; 400 rows), which a dense simplex solves in tens of milliseconds. Rejected: `glpk.js` (GPL-3.0, incompatible with shipping inside an MIT app, plus a large WASM file) and `highs` WASM (MIT and faster on big models, but a 2–3 MB WASM file whose compilation counts against the 2 s Edge Function CPU limit at every cold start, and WASM asset loading in Supabase's Deno bundler adds deploy risk for no gain at this size). The adapter keeps the library behind one function so it can be swapped by changing one file.

**Interfaces:**
- Produces:

```ts
export interface LpConstraint { min?: number; max?: number; equal?: number }
export interface LpModel {
  optimize: string; opType: "min";
  constraints: Record<string, LpConstraint>;
  variables: Record<string, Record<string, number>>; // all variables are >= 0
}
export interface LpSolution { feasible: boolean; bounded: boolean; objective: number; values: Record<string, number>; cpuMs: number }
export function solveLp(model: LpModel, now?: () => number): LpSolution; // values default to 0 for variables absent in the result
```

- [ ] **Step 1: Write the failing tests**

```js
test("classic diet LP: optimum and values", () => {
  const s = solveLp(dietModel); assert.ok(s.feasible); assert.ok(Math.abs(s.objective - 0.08) < 1e-6);
});
test("infeasible model reports feasible=false", ...);
test("absent variables come back as 0", ...);
test("a 300-variable, 400-row model solves in under 150 ms", () => {
  const s = solveLp(syntheticModel(300, 400)); assert.ok(s.feasible); assert.ok(s.cpuMs < 150, `${s.cpuMs}`);
});
```

- [ ] **Step 2: Run and see them fail** — module and dependency missing.
- [ ] **Step 3: Implement.** `npm install javascript-lp-solver@0.4.24 --save-exact`; `solveLp` wraps `Solve`, measures `cpuMs` with `performance.now()` (synchronous call ≈ CPU), and never throws (exceptions → `feasible: false`). If the Deno CLI is available, also run `deno check supabase/functions/generate-weekly-plan/index.ts`; otherwise this is verified in staging (rollout step 2).
- [ ] **Step 4: Run and see them pass**, then `npm run check` (the wider glob now runs the wave A tests in subfolders).
- [ ] **Step 5: Commit** — `feat(planner): LP solver adapter with javascript-lp-solver`

---

### Task 9: Optimizer model builder and pack offers

**Files:**
- Modify: `supabase/functions/_shared/planner/priceBook.ts` (`packOffer` on `PriceBook` and the city book)
- Modify: `supabase/functions/_shared/planner/stores.ts` (`packOffer` on `STATIC_PRICE_BOOK`)
- Create: `supabase/functions/_shared/planner/optimizer/model.ts`
- Test: `supabase/functions/_shared/planner/priceBook.test.mjs` (add cases), `supabase/functions/_shared/planner/optimizer/model.test.mjs`

**Interfaces:**
- Consumes: `LpModel` (T8), `RuleSet`, `LinearRule`, `Metric` (T3), `ResolvedRecipe`, `LineChoice`, `lineQty` (T7), `DEFAULT_ROLE_SCALE`, `RecipeWeek` (T4).
- Produces:

```ts
// priceBook.ts
export interface PackOffer { store: string; packSize: number; packPriceCop: number }
// PriceBook gains: packOffer(ingredient: Ingredient, stores: string[]): PackOffer  — lowest COP per base unit among stores that carry it; same estimate fallback as quote
// optimizer/model.ts
export type ModelMode = "elastic" | "strict" | "safety_only";
export interface PlannedMeal { day: Day; slot: Slot; recipe: ResolvedRecipe; choice: LineChoice; group: string } // same group = cooked once (batch), shares scale vars
export interface BuildModelInput {
  meals: PlannedMeal[]; rules: RuleSet; catalog: Catalog; offers: ReadonlyMap<string, PackOffer>;
  householdFactor: number; budgetCop: number | null; mode: ModelMode;
}
export interface SlackInfo { rule: LinearRule; day?: Day; slot?: Slot; sense: "min" | "max" }
export interface BuiltModel { model: LpModel; slacks: ReadonlyMap<string, SlackInfo>; scaleVar(group: string, role: ScalableRole): string; packVar(foodId: string): string }
export const PENALTY: Readonly<Record<2 | 3 | 4 | 5, number>>; // { 2: 1e6, 3: 1e4, 4: 1e3, 5: 1e2 } per unit of relative slack
export function buildModel(input: BuildModelInput): BuiltModel;
```
Model: one variable per (`group`, role used in the recipe) bounded by the recipe's `scale` or `DEFAULT_ROLE_SCALE` (bounds are constraint rows named after the variable); `fixed` lines add constants to the right-hand side. Each line contributes `lineQty × scale` × nutrient per unit (from `nutritionOf` / `microOf` of 1 unit). One pack variable per food: `packSize·p − householdFactor·Σ qty ≥ 0`, objective coefficient `packPriceCop / 1000` (kCOP). Budget row `Σ packPriceCop·p ≤ budgetCop` when not null (always hard). Level 1 rules: hard. Levels 2–5: `elastic` adds a slack `s ≥ 0` per rule instance with `± slackScale·s` and objective `PENALTY[level]·s`; `strict` makes them hard (level 5 stays elastic); `safety_only` drops levels 2–5. Variable names: `x|<group>|<role>`, `p|<foodId>`, `s|<code>|<day>|<slot>` (`-` when not applicable).

- [ ] **Step 1: Write the failing tests**

```js
test("packOffer picks the lowest price per unit among carrying stores", ...);
test("packOffer falls back to the estimate when no store has a fresh price", ...);
test("one scale variable per group and role; batch meals share it", ...);
test("fixed lines move to the right-hand side", ...);
test("budget row is hard in every mode; level-1 rules have no slack", ...);
test("elastic mode adds one slack per day rule per day with its penalty", () => {
  const b = buildModel({ ...input, mode: "elastic" });
  assert.equal([...b.slacks.keys()].filter((k) => k.startsWith("s|fiber_min|")).length, 7);
  assert.equal(b.model.variables["s|fiber_min|lun|-"].cost, PENALTY[3]);
});
test("strict mode has no slack except cheap_protein_share", ...);
test("householdFactor multiplies the pack requirement", ...);
```

- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(optimizer): LP model from recipes, rules and pack prices`

---

### Task 10: Optimizer solve, diagnosis and CPU budget

**Files:**
- Create: `supabase/functions/_shared/planner/optimizer/optimize.ts`
- Test: `supabase/functions/_shared/planner/optimizer/optimize.test.mjs`

**Interfaces:**
- Consumes: `buildModel`, `PlannedMeal`, `PackOffer` (T9); `solveLp` (T8); `evaluateWeek`, `Shortfall`, `RuleSet` (T3); `expandMeal`, `primaryChoice`, `ResolvedRecipe` (T7); `roundQty`, `weekCost` (build.ts, exported by T12); `RecipeWeek`, `CookingPrefs` (T4).
- Produces:

```ts
export type OptimizeStatus = "optimal" | "relaxed" | "over_budget" | "infeasible";
export interface CpuBudget { left(): number; spend(ms: number): void }
export const OPTIMIZER_CPU_BUDGET_MS = 900;
export function createCpuBudget(limitMs?: number): CpuBudget;
export interface OptimizeInput {
  recipeWeek: RecipeWeek; recipes: ReadonlyMap<string, ResolvedRecipe>; rules: RuleSet;
  catalog: Catalog; prices: PriceBook; stores: string[]; householdFactor: number; budgetCop: number;
  cooking: CookingPrefs; cpu: CpuBudget; diagnose: boolean;
}
export interface OptimizeResult {
  status: OptimizeStatus; week: ComposedWeek | null; costCop: number | null;
  shortfalls: Shortfall[];          // levels 2–4 only (level 5 never reported)
  requiredBudgetCop: number | null; // budget that meets every rule (relaxed) or only safety (over_budget); rounded up to 1000
  solves: number; cpuMs: number;
}
export function optimizeWeek(input: OptimizeInput): OptimizeResult;
export function batchGroups(week: RecipeWeek, recipes: ReadonlyMap<string, ResolvedRecipe>, batch: boolean): Map<string, string>; // "day.slot" → group
```
Algorithm (not determined by the signature):
1. Groups: with `cooking.batch`, consecutive days with the same recipe in the same slot and `batch.ok` share a group, up to `keepsDays`; otherwise each meal is its own group.
2. Solve `elastic` with primary choices. Round: scales → `expandMeal` → `roundQty` per item → real cost with `weekCost` (whole packs, `PriceBook.quote`). If real cost > budget, tighten the budget row by the overshoot and re-solve, at most 2 times; still over → treat as infeasible.
3. If infeasible or any slack `> 1e-6`: solve again with the cheapest alternative per line (COP per g protein for `protein`, per kcal for `carb`/`fat`, per gram for `veg`) and keep the better result (feasible first, then lower total weighted slack, then lower cost).
4. Infeasible → `over_budget`; with `diagnose`, solve `safety_only` without budget for `requiredBudgetCop`; that infeasible too → `infeasible`.
5. Slack left → `relaxed`; shortfalls = `evaluateWeek` of the rounded week (levels 2–4); with `diagnose`, solve `strict` without budget for `requiredBudgetCop` (null if infeasible).
6. Else `optimal`. Before each solve check `cpu.left() > 0`; when spent, return the best result so far (status from it) and log `optimizer_cpu_exhausted`.

- [ ] **Step 1: Write the failing tests** (fixtures use `STATIC_CATALOG`, `STATIC_PRICE_BOOK` and the T4 seed recipes)

```js
test("generous budget: optimal, every rule met, cost <= budget", () => {
  const r = optimizeWeek(input({ budgetCop: 400_000, goals: ["healthy"] }));
  assert.equal(r.status, "optimal"); assert.deepEqual(evaluateWeek(r.week, rules, catalog), []); assert.ok(r.costCop <= 400_000);
});
test("cost is the minimum: removing budget pressure never lowers it", ...); // optimal cost with budget B == cost without budget row
test("rounded plan never exceeds budget", () => { /* tight budget fixture, many pack-heavy foods */ });
test("tight budget for 100 kg muscle: relaxed with protein_min shortfall and a required budget", () => {
  const r = optimizeWeek(input({ budgetCop: 60_000, goals: ["muscle"], weightKg: 100, diagnose: true }));
  assert.equal(r.status, "relaxed"); assert.ok(r.shortfalls.some((s) => s.rule === "protein_min" && s.unit === "g_per_kg"));
  assert.ok(r.requiredBudgetCop > 60_000 && r.requiredBudgetCop % 1000 === 0); assert.ok(r.costCop <= 60_000);
});
test("budget below the safety minimum: over_budget with requiredBudgetCop", ...);
test("cheapest alternative is used when it removes the shortfall", ...);
test("save never appears as a shortfall", ...);
test("batch meals share portions on consecutive days", ...);
test("worst case stays inside the CPU budget and returns a result", () => {
  const cpu = createCpuBudget(OPTIMIZER_CPU_BUDGET_MS);
  const r = optimizeWeek(worstCase({ goals: ["fat", "muscle", "healthy", "energy", "save", "family"], householdSize: 6, stores: 5, distinctRecipes: 28, cpu }));
  assert.ok(r.cpuMs <= OPTIMIZER_CPU_BUDGET_MS + 150); assert.ok(r.status);
});
test("an exhausted CPU budget starts no new solve", () => { assert.equal(optimizeWeek(input({ cpu: createCpuBudget(0) })).solves, 0); });
```

- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** (log `optimizer_result { status, solves, cpu_ms }`).
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(optimizer): cheapest week that meets the rules, with clash diagnosis`

---

### Task 11: The AI chooses recipes (compose.ts)

**Files:**
- Modify: `supabase/functions/_shared/planner/compose.ts` (new schema, parser and prompt; the old ingredient-level helpers stay until T17)
- Test: `supabase/functions/_shared/planner/compose.recipes.test.mjs`

**Interfaces:**
- Consumes: `ResolvedRecipe` (T7), `RecipeWeek`, `CookingPrefs` (T4), `GoalTargets` (T2).
- Produces:

```ts
export function recipeResponseFormat(slotIds: Record<Slot, string[]>): object; // strict; day: { day: enum DAYS, desayuno: { type: "string", enum: slotIds.desayuno }, ... }
export type RecipeComposeIssue = { code: "invalid_format" } | { code: "wrong_days" } | { code: "unknown_recipe"; id: string } | { code: "missing_meal"; day: Day; slot: Slot };
export function parseRecipeComposition(raw: unknown, eligible: ReadonlyMap<string, ResolvedRecipe>): { week: RecipeWeek | null; issue: RecipeComposeIssue | null };
export function repairWeekendOnly(week: RecipeWeek, eligible: ReadonlyMap<string, ResolvedRecipe>): RecipeWeek;
export const RECIPE_COMPOSER_SYSTEM_PROMPT: string;
export interface RecipeComposerInput {
  targets: GoalTargets; budgetPerPersonCop: number; goals: string[]; recipes: ResolvedRecipe[];
  cooking: CookingPrefs; catalog: Catalog; prices: PriceBook; stores: string[];
  unmatchedText: string[]; feedback?: string; onlyDays?: readonly string[]; planned?: string[];
}
export function buildRecipeComposerPrompt(input: RecipeComposerInput): string;
```
Parsing: a recipe id not valid for its slot → `unknown_recipe`; a missing or unreadable meal is filled from the nearest day with that slot (same repair as today), `missing_meal` only when no day has it. `repairWeekendOnly` replaces a `weekendOnly` recipe on lun–vie with the weekday-ok recipe of the same slot used most often that week, else the first weekday-ok recipe of that slot by id. One prompt line per recipe: `id | name_es | slots | minutes | weekend-only? | batch? | main foods | ~kcal | ~protein g | ~COP per serving (packOffer unit prices)`.

System prompt rules (exact intent; wording may be polished): pick ONLY ids from the lists; 7 days, 4 meals; repeat a dish at most 3 times a week, or for batch recipes on 2–3 consecutive days when the user cooks in batches; weekend-only recipes only on sab/dom; vary the main protein; prefer cheap recipes when the budget is tight or the goal includes save; portions are adjusted automatically, so choose for taste, variety and the goals (more legumes and vegetables for healthy and fat, protein-rich dishes for muscle, a protein breakfast for energy).

- [ ] **Step 1: Write the failing tests**

```js
test("schema has one enum per slot", () => { assert.deepEqual(fmt.json_schema.schema.properties.days.items.properties.desayuno.enum, ["avena_con_banano", ...]); });
test("schema stays under OpenAI strict limits (<= 100 properties, <= 500 enum values)", ...);
test("parse maps ids to a RecipeWeek", ...);
test("a lunch-only id in desayuno is unknown_recipe", ...);
test("a missing meal is copied from the nearest day", ...);
test("weekend-only recipe on Monday is replaced by a weekday one", ...);
test("prompt lists every eligible recipe and the weekday time limit", ...);
test("prompt includes feedback and onlyDays when given", ...);
```

- [ ] **Step 2: Run and see them fail.** — **Step 3: Implement.** — **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(compose): the AI picks recipe ids from the library`

---

### Task 12: Plan output with recipes, notices and compliance

**Files:**
- Modify: `supabase/functions/_shared/planner/build.ts` (`assemblePlan` options and `BuiltPlan`; export `roundQty`; `totalsByIngredient` accepts a fractional household factor)
- Modify: `supabase/functions/_shared/weeklyPlanSchema.ts` (optional fields)
- Create: `scripts/test-hooks/register.mjs`, `scripts/test-hooks/npm-specifiers.mjs` (resolve hook mapping `npm:zod@4.6.7` → `zod`, so Node tests can import the shared schema)
- Modify: `package.json` (test script: `node --import ./scripts/test-hooks/register.mjs --test …`)
- Test: `supabase/functions/_shared/weeklyPlanSchema.test.mjs`, `supabase/functions/_shared/planner/planner.test.mjs` (add cases)

**Interfaces:**
- Consumes: `ResolvedRecipe` (T7), `NoticeCode` (T2), `Shortfall` (T3), `RECIPE_LIBRARY_VERSION` (T4).
- Produces (all new fields optional in `BuiltPlan` and in the schema):

```ts
export interface PlanRecipeInfo { name: { es: string; en: string }; minutes: number; level: CookingLevel; appliances: Appliance[]; batch: boolean; steps: { es: string[]; en: string[] } }
export interface PlanCompliance { status: "full" | "partial"; unmet: { rule: string; target: number; achieved: number; unit: string }[] }
// BuiltPlan gains:
//   meal_recipes?: Record<Day, Record<Slot, string>>;
//   recipes?: Record<string, PlanRecipeInfo>;       // only recipes used this week
//   notices?: string[];
//   compliance?: PlanCompliance;
//   summary.recipe_library_version?: string;
// assemblePlan options gain: recipes?: ReadonlyMap<string, ResolvedRecipe>; notices?: NoticeCode[]; compliance?: PlanCompliance; householdFactor?: number (default householdSize)
export function roundQty(ingredient: Ingredient, qty: number): number;
```
Schema: `rule`, `unit` and notices are `z.string().min(1).max(40)` (never enums); `steps` arrays 1–8 items of 1–200 chars; `minutes` int 1–240; `recipes` record of at most 28 entries; recipe ids `^[a-z0-9_]{3,60}$`.

- [ ] **Step 1: Write the failing tests**

```js
test("an old plan without the new fields still parses", () => { assert.ok(parseWeeklyPlanJson(oldPlanFixture).data); });
test("a plan with recipes, notices and compliance parses", ...);
test("an unknown notice or rule code still parses (forward compatible)", ...);
test("a step longer than 200 chars is rejected", ...);
test("assemblePlan embeds only the recipes used and their names", ...);
test("shopping quantities use the household factor", () => { /* factor 1.8 → packs for 1.8 portions */ });
```

- [ ] **Step 2: Run and see them fail.** — **Step 3: Implement.** — **Step 4: Run and see them pass**, `npm run check`.
- [ ] **Step 5: Commit** — `feat(plan): optional recipe details, notices and compliance in the plan`

---

### Task 13: Generation pipeline with rules, recipes and optimizer

**Files:**
- Modify: `supabase/functions/_shared/planner/generate.ts`
- Modify: `supabase/functions/_shared/errors.ts` (add `"goals_unreachable"`)
- Modify: `src/lib/ai/generateWeeklyPlan.ts` (only `CODE_TO_MESSAGE.goals_unreachable: "gen.error.goalsUnreachable"`, required by the type)
- Modify: `src/i18n/messages/errors.ts` (only the key `gen.error.goalsUnreachable`: es "Así como está, tu plan no cumple todas tus metas." / en "As it stands, your plan can't meet all your goals.")
- Test: `supabase/functions/_shared/planner/generate.recipes.test.mjs` (new; the old `generate.test.mjs` is rewritten to the recipe-id fake model)

**Interfaces:**
- Consumes: everything above.
- Produces:

```ts
export interface GenerateInput {
  weeklyBudgetCop: number; goals: string[]; stores: string[]; restrictions: string[];
  householdSize: number; profile: BodyProfile;
  cooking?: CookingPrefs;           // default DEFAULT_COOKING
  health?: HealthCondition[];       // default [] (Plan 3 fills it)
  allowPartial?: boolean;           // "Quiero el plan igual"
}
export interface FailureDiagnostics { availableFoods: number; totalFoods: number; reasons: string[]; availableRecipes?: Record<Slot, number> }
export interface GenerateFailure { error: {
  code: GenerationErrorCode; message: string; diagnostics?: FailureDiagnostics;
  budget?: { currentBudget: number; requiredBudget: number; recommendedIncrease: number };
  conflicts?: Shortfall[];          // goals_unreachable only
  canForce?: boolean;               // goals_unreachable only: true
} }
```
Pipeline: (1) budget floor 40 000 COP per person, unchanged; (2) `buildTargets` + `buildRuleSet`; (3) `eligibleRecipes`; any slot `< MIN_RECIPES_PER_SLOT` → `restrictions_too_strict` with `availableRecipes`; (4) up to 3 attempts: compose (with day fill as today, using `recipeResponseFormat`), parse, `repairWeekendOnly`, `optimizeWeek` (`diagnose` only on the last usable attempt or when time is short); `relaxed` with time left (`canStart(1, MIN_COMPOSE_TIME_MS)`) → retry with feedback built from the shortfalls (`fiber_min`/`fruit_veg_min` → "pick more recipes with vegetables, legumes or fruit"; `protein_min` → "more protein-rich recipes"; `legumes_week` → "at least 2 legume dishes"; `distinct_foods_week` → "more variety"; `gaba_groups_day` → "each day needs 4 food groups"; `iron_sources_week` → "legumes, red meat or spinach in 5 meals"; `sodium_max` → "fewer canned or salty dishes"; `free_sugar_max` → "fewer sweetened dishes"); keep the best result (fewest weighted shortfalls, then cost); (5) decide: `optimal` → plan with `compliance: { status: "full", unmet: [] }`; `relaxed` + `allowPartial` → plan with `compliance.status = "partial"`; `relaxed` → `goals_unreachable` with `conflicts`, `canForce: true`, and `budget` when `requiredBudgetCop` exists; `over_budget` → `budget_too_low` with `requiredBudgetCop`; `infeasible` → `generation_failed` with reason `optimizer_infeasible`. (6) `assemblePlan` with recipes, `notices` from the targets, and `householdFactor`. No rename calls: names come from the recipes. One `CpuBudget` per request.

- [ ] **Step 1: Write the failing tests** (fake model returns recipe ids; no OpenAI)

```js
test("happy path: plan from recipes, every rule met, cost <= budget, names from recipes", ...);
test("model calls: one per attempt plus day fills, never a rename call", ...);
test("an unknown recipe id triggers a retry with feedback", ...);
test("weekend-only recipe on Tuesday is repaired, not rejected", ...);
test("unreachable goals: goals_unreachable with conflicts, canForce and a budget option", ...);
test("allowPartial: plan with compliance partial and total <= budget", ...);
test("allowPartial never relaxes the budget: over_budget still answers budget_too_low", ...);
test("vegan + microwave only: restrictions_too_strict with availableRecipes", ...);
test("vegan: no tagged food anywhere in the plan or the shopping list", ...);
test("a 16-year-old asking for fat gets a maintenance plan with notice fat_blocked_minor", ...);
test("household of 3 buys for 1 + 2·2000/userKcal portions", ...);
test("shopping list foods are exactly the menu foods (after swaps)", ...);
test("time budget: no new attempt when less than MIN_COMPOSE_TIME_MS is left", ...);
```

- [ ] **Step 2: Run and see them fail.** — **Step 3: Implement.** — **Step 4: Run and see them pass**, `npm run check` (the old `planner.test.mjs` tests of `fitToBudget` and naming still pass; their code is now unused and is removed in T17).
- [ ] **Step 5: Commit** — `feat(planner): plans from recipes tuned by the optimizer to meet goal rules`

---

### Task 14: Request body, app version and error compatibility in the Edge Function

**Files:**
- Create: `supabase/functions/_shared/generationRequest.ts`
- Create: `supabase/functions/_shared/generationResponse.ts`
- Modify: `supabase/functions/generate-weekly-plan/index.ts`
- Test: `supabase/functions/_shared/generationRequest.test.mjs`, `supabase/functions/_shared/generationResponse.test.mjs`

**Interfaces:**
- Consumes: `GenerateFailure` (T13).
- Produces:

```ts
export interface GenerationRequestBody { appVersion: string | null; allowPartial: boolean }
export const MAX_BODY_CHARS = 2048;
export const MIN_VERSION_GOALS_UNREACHABLE = "0.1.0";
export function parseGenerationRequestBody(text: string): GenerationRequestBody; // > 2048 chars, bad JSON, non-object → defaults; appVersion must match ^\d{1,3}\.\d{1,3}\.\d{1,3}$; allowPartial only when === true
export function supportsGoalsUnreachable(appVersion: string | null): boolean;
export function failureResponse(failure: GenerateFailure["error"], body: GenerationRequestBody): { status: number; payload: Record<string, unknown> };
```
`failureResponse` rules: `budget_too_low` with budget → 200 `{ error: "budget_too_low", code, ...budget }` (as today); `goals_unreachable` for a supporting client → 200 `{ error: message, code, conflicts, canForce: true, budgetOption?: budget }`; for an old client → `budget_too_low` 200 with the budget when present, else `{ error, code: "goal_incoherent" }` 422; everything else as today (503 `server_config`, 429 `rate_limited`, else 422). `allowPartial` from an old client is ignored (it cannot send it). The function reads `await req.text()` only when `content-length` is absent or `<= 2048`, parses before the quota insert, passes `allowPartial` into `generatePlan`, and logs `client_version { version }` (or `none`).

- [ ] **Step 1: Write the failing tests**

```js
test("empty body ({} from the old web) gives no version and no partial", ...);
test("oversized, non-JSON or array bodies give defaults", ...);
test("appVersion with letters or 4 parts is ignored", ...);
test("allowPartial: 'true' (string) is not accepted", ...);
test("0.1.0 and 1.2.3 support goals_unreachable; 0.0.9 and null do not", ...);
test("old client + goals_unreachable with budget → budget_too_low 200 with numbers", ...);
test("old client + goals_unreachable without budget → goal_incoherent 422", ...);
test("new client + goals_unreachable → 200 with conflicts and canForce", ...);
```

- [ ] **Step 2: Run and see them fail.** — **Step 3: Implement.** — **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(function): app version, "Quiero el plan igual" flag and compatible errors`

---

### Task 15: Web — send the version and show "no se puede cumplir"

**Files:**
- Modify: `package.json` (`"version": "0.1.0"`)
- Modify: `vite.config.ts` (`define: { __APP_VERSION__: JSON.stringify(pkg.version) }`), `src/vite-env.d.ts` (declare it)
- Modify: `src/lib/ai/generateWeeklyPlan.ts` (`generateWeeklyPlan(options?: { allowPartial?: boolean })`, body `{ appVersion: __APP_VERSION__, allowPartial }`, new error kind)
- Create: `src/lib/ai/goalConflicts.ts` (pure: read and describe conflicts; no `@/` imports so Node can test it)
- Create: `src/app/components/generation/GoalsUnreachablePanel.tsx`
- Modify: `src/app/components/generation/AIGenerationScreen.tsx`, `src/i18n/messages/errors.ts`
- Test: `src/lib/goalConflicts.test.mjs`

**Interfaces:**
- Consumes: response shape from T14.
- Produces:

```ts
export interface GoalConflict { rule: string; level: number; unit: string; target: number; achieved: number }
export interface GoalsUnreachableGenerationError { kind: "goals_unreachable"; conflicts: GoalConflict[]; budgetOption: { currentBudget: number; requiredBudget: number; recommendedIncrease: number } | null }
export function readGoalsUnreachable(body: unknown): GoalsUnreachableGenerationError | null; // drops malformed conflicts, keeps at most 8
export function describeConflict(conflict: GoalConflict): { key: string; params: Record<string, string | number> } | null; // unknown rule → null (panel shows a generic line)
```
Copy (exact, es / en):
- Title: "Así como está, tu plan no cumple todas tus metas" / "As it stands, your plan can't meet all your goals"
- Intro: "Para lograrlo, puedes cambiar una de estas cosas:" / "To get there, you can change one of these:"
- Budget option: "Subir tu presupuesto en {amount}" / "Raise your budget by {amount}"
- Rule lines: `protein_min` "Bajar tu meta de proteína {gap} g por kilo (hoy llegas a {achieved} de {target})" / "Lower your protein goal by {gap} g per kilo (you reach {achieved} of {target})"; `fiber_min` "Fibra: llegas a {achieved} de {target} g al día" / "Fiber: you reach {achieved} of {target} g a day"; `fruit_veg_min` "Frutas y verduras: llegas a {achieved} de {target} g al día" / "Fruit and vegetables: you reach {achieved} of {target} g a day"; `kcal_range` "Calorías: llegas a {achieved} de {target} al día" / "Calories: you reach {achieved} of {target} a day"; the other codes follow the same "{Nombre}: llegas a {achieved} de {target} {unidad}" pattern; generic: "Una de tus metas no se alcanza del todo" / "One of your goals is not fully reached".
- Force button: "Quiero el plan igual" / "Give me the plan anyway"
- Force help: "Te damos el mejor plan posible sin pasarte de tu presupuesto ni romper tus restricciones, y te decimos qué no se cumple." / "We'll give you the best plan possible without going over your budget or breaking your restrictions, and tell you what isn't met."

The budget option links to the existing budget editor; the force button calls `generateWeeklyPlan({ allowPartial: true })` and then follows the normal success path. Buttons are real `<button>`s with visible focus; the conflict list is a `<ul>`.

- [ ] **Step 1: Write the failing tests**

```js
test("reads conflicts and budget option", ...);
test("malformed conflicts are dropped; more than 8 are cut", ...);
test("protein gap is target - achieved rounded to 1 decimal (the panel formats it per language)", () => { assert.equal(describeConflict({ rule: "protein_min", unit: "g_per_kg", target: 1.6, achieved: 1.32, level: 2 }).params.gap, 0.3); });
test("unknown rule gives null", ...);
```

- [ ] **Step 2: Run and see them fail.** — **Step 3: Implement.** — **Step 4: Run and see them pass**, `npm run check`, `npm run build`, and check the panel in the dev gallery (`/__preview/…`, add a sample) at 360 px width.
- [ ] **Step 5: Commit** — `feat(web): explain unreachable goals and offer "Quiero el plan igual"`

---

### Task 16: Web — recipe details, notices and partial-plan warning

**Files:**
- Create: `src/lib/planRecipes.ts` (pure helpers, no `@/` imports)
- Modify: `src/lib/ai/types.ts` (optional fields mirror T12)
- Modify: `src/app/components/plan/WeeklyMenuScreen.tsx`, `src/i18n/messages/app.ts`
- Test: `src/lib/planRecipes.test.mjs`

**Interfaces:**
- Consumes: plan fields from T12.
- Produces:

```ts
export function recipeForMeal(plan: WeeklyPlan, day: Day, slot: Slot): (PlanRecipeInfo & { id: string }) | null; // null for old plans
export function complianceLines(plan: WeeklyPlan): { rule: string; percent: number }[];          // percent = round(100 · achieved / target) for min rules
export function knownNotices(plan: WeeklyPlan): string[];                                         // filters to codes the web has copy for
```
Each meal shows the recipe name, "{minutes} min", the level ("Lo básico" / "Me defiendo" / "Me gusta cocinar"), the appliances, a "Sirve para varios días" tag when `batch`, and the steps inside a `<details>` (text nodes only, never HTML injection). A partial plan shows a banner "Este plan no cumple todas tus metas:" with lines such as "Llegas al 85 % de tu proteína" / "You reach 85 % of your protein". Notices: `fat_blocked_minor` "Por tu edad, armamos un plan para mantener tu peso, no para bajarlo." ; `fat_blocked_senior` "Después de los 65 años no armamos planes para bajar de peso. Te recomendamos hablar con un profesional de la salud."; `fat_blocked_low_bmi` "Tu peso ya es bajo para tu estatura, así que armamos un plan para mantenerlo."; `goals_blocked_health` "Por tu condición de salud, armamos un plan saludable de mantenimiento."; `see_professional` "Te recomendamos consultar a un profesional de la salud."; `deficit_capped_energy` "Como también quieres más energía, el déficit de calorías es suave." (with English versions in the same tone).

- [ ] **Step 1: Write the failing tests** (old plan → nulls and empty lists; new plan → recipe info, percents, unknown notice filtered).
- [ ] **Step 2: Run and see them fail.** — **Step 3: Implement.** — **Step 4: Run and see them pass**, `npm run check`, `npm run build`, dev gallery check at 360 px.
- [ ] **Step 5: Commit** — `feat(web): show recipe time, level, appliances and steps; plan warnings`

---

### Task 17: Remove the old free-composition code (only after the owner's OK)

**Files:**
- Delete: `supabase/functions/_shared/planner/naming.ts`, `supabase/functions/_shared/planner/swaps.ts`
- Modify: `supabase/functions/_shared/planner/build.ts` (remove `fitToBudget`, `normalizeWeek`, `checkQuality`, `feedbackFor`, swap helpers), `supabase/functions/_shared/planner/compose.ts` (remove the ingredient-level schema, parser and prompt), their tests in `planner.test.mjs` and `generate.test.mjs`
- Modify: `scripts/eval-plans.mjs` if it imports removed code

- [ ] **Step 1: Ask the owner** (through the controller, in plain Spanish): "El sistema viejo, donde la IA inventaba platos, ya no se usa. ¿Lo borramos del código? Se puede recuperar del historial si hiciera falta." Continue only with OK.
- [ ] **Step 2:** `grep` for every removed export; each remaining reference is a failing typecheck — run `npm run check` and see it fail.
- [ ] **Step 3:** Remove the code and the tests that only covered it.
- [ ] **Step 4:** `npm run check` green; `node scripts/eval-plans.mjs --help` (or a dry run) still starts.
- [ ] **Step 5: Commit** — `refactor(planner): remove the free-composition path replaced by recipes`

---

### Task 18: Architecture docs and ordered rollout

**Files:**
- Modify: `docs/ARCHITECTURE.md` ("How a plan is generated" rewritten: rules, recipes, optimizer, `goals_unreachable`, compatibility; folder map adds `data/recipes/`, `_shared/recipes/`, `planner/rules/`, `planner/optimizer/`; "Known limits" updated)
- Create: `docs/ROLLOUT-plan-2.md` (same format as `docs/ROLLOUT-plan-1.md`: who, check, undo; "¿lo hago?" before every production step)

Rollout content (in order):
1. **Staging:** apply migration 015; run `supabase/tests/cooking_prefs_checks.sql`; run the Supabase security and performance advisors.
2. **Staging function:** deploy `generate-weekly-plan` with its `deno.json`; check the logs show `optimizer_result` and that `optimizer_cpu_ms` p95 stays under 900 over 20 generations (5 goal mixes × 4 profiles); check an old-web request (`{}`) gets `budget_too_low` or `goal_incoherent`, never `goals_unreachable`.
3. **Owner reviews recipes:** a sample of 12 (3 per slot, chosen across restriction profiles); each approved recipe changes to `approved`; corrections go by PR. Production waits for the owner's "listo".
4. **Production, in order:** migration 015 → Edge Function → web (version 0.1.0). Each step: what to check and how to undo (015 is additive; redeploy the previous function; redeploy the previous web).
5. **After launch:** watch `goals_unreachable` and `restrictions_too_strict` rates for a week; if a slot has few recipes for a frequent profile, add recipes.

- [ ] **Step 1:** Write both documents.
- [ ] **Step 2:** `npm run check` (unchanged) and a read-through against this plan's Global Constraints.
- [ ] **Step 3: Commit** — `docs: rules, optimizer and recipes architecture, plus ordered rollout for plan 2`

---

## Self-review notes

- **Spec coverage:** section 3 rules → T2, T3 (levels and values copied in the table), applied by T9–T10; priority order → `PENALTY` by level, level 1 and budget hard (T9); "no se entrega + Quiero el plan igual" → T10, T13, T14, T15; recipes in repo with owner review → T4, T5, rollout step 3; AI picks from the library → T11, T13; time, level, appliances, weekend-only, batch → T4, T6, T7, T10; health and blocked goals → T2 and T16 notices; household → T2 `householdFactor`, T13; versions → T14, T15; CPU and scale → Global Constraints, T8, T10. Not in this plan on purpose: the onboarding questions and health data (Plan 3, phase 4), the "Solo un supermercado" switch and user price reports (phase 5), age-based family members (needs Plan 3 ages).
- **Type consistency:** `ResolvedRecipe`, `LineChoice`, `PlannedMeal`, `Shortfall`, `RuleSet`, `GoalTargets`, `CookingPrefs`, `RecipeWeek` are defined once (T7, T7, T9, T3, T3, T2, T4, T4) and used with the same names later. `budget` appears in `RuleCode` but only the optimizer builds that constraint.
- **Proportion:** code blocks are signatures and test assertions; bodies appear only for the optimizer algorithm and the exact migration.
