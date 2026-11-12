import type { Catalog } from "../catalog.ts";
import type { GenerationErrorCode } from "../errors.ts";
import { logEvent } from "../log.ts";
import type { ResolvedRecipe } from "../recipes/eligibility.ts";
import type { CookingPrefs, RecipeWeek } from "../recipes/types.ts";
import type { CallBudget } from "./callBudget.ts";
import {
  buildRecipeComposerPrompt,
  parseRecipeComposition,
  RECIPE_COMPOSER_SYSTEM_PROMPT,
  recipeResponseFormat,
  type RecipeComposeIssue,
} from "./compose.ts";
import type { PriceBook } from "./priceBook.ts";
import type { GoalTargets } from "./rules/targets.ts";
import { DAYS, SLOTS, type Slot } from "./types.ts";

/**
 * "Choose the recipes of the week" behind one small interface, so the AI
 * picker used today can be replaced by a deterministic algorithm without
 * touching the pipeline (generate.ts). A picker only chooses recipe ids:
 * portions, swaps and prices are decided afterwards by the optimizer.
 */
export interface RecipePickContext {
  /** Eligible recipes by id: the only ids a picker may return. */
  eligible: ReadonlyMap<string, ResolvedRecipe>;
  targets: GoalTargets;
  goals: string[];
  /** Weekly budget for ONE person, COP. */
  budgetPerPersonCop: number;
  cooking: CookingPrefs;
  catalog: Catalog;
  prices: PriceBook;
  stores: string[];
  /** Free-text foods to avoid that are not in the catalog (user text). */
  unmatchedText: string[];
  /** What to fix from the previous attempt (code-made text). */
  feedback?: string;
}

export type RecipePick =
  /** A complete week; every id is eligible for its slot. */
  | { kind: "week"; week: RecipeWeek }
  /** The answer was unusable; another attempt with `feedback` may work. */
  | { kind: "rejected"; reason: string; feedback: string }
  /** The picker could not answer (service down, no key). `final`: retrying cannot help. */
  | { kind: "unavailable"; code: GenerationErrorCode; message: string; reason: string; final: boolean };

export interface RecipePicker {
  pick(context: RecipePickContext): Promise<RecipePick>;
}

// ---------------------------------------------------------------- AI picker

const SAFE_ID = /[^a-z0-9_]/g;
const MAX_ID_LENGTH = 60;

/** AI text reduced to id characters, so it can go back into a prompt or a reason. */
const safeId = (id: string): string => id.toLowerCase().replace(SAFE_ID, "").slice(0, MAX_ID_LENGTH) || "?";

function issueReason(issue: RecipeComposeIssue): string {
  switch (issue.code) {
    case "unknown_recipe":
      return `unknown_recipe:${safeId(issue.id)}`;
    case "missing_meal":
      return `missing_meal:${issue.day}.${issue.slot}`;
    default:
      return issue.code;
  }
}

function issueFeedback(issue: RecipeComposeIssue): string {
  switch (issue.code) {
    case "invalid_format":
      return "The answer did not follow the JSON schema.";
    case "wrong_days":
      return "Return all 7 days: lun, mar, mie, jue, vie, sab, dom, one entry each.";
    case "unknown_recipe":
      return `"${safeId(issue.id)}" is not a recipe id for that meal. Use only the ids listed for each meal.`;
    case "missing_meal":
      return `Day ${issue.day} has no ${issue.slot}. Every day needs desayuno, almuerzo, cena and snacks.`;
  }
}

