import type { GenerationErrorCode } from "./errors.ts";
import type { GenerationRequestBody } from "./generationRequest.ts";
import { supportsGoalsUnreachable } from "./generationRequest.ts";
import type { GenerateFailure } from "./planner/generate.ts";
import type { Shortfall } from "./planner/rules/ruleSet.ts";

/**
 * A generation failure as the pipeline reports it. Written as a superset of
 * `GenerateFailure["error"]` so it already accepts the `goals_unreachable`
 * fields that Task 13 adds (conflicts, canForce) and keeps compiling after.
 */
export type GenerationFailure = Omit<GenerateFailure["error"], "code"> & {
  code: GenerationErrorCode | "goals_unreachable";
  conflicts?: readonly Shortfall[];
  canForce?: boolean;
};

export interface FailureResponse {
  status: number;
  payload: Record<string, unknown>;
}

/**
 * Turns a failure into the HTTP answer, keeping old clients working: a web
 * older than MIN_VERSION_GOALS_UNREACHABLE (or one that sends no version)
 * never receives `goals_unreachable`; it gets `budget_too_low` when a budget
 * increase fixes it, else `goal_incoherent`, both codes it already knows.
 */
export function failureResponse(
  failure: GenerationFailure,
  body: GenerationRequestBody,
): FailureResponse {
  const { code, message, budget, diagnostics } = failure;

  if (code === "goals_unreachable") {
    if (supportsGoalsUnreachable(body.appVersion)) {
      return {
        status: 200,
        payload: {
          error: message,
          code,
          conflicts: failure.conflicts ?? [],
          canForce: true,
          ...(budget ? { budgetOption: budget } : {}),
        },
      };
    }
    if (budget) {
      return budgetTooLow(budget);
    }
    return { status: 422, payload: { error: message, code: "goal_incoherent" } };
  }

  if (code === "budget_too_low" && budget) {
    return budgetTooLow(budget);
  }

  const status =
    code === "server_config" ? 503 : code === "rate_limited" ? 429 : 422;

  return { status, payload: { error: message, code, diagnostics } };
}

// 200 so supabase.functions.invoke delivers the body in `data`.
function budgetTooLow(budget: NonNullable<GenerationFailure["budget"]>): FailureResponse {
  return {
    status: 200,
    payload: { error: "budget_too_low", code: "budget_too_low", ...budget },
  };
}
