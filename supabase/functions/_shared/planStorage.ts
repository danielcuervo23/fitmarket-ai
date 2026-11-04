import { logEvent } from "./log.ts";

/**
 * Longest wait for the plan insert. It must fit in the margin the generation
 * budget leaves before the Edge Function limit (see planner/callBudget.ts).
 */
export const PLAN_SAVE_TIMEOUT_MS = 5_000;

/**
 * The part of a Supabase client this module needs. Kept minimal so tests can
 * pass a fake and so the real (service role) client fits without casts.
 */
export interface PlanInsertClient {
  from(table: "weekly_plans"): {
    insert(row: { user_id: string; plan_json: unknown }): {
      select(columns: "id"): {
        abortSignal(signal: AbortSignal): {
          single(): PromiseLike<{
            data: { id?: unknown } | null;
            error: { code?: string } | null;
          }>;
        };
      };
    };
  };
}

/**
 * Saves a freshly generated plan on the server so it survives a network drop
 * after generation. `userId` must come from the verified JWT, never from the
 * request body. `client` is a service role client, or null when the key is
 * not configured. The insert gives up after `timeoutMs`.
 *
 * Never throws: on any failure it logs a code (no personal data) and returns
 * null, and the browser saves the plan itself as a fallback.
 */
export async function savePlanForUser(
  client: PlanInsertClient | null,
  userId: string,
  plan: unknown,
  timeoutMs = PLAN_SAVE_TIMEOUT_MS,
): Promise<string | null> {
  if (!client) {
    logEvent("plan_save_failed", { code: "no_service_key" });
    return null;
  }

  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const { data, error } = await client
      .from("weekly_plans")
      .insert({ user_id: userId, plan_json: plan })
      .select("id")
      .abortSignal(signal)
      .single();

    if (error) {
      logEvent("plan_save_failed", {
        code: signal.aborted ? "timeout" : error.code || "insert_failed",
      });
      return null;
    }

    if (typeof data?.id !== "string" || !data.id) {
      logEvent("plan_save_failed", { code: "no_id" });
      return null;
    }

    return data.id;
  } catch {
    logEvent("plan_save_failed", {
      code: signal.aborted ? "timeout" : "exception",
    });
    return null;
  }
}

export interface GeneratedPlanDeps<T> {
  /** The shared schema check (`parseWeeklyPlanJson`). */
  parse: (raw: unknown) => { data: T | null; error: string | null };
  client: PlanInsertClient | null;
  /** From the verified JWT. */
  userId: string;
}

export type GeneratedPlanResponse<T> =
  | { status: 200; body: { plan: T; planId?: string } }
  | { status: 422; body: { error: string; code: "invalid_format" } };

/**
 * Validates a generated plan with the shared schema and, only if it passes,
 * saves it. An invalid plan is never stored (it would become the latest plan
 * and hide the user's previous valid one); the answer is the same
 * `invalid_format` the browser gave when it validated before saving. A valid
 * plan is returned as parsed, with `planId` when the save worked.
 */
export async function respondWithGeneratedPlan<T>(
  plan: unknown,
  { parse, client, userId }: GeneratedPlanDeps<T>,
): Promise<GeneratedPlanResponse<T>> {
  const { data } = parse(plan);

  if (!data) {
    logEvent("plan_schema_rejected", { code: "invalid_format" });
    return {
      status: 422,
      body: {
        error: "El plan generado no tiene un formato válido.",
        code: "invalid_format",
      },
    };
  }

  const planId = await savePlanForUser(client, userId, data);

  return { status: 200, body: planId ? { plan: data, planId } : { plan: data } };
}
