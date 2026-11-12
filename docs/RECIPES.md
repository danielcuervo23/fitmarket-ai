# Recipes: maintainer guide

The planner builds menus only from the recipe library. Recipes live as one JSON
file each in `data/recipes/`, are validated at build time and compiled into
`supabase/functions/_shared/recipes/library.generated.ts`, which the Edge
Function serves from code (no query, no cache).

The owner-facing review sheet (Spanish) is `docs/recetas-para-revisar.md`.

## Add or edit a recipe

1. Create or edit `data/recipes/<id>.json`. The file name must equal `id`.
2. Use only food ids from `data/foods/foods.json`. Quantities are for **one adult
   serving**, as purchased (dry rice, dry legumes, raw meat), in the food's unit
   (`g`, `ml` or `unit`).
3. New AI-drafted recipes get `"status": "pending_owner_ok"` and `"source": "ai_draft"`.
4. Regenerate the library (never edit the generated file by hand):

   ```sh
   node scripts/recipes/build-library.ts
   ```

   It prints every error and exits 1 without writing anything if a recipe is invalid.
5. Run the tests: `npm run check` (includes the schema, sync and coverage tests)
   and `node --test supabase/functions/_shared/recipes/*.test.mjs`.

Minimal example of a line with an alternative that renames the dish:

```json
{ "food": "lentejas", "qty": 70, "role": "protein", "inName": true,
  "alternatives": [{ "food": "frijol", "qty": 70, "name": { "es": "Fríjoles con arroz", "en": "Beans with rice" } }] }
```

## Schema rules

Enforced by `scripts/recipes/recipeSchema.ts` (zod plus cross-file checks):

- `id` matches `^[a-z0-9_]{3,60}$`, equals the file name, unique.
- `name.es` / `name.en`: 1–80 chars.
- `slots`: 1–4 distinct of `desayuno`, `almuerzo`, `cena`, `snacks`.
- `minutes`: integer 1–120. `level`: `basic` | `comfortable` | `enjoys`.
- `appliances`: 0–8 distinct (`estufa`, `microondas`, `olla_arrocera`,
  `freidora_aire`, `licuadora`, `horno`, `sandwichera`, `olla_presion`).
  `[]` means no cooking and fits every kitchen.
- `batch`: `{ ok, keepsDays }`, `keepsDays` 1–4.
- `lines`: 1–10, at least one not `fixed`. `role` is `protein`, `carb`, `veg`,
  `fat`, `condiment` (cooking oil: the optimizer may use down to half, never
  more) or `fixed` (salt, garlic: never scaled). `qty > 0`, and `<= 4` for
  `unit` foods. Alternatives are distinct, differ from the line food and exist
  in `foods.json`. An `inName` line needs a `name` on every alternative.
  `optional` lines are dropped (not blocking) when the food is not allowed.
- `scale` (optional): per-role `[min, max]` with `0 < min <= 1 <= max <= 3`
  (not for `condiment`). Without one, eligibility raises the protein cap to
  2.5x when every option of every protein line is protein-dense (meat, fish,
  eggs, legumes, cheese; not milk, yogurt or peanuts), so a 100 kg muscle user
  can reach the 1.4 g/kg floor (owner decision 2026-11-12). Largest portions:
  375 g raw chicken, 8 eggs, 175 g dry legumes, 150 g cheese.
- `steps.es` and `steps.en`: same count, 1–8 items, each 1–160 chars.

House rules (checked by `scripts/recipes/coverage.test.mjs` where possible):

- At most 6 steps, one action each, short student sentences. Explain any cooking
  term in the step itself ("Saltea el pollo: en una sartén a fuego alto, revuélvelo…").
- A step must not mention an appliance the recipe does not list.
- `minutes` is active cooking time. Soaking legumes overnight or leaving oats in
  the fridge is not counted, but the first step must say so.
- A legume or iron source only counts toward the rules from 30 g in the meal, so
  recipes meant to provide one use a real portion.
- Steps must work for every alternative of a line. Use neutral words ("la fruta",
  "la grasa", "los granos") instead of the primary food's name; a test fails when
  a step names the primary food (catalog name, singular or plural) of a line with
  alternatives. A name shared with an alternative ("papa" / "papa criolla") is allowed.
- Every recipe that serves `almuerzo` or `cena` gives at least 15 g of protein at
  base portions, optional lines left out (computed from `data/foods/foods.json`).
