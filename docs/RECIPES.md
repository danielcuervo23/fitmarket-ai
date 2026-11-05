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
  `fat` or `fixed` (salt, garlic: never scaled). `qty > 0`, and `<= 4` for
  `unit` foods. Alternatives are distinct, differ from the line food and exist
  in `foods.json`. An `inName` line needs a `name` on every alternative.
  `optional` lines are dropped (not blocking) when the food is not allowed.
- `scale` (optional): per-role `[min, max]` with `0 < min <= 1 <= max <= 3`.
- `steps.es` and `steps.en`: same count, 1–8 items, each 1–160 chars.

House rules (checked by `scripts/recipes/coverage.test.mjs` where possible):

- At most 6 steps, one action each, short student sentences. Explain any cooking
  term in the step itself ("Saltea el pollo: en una sartén a fuego alto, revuélvelo…").
- A step must not mention an appliance the recipe does not list.
- `minutes` is active cooking time. Soaking legumes overnight or leaving oats in
  the fridge is not counted, but the first step must say so.
- A legume or iron source only counts toward the rules from 30 g in the meal, so
  recipes meant to provide one use a real portion.

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
- cheap proteins, legumes, iron sources and 400 g/day of fruit and vegetables.

Known gaps (documented in the test; they must come back as
`restrictions_too_strict` with counts per slot, never a crash):

| Profile | Kitchen | Why |
| --- | --- | --- |
| vegan | no cooking | only 2 breakfasts |
| gluten-free | no cooking | no gluten-free bread in the catalog |
| lactose + gluten + fish-free | microwave only, microwave + 10 min, no cooking | too few breakfasts and lunches |

Adding canned (cooked) legumes or gluten-free bread to the catalog would let new
quick recipes close these gaps. When a gap closes, move it from `KNOWN_GAPS` to
the must-cover list in the test.

Tests that need a fixed recipe set (for example counts in
`supabase/functions/_shared/recipes/eligibility.test.mjs`) use a frozen copy of
the 6 seed recipes, so adding recipes never breaks them.
