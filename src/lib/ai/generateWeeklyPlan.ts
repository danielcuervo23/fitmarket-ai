import { FunctionsHttpError } from "@supabase/supabase-js";
import type { GenerationErrorCode } from "@shared/errors.ts";
import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import type { ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export interface BudgetTooLowGenerationError {
  kind: "budget_too_low";
  currentBudget: number;
  requiredBudget: number;
  recommendedIncrease: number;
}

export interface MessageGenerationError {
  kind: "message";
  /** Translation key; show it with t(). */
  messageKey: ErrorKey;
  /** Server error code when there is one; lets the screen offer a fix. */
  code?: GenerationErrorCode;
  /** What the server learned, to tell the user what to change. */
  diagnostics?: GenerationDiagnostics;
}

export interface GenerationDiagnostics {
  availableFoods: number;
  totalFoods: number;
  /** One code per failed attempt, e.g. "item_count" or "low_protein". */
  reasons: string[];
}

export type GenerateWeeklyPlanError =
  | BudgetTooLowGenerationError
  | MessageGenerationError;

interface GenerateWeeklyPlanResponse {
  plan?: unknown;
  error?: string;
  code?: GenerationErrorCode;
  diagnostics?: unknown;
  currentBudget?: number;
  requiredBudget?: number;
  recommendedIncrease?: number;
}

/** Edge Function error code -> translation key. */
const CODE_TO_MESSAGE: Record<GenerationErrorCode, ErrorKey> = {
  method_not_allowed: "errors.generic",
  unauthorized: "errors.notSignedIn",
  server_config: "gen.error.serverConfig",
  permission_denied: "errors.permission",
  network: "errors.network",
  load_failed: "gen.error.loadFailed",
  profile_incomplete: "gen.error.profileIncomplete",
  budget_missing: "gen.error.budgetMissing",
  goals_missing: "gen.error.goalsMissing",
  stores_missing: "gen.error.storesMissing",
  restrictions_too_strict: "gen.error.restrictionsTooStrict",
  quota_exceeded: "gen.error.quotaExceeded",
  rate_limited: "gen.error.rateLimited",
  ai_unavailable: "gen.error.aiUnavailable",
  ai_timeout: "gen.error.aiTimeout",
  ai_empty: "gen.error.aiUnavailable",
  invalid_format: "gen.error.invalidFormat",
  invalid_store: "gen.error.invalidStore",
  dietary_violation: "gen.error.dietaryViolation",
  portions_invalid: "gen.error.portionsInvalid",
  goal_incoherent: "gen.error.goalIncoherent",
  budget_too_low: "gen.error.budgetTooLow",
  generation_failed: "gen.error.failed",
  unexpected: "errors.generic",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads the JSON body whether the call succeeded or failed with an HTTP error. */
async function readResponseBody(
  payload: unknown,
  invokeError: unknown,
): Promise<GenerateWeeklyPlanResponse | null> {
  if (isRecord(payload)) {
    return payload as GenerateWeeklyPlanResponse;
  }

  if (invokeError instanceof FunctionsHttpError) {
    try {
      const body: unknown = await invokeError.context.json();
      return isRecord(body) ? (body as GenerateWeeklyPlanResponse) : null;
    } catch {
      return null;
    }
  }

  return null;
}

function readDiagnostics(value: unknown): GenerationDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const availableFoods = readNumber(value.availableFoods);
  const totalFoods = readNumber(value.totalFoods);

  if (availableFoods === null || totalFoods === null) {
    return undefined;
  }

  return {
    availableFoods,
    totalFoods,
    reasons: Array.isArray(value.reasons)
      ? value.reasons.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function toGenerationError(
  body: GenerateWeeklyPlanResponse | null,
): GenerateWeeklyPlanError | null {
  if (!body) {
    return null;
  }

  if (body.error === "budget_too_low" || body.code === "budget_too_low") {
    const currentBudget = readNumber(body.currentBudget);
    const requiredBudget = readNumber(body.requiredBudget);
    const recommendedIncrease = readNumber(body.recommendedIncrease);

    if (
      currentBudget !== null &&
      requiredBudget !== null &&
      recommendedIncrease !== null
    ) {
      return {
        kind: "budget_too_low",
        currentBudget,
        requiredBudget,
        recommendedIncrease,
      };
    }

    return { kind: "message", messageKey: "gen.error.budgetTooLow" };
  }

  if (body.code) {
    return {
      kind: "message",
      messageKey: CODE_TO_MESSAGE[body.code] ?? "errors.generic",
      code: body.code,
      diagnostics: readDiagnostics(body.diagnostics),
    };
  }

  if (typeof body.error === "string" && body.error.trim()) {
    return { kind: "message", messageKey: "errors.generic" };
  }

  return null;
}

function invokeFailureKey(error: unknown): ErrorKey {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("network") || message.includes("fetch")) {
    return "errors.network";
  }

  return "gen.error.aiUnavailable";
}

export async function generateWeeklyPlan(): Promise<{
  data: WeeklyPlan | null;
  error: GenerateWeeklyPlanError | null;
}> {
  const { data: payload, error: invokeError } =
    await supabase.functions.invoke<GenerateWeeklyPlanResponse>(
      "generate-weekly-plan",
      { body: {} },
    );

  const body = await readResponseBody(payload, invokeError);
  const knownError = toGenerationError(body);

  if (knownError) {
    return { data: null, error: knownError };
  }

  if (invokeError) {
    console.error("[FitMarket] generate-weekly-plan invoke:", invokeError);

    return {
      data: null,
      error: { kind: "message", messageKey: invokeFailureKey(invokeError) },
    };
  }

  if (!body?.plan) {
    return {
      data: null,
      error: { kind: "message", messageKey: "gen.error.failed" },
    };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(body.plan);

  if (parseError || !plan) {
    return {
      data: null,
      error: { kind: "message", messageKey: "gen.error.invalidFormat" },
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}
