import type { ModelCall, ModelResponse } from "../openai.ts";

/**
 * Hard caps for one plan generation, so its OpenAI cost and duration have a
 * known maximum whatever the model answers.
 *
 * The deadline is only enforced if the wrapped caller honours
 * `ModelRequest.timeoutMs` (createOpenAICaller does): the budget can stop new
 * calls from starting, but not cut one that ignores its timeout.
 */
export interface GenerationLimits {
  /** Most model calls one generation may make (retries, day fills, naming). */
  maxModelCalls: number;
  /** Epoch ms after which no new model call starts. */
  deadline: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

/** What one generation used, so the caller can log it and decide refunds. */
export interface GenerationUsage {
  /** Calls actually sent to the model. */
  modelCalls: number;
  /**
   * Calls OpenAI may have charged for: any answer that came back (even empty
   * or a refusal) and any call aborted by our timeout, because aborting does
   * not stop the generation on OpenAI's side.
   */
  billableCalls: number;
  /** Calls refused because a cap was reached. */
  refusedCalls: number;
}

export const DEFAULT_MAX_MODEL_CALLS = 12;
/**
 * Below the Edge Function wall-clock limit (150 s on the free plan) with room
 * for auth, database reads and the response.
 */
export const DEFAULT_TIME_BUDGET_MS = 120_000;
/** Upper bounds for the settings, so a typo cannot pass the platform limit. */
export const MAX_MODEL_CALLS_CEILING = 40;
export const MAX_TIME_BUDGET_MS = 140_000;
/** A small call (one day, meal names) with less time left would time out. */
export const MIN_CALL_TIME_MS = 10_000;
/** A full 7-day composition takes 30-60 s; do not start one with less. */
export const MIN_COMPOSE_TIME_MS = 30_000;

function refused(detail: "call_limit" | "time_budget"): ModelResponse {
  return {
    content: null,
    error: "La generación tardó demasiado. Intenta de nuevo.",
    errorCode: "ai_timeout",
    detail,
  };
}

/** True when OpenAI may have charged for this call. */
function mayBeBilled(response: ModelResponse): boolean {
  return (
    Boolean(response.content) ||
    response.errorCode === "ai_empty" ||
    response.errorCode === "ai_timeout"
  );
}

export interface CallBudget {
  callModel: ModelCall;
  usage: GenerationUsage;
  /** True when `calls` more calls fit and each has at least `minMs` left. */
  canStart: (calls?: number, minMs?: number) => boolean;
}

/**
 * Wraps a model caller with the limits. Calls are counted when they start
 * (synchronously), so parallel calls cannot overshoot the cap. Each call gets
 * at most the time left until the deadline.
 */
export function withCallBudget(
  callModel: ModelCall,
  limits: GenerationLimits,
): CallBudget {
  const now = limits.now ?? Date.now;
  const usage: GenerationUsage = {
    modelCalls: 0,
    billableCalls: 0,
    refusedCalls: 0,
  };

  const timeLeft = () => limits.deadline - now();
  const canStart = (calls = 1, minMs = MIN_CALL_TIME_MS) =>
    limits.maxModelCalls - usage.modelCalls >= calls && timeLeft() >= minMs;

  const budgeted: ModelCall = async (request) => {
    if (usage.modelCalls >= limits.maxModelCalls) {
      usage.refusedCalls += 1;
      return refused("call_limit");
    }

    const remaining = timeLeft();

    if (remaining < MIN_CALL_TIME_MS) {
      usage.refusedCalls += 1;
      return refused("time_budget");
    }

    usage.modelCalls += 1;

    const response = await callModel({
      ...request,
      timeoutMs: Math.min(request.timeoutMs ?? remaining, remaining),
    });

    if (mayBeBilled(response)) {
      usage.billableCalls += 1;
    }

    return response;
  };

  return { callModel: budgeted, usage, canStart };
}