function slotIdsOf(eligible: ReadonlyMap<string, ResolvedRecipe>): Record<Slot, string[]> {
  const ids = Object.fromEntries(SLOTS.map((slot) => [slot, [] as string[]])) as Record<Slot, string[]>;
  for (const recipe of eligible.values()) for (const slot of recipe.slots) ids[slot].push(recipe.id);
  return ids;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The AI often stops after one or two days (strict mode cannot force the list
 * length). Each missing day is asked for on its own, in parallel, at most two
 * rounds, and only when every missing day fits in the call budget.
 */
async function fillMissingDays(
  raw: unknown,
  model: Pick<CallBudget, "callModel" | "canStart">,
  eligible: ReadonlyMap<string, ResolvedRecipe>,
  request: (onlyDays: string[], planned: string[]) => { user: string; responseFormat: unknown },
): Promise<unknown> {
  if (!isRecord(raw) || !Array.isArray(raw.days)) return raw;

  const present = new Map<string, Record<string, unknown>>();
  for (const entry of raw.days) {
    if (isRecord(entry) && typeof entry.day === "string" && (DAYS as readonly string[]).includes(entry.day)) {
      present.set(entry.day, entry);
    }
  }
  if (present.size === 0) return raw;

  const describe = () =>
    [...present].map(([day, entry]) => {
      const names = SLOTS.map((slot) => {
        const id = entry[slot];
        return typeof id === "string" ? eligible.get(id)?.name.es : undefined;
      }).filter(Boolean);
      return `${day}: ${names.join("; ")}`;
    });

  for (let round = 0; round < 2; round += 1) {
    const missing = DAYS.filter((day) => !present.has(day));
    if (missing.length === 0 || !model.canStart(missing.length)) break;

    const planned = describe();
    const answers = await Promise.all(
      missing.map((day) => model.callModel({ system: RECIPE_COMPOSER_SYSTEM_PROMPT, ...request([day], planned) })),
    );

    answers.forEach((response, index) => {
      const day = missing[index];
      try {
        const entries = (JSON.parse(response.content ?? "") as { days?: unknown }).days;
        if (!Array.isArray(entries)) return;
        // The model may label the day wrongly when it was asked for just one.
        const entry = entries.find((item) => isRecord(item) && item.day === day) ?? (entries.length === 1 ? entries[0] : null);
        if (isRecord(entry)) present.set(day, { ...entry, day });
      } catch {
        // This day stays missing; parsing reports it and the next attempt takes over.
      }
    });
  }

  logEvent("plan_days_completed", { days: present.size });
  return { days: DAYS.filter((day) => present.has(day)).map((day) => present.get(day)) };
}

/**
 * The AI chooses one eligible recipe id per day and meal (strict JSON schema
 * with the ids as enums). Every call goes through the request's call budget.
 */
export function createAiRecipePicker(model: Pick<CallBudget, "callModel" | "canStart">): RecipePicker {
  return {
    async pick(context) {
      let responseFormat: unknown;
      try {
        responseFormat = recipeResponseFormat(slotIdsOf(context.eligible));
      } catch {
        // Coverage is checked before picking; only a library past OpenAI's enum limits gets here.
        return { kind: "unavailable", code: "generation_failed", message: "No pudimos generar tu plan.", reason: "schema_limits", final: true };
      }

      const promptInput = {
        targets: context.targets,
        budgetPerPersonCop: context.budgetPerPersonCop,
        goals: context.goals,
        recipes: [...context.eligible.values()],
        cooking: context.cooking,
        catalog: context.catalog,
        prices: context.prices,
        stores: context.stores,
        unmatchedText: context.unmatchedText,
      };

      const response = await model.callModel({
        system: RECIPE_COMPOSER_SYSTEM_PROMPT,
        user: buildRecipeComposerPrompt({ ...promptInput, feedback: context.feedback }),
        responseFormat,
      });

      if (response.error || !response.content) {
        const code = response.errorCode ?? "ai_unavailable";
        return {
          kind: "unavailable",
          code,
          message: response.error ?? "No pudimos generar tu plan.",
          reason: [code, response.detail].filter(Boolean).join(":"),
          final: code === "server_config",
        };
      }

      let raw: unknown;
      try {
        raw = JSON.parse(response.content);
      } catch {
        return {
          kind: "rejected",
          reason: response.detail ? `not_json:${response.detail}` : "not_json",
          feedback: "The answer was cut off or not valid JSON. Answer with the recipe ids only.",
        };
      }

      raw = await fillMissingDays(raw, model, context.eligible, (onlyDays, planned) => ({
        user: buildRecipeComposerPrompt({ ...promptInput, onlyDays, planned }),
        responseFormat,
      }));

      const { week, issue } = parseRecipeComposition(raw, context.eligible, context.cooking);
      if (!week || issue) {
        const problem: RecipeComposeIssue = issue ?? { code: "invalid_format" };
        return { kind: "rejected", reason: issueReason(problem), feedback: issueFeedback(problem) };
      }
      return { kind: "week", week };
    },
  };
}