- Raw chicken, meat, fish or egg: one short hygiene line ("Lávate las manos
  después de tocar el pollo crudo"). Explain kitchen words the first time
  ("bate: mezcla rápido con un tenedor", "pitar: sonar como un silbido").
- Salt and oil (owner decision 2026-11-12, `scripts/recipes/saltOil.test.mjs`):
  salt at most 1 g per portion as a `fixed` line (whole grams are the smallest
  amount a plan shows, so scaling it lower would be rounded back); no added salt
  when canned tuna or sardines, or 40 g or more of cheese, already season the
  dish; cooking oil at most 5 ml per portion with role `condiment`. This keeps
  "healthy" (sodium < 2000 mg, fat <= 30 %) reachable without loosening the rules.

## Legumes that soak overnight (owner decision 2026-11-11)

Dried fríjol, garbanzo and arveja seca must soak the night before, so they are
cooked **only on Saturday or Sunday**, with a reminder the evening before.
Lentejas do not soak and are not affected.

- **Data.** The food carries `"needsSoaking": true` in `data/foods/foods.json`
  (validated by `scripts/foods/foodSchema.ts`). `build-library.ts` copies the
  flagged ids into `SOAK_FOODS` in `library.generated.ts`; nothing is marked by
  hand per recipe. A canned (cooked) legume added later must not get the flag.
- **Eligibility** (`supabase/functions/_shared/recipes/eligibility.ts`). A recipe
  whose resolved lines cook a soak food is `weekendOnly`, whatever its minutes.
  A weekday-capable recipe drops its soak alternatives (for example
  `lentejas_con_arroz` keeps lentejas and loses fríjol/garbanzo); if the primary
  is not usable and a soak alternative is swapped in, the recipe becomes
  weekend-only instead. The composer already keeps weekend-only recipes off
  weekdays, batch repeats included, so leftovers are never planned for Monday.
- **Reminder.** `assemblePlan` adds the notice `soak_friday_night` (a soak food
  on Saturday) or `soak_saturday_night` (on Sunday) for recipe plans
  (`soakNotices` in `planner/build.ts`). A Sunday meal from a batch recipe
  (`batch.ok`, keeps 2+ days) that was also served on Saturday is Saturday's
  leftover, so it needs no Saturday-night reminder. The web shows them with the other
  notices (`notice.soak_*` in `src/i18n/messages/app.ts`); an older web shows
  its generic notice line and old plans are unchanged.
- **Tests.** `supabase/functions/_shared/recipes/soaking.test.mjs`,
  `supabase/functions/_shared/planner/soakNotices.test.mjs`,
  `scripts/recipes/libraryModule.test.mjs` and `src/lib/planRecipes.test.mjs`.

## Status flow

```
pending_owner_ok  ──(owner approves in docs/recetas-para-revisar.md)──>  approved
```

- Every AI-drafted recipe starts as `pending_owner_ok`.
- When the owner approves a recipe, change its `status` to `approved` (and
  `source` to `owner` if the owner rewrote it), then rebuild the library.
- Both statuses are usable in production only after the owner's go-ahead in
  rollout step 3 (see `docs/ROLLOUT-plan-2.md`).
- Changing any recipe changes `RECIPE_LIBRARY_VERSION` (hash of the sorted library).
- Current state: the owner approved all 49 recipes on 2026-11-12, so every
  recipe in `data/recipes/` is `approved` (still `source: "ai_draft"`). A new
  AI-drafted recipe starts again as `pending_owner_ok`.

## Coverage test and known gaps

`scripts/recipes/coverage.test.mjs` runs the real eligibility code
(`eligibleRecipes`, `recipeCoverage`) against the live library. It checks:

- at least 48 recipes, all `pending_owner_ok` or `approved`;
- 7 restriction profiles (none, vegetarian, vegan, lactose, gluten, fish/shellfish,
  pork) × 4 slots with the default kitchen (stove + blender, basic, 20 min):
  at least 4 weekday recipes (3 for vegan and for snacks);
- `recipeCoverage` ok (at least 3 weekday recipes per slot) for every profile with
  the default kitchen, a 10-minute weekday and a microwave-only kitchen; for
  microwave + 10 minutes (none, vegetarian, vegan, lactose, gluten); for a
  no-cooking kitchen (none, vegetarian); and for lactose + gluten + fish at 10 minutes;
- at least 12 batch-friendly lunch/dinner recipes; a 30–60 minute weekend recipe
  in every slot; at least 70 % basic, ≤ 20 min, estufa/licuadora only;
- cheap proteins, legumes, iron sources and 400 g/day of fruit and vegetables;
- steps never name a swappable primary food; lunch and dinner give >= 15 g protein.

Known gaps (pinned in the test's `KNOWN_GAPS`: each must still fail coverage
and come back as `restrictions_too_strict` with counts per slot, never a crash):

| Profile | Kitchen | Why |
| --- | --- | --- |
| vegan | no cooking | only 2 breakfasts |
| gluten-free | no cooking | no gluten-free bread in the catalog |
| lactose + gluten + fish-free | microwave only, microwave + 10 min, no cooking | too few breakfasts and lunches |

Adding canned (cooked) legumes or gluten-free bread to the catalog would let new
quick recipes close these gaps. When a recipe closes a gap, its `KNOWN_GAPS`
test fails on purpose: move the case to `MUST_COVER` and update this table.

Tests that need a fixed recipe set (for example counts in
`supabase/functions/_shared/recipes/eligibility.test.mjs`) use a frozen copy of
the 6 seed recipes, so adding recipes never breaks them.
