import { logEvent } from "./log.ts";

/**
 * The part of a Supabase client this module needs. Kept minimal so tests can
 * pass a fake and so the real (service role) client fits without casts.
 */
export interface PlanInsertClient {
  from(table: "weekly_plans"): {
    insert(row: { user_id: string; plan_json: unknown }): {
      select(columns: "id"): {
        single(): PromiseLike<{
          data: { id?: unknown } | null;
          error: { code?: string } | null;
        }>;
      };
    };
  };
}

/**
 * Saves a freshly generated plan on the server so it survives a network drop
 * after generation. `userId` must come from the verified JWT, never from the
 * request body. `client` is a service role client, or null when the key is
 * not configured.
 *
 * Never throws: on any failure it logs a code (no personal data) and returns
 * null, and the browser saves the plan itself as a fallback.
 */
export async function savePlanForUser(
  client: PlanInsertClient | null,
  userId: string,
  plan: unknown,
): Promise<string | null> {
  if (!client) {
    logEvent("plan_save_failed", { code: "no_service_key" });
    return null;
  }

  try {
    const { data, error } = await client
      .from("weekly_plans")
      .insert({ user_id: userId, plan_json: plan })
      .select("id")
      .single();

    if (error) {
      logEvent("plan_save_failed", { code: error.code || "insert_failed" });
      return null;
    }

    if (typeof data?.id !== "string" || !data.id) {
      logEvent("plan_save_failed", { code: "no_id" });
      return null;
    }

    return data.id;
  } catch {
    logEvent("plan_save_failed", { code: "exception" });
    return null;
  }
}
