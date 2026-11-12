import type { GenerationErrorCode, PipelineErrorCode } from "./errors.ts";
import type { GenerationUsage } from "./planner/callBudget.ts";

/**
 * Failures that are ours (outage, missing config) and cost nothing at OpenAI.
 * Only these give the user their daily try back. Quality or format failures
 * (goal_incoherent, invalid_format, ...) are not refunded: OpenAI already
 * billed those answers, and refunding them let one user retry without limit.
 */
const REFUNDABLE_CODES: ReadonlySet<GenerationErrorCode> = new Set([
  "server_config",
  "ai_unavailable",
  "ai_timeout",
  "rate_limited",
]);

/**
 * True when a failed generation must not use up a daily try. `refundable`
 * marks our own failures the pipeline knows happened before any OpenAI call
 * (e.g. the solver did not load); it never refunds a call that may be billed.
 */
export function shouldRefund(
  code: PipelineErrorCode,
  usage: GenerationUsage | undefined,
  refundable = false,
): boolean {
  if (code === "goals_unreachable" || !(refundable || REFUNDABLE_CODES.has(code))) {
    return false;
  }

  // If any call may have been charged (an answer, an empty answer or a call
  // we aborted), the try counts.
  return (usage?.billableCalls ?? 0) === 0;
}

/**
 * Reads a positive integer setting, falling back when it is missing or
 * invalid, and never above `max`.
 */
export function positiveIntOr(
  value: string | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, max)
    : fallback;
}
