import type { GenerationErrorCode } from "../errors.ts";
import { logEvent } from "../log.ts";
import { calcTargets, type BodyProfile } from "../nutrition.ts";
import type { ModelCall } from "../openai.ts";
import {
  assemblePlan,
  checkQuality,
  feedbackFor,
  fitToBudget,
  normalizeWeek,
  type BuiltPlan,
} from "./build.ts";
import {
  buildComposerUserPrompt,
  COMPOSER_SYSTEM_PROMPT,
  composerResponseFormat,
  parseComposition,
  type ComposeIssue,
} from "./compose.ts";
import { allowedCatalog, buildRestrictionRules } from "./restrictions.ts";

export interface GenerateInput {
  weeklyBudgetCop: number;
  goals: string[];
  stores: string[];
  restrictions: string[];
  householdSize: number;
  profile: BodyProfile;
}

export interface GenerateFailure {
  error: {
    code: GenerationErrorCode;
    message: string;
    budget?: {
      currentBudget: number;
      requiredBudget: number;
      recommendedIncrease: number;
    };
  };
}

export type GenerateOutcome = { plan: BuiltPlan } | GenerateFailure;

const MAX_ATTEMPTS = 2;
/** A catalog this small cannot make a varied week. */
const MIN_ALLOWED_INGREDIENTS = 20;

function issueFeedback(issue: ComposeIssue): string {
  switch (issue.code) {
    case "invalid_format":
      return "The answer did not follow the JSON schema.";
    case "wrong_days":
      return "Return exactly 7 days: lun, mar, mie, jue, vie, sab, dom, each once.";
    case "item_count":
      return `Day ${issue.day}, meal ${issue.slot} has the wrong number of ingredients (2-5, snacks 1-3).`;
    case "unknown_ingredient":
      return `"${issue.id}" is not an allowed ingredient id. Use only the ids listed.`;
    case "bad_quantity":
      return `Ingredient "${issue.id}" has an invalid quantity. Quantities must be positive numbers.`;
  }
}

/**
 * Generates a weekly plan. The model is injected so the whole pipeline can be
 * tested without calling OpenAI.
 */
export async function generatePlan(
  input: GenerateInput,
  callModel: ModelCall,
): Promise<GenerateOutcome> {
  const rules = buildRestrictionRules(input.restrictions);
  const allowed = allowedCatalog(rules);

  if (allowed.length < MIN_ALLOWED_INGREDIENTS) {
    return {
      error: {
        code: "generation_failed",
        message:
          "Tus restricciones dejan muy pocos ingredientes disponibles para armar un plan.",
      },
    };
  }

  const allowedIds = new Set(allowed.map((ingredient) => ingredient.id));
  const targets = calcTargets(input.profile, input.goals);
  const budgetPerPerson = Math.round(
    input.weeklyBudgetCop / input.householdSize,
  );

  let feedback: string | undefined;
  let lastError: GenerateFailure = {
    error: {
      code: "generation_failed",
      message:
        "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.",
    },
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await callModel({
      system: COMPOSER_SYSTEM_PROMPT,
      user: buildComposerUserPrompt({
        targets,
        budgetPerPersonCop: budgetPerPerson,
        goals: input.goals,
        allowed,
        unmatchedText: rules.unmatchedText,
        feedback,
      }),
      responseFormat: composerResponseFormat([...allowedIds]),
    });

    if (response.error || !response.content) {
      lastError = {
        error: {
          code: response.errorCode ?? "ai_unavailable",
          message: response.error ?? "No pudimos generar tu plan.",
        },
      };

      // Configuration problems will not fix themselves on a retry.
      if (response.errorCode === "server_config") {
        return lastError;
      }

      continue;
    }

    let raw: unknown;

    try {
      raw = JSON.parse(response.content);
    } catch {
      feedback = "The answer was not valid JSON.";
      continue;
    }

    const { week, issue } = parseComposition(raw, allowedIds);

    if (!week || issue) {
      feedback = issue ? issueFeedback(issue) : undefined;
      logEvent("plan_attempt_rejected", {
        attempt,
        code: issue?.code ?? "unknown",
      });
      lastError = {
        error: {
          code: "invalid_format",
          message: "El plan generado no tiene un formato válido.",
        },
      };
      continue;
    }

    const normalized = normalizeWeek(week, targets.kcal);
    const quality = checkQuality(normalized, targets);
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;

    // A low-variety week is still a usable plan on the last try; a plan far
    // below the protein target is not.
    if (quality && !(isLastAttempt && quality.code === "low_variety")) {
      feedback = feedbackFor(quality);
      logEvent("plan_attempt_rejected", { attempt, code: quality.code });
      lastError = {
        error: {
          code: "goal_incoherent",
          message: "El plan no cumplía tus objetivos nutricionales.",
        },
      };
      continue;
    }

    const fitted = fitToBudget(normalized, {
      budgetCop: input.weeklyBudgetCop,
      householdSize: input.householdSize,
      targetKcal: targets.kcal,
      allowedIds,
    });

    if (fitted.cost > input.weeklyBudgetCop) {
      logEvent("plan_over_budget", { swaps: fitted.swaps });

      return {
        error: {
          code: "budget_too_low",
          message: "La lista de mercado supera tu presupuesto semanal.",
          budget: {
            currentBudget: input.weeklyBudgetCop,
            requiredBudget: fitted.cost,
            recommendedIncrease: fitted.cost - input.weeklyBudgetCop,
          },
        },
      };
    }

    logEvent("plan_generated", { attempt, swaps: fitted.swaps });

    return {
      plan: assemblePlan(fitted.week, {
        householdSize: input.householdSize,
        stores: input.stores,
        targets,
      }),
    };
  }

  return lastError;
}
