// No runtime "@/" imports here so `node --test` can load this file.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads the id of the plan the server already saved from the
 * generate-weekly-plan response. Returns null when there is none (older
 * server, or the server could not save) or when it is not a UUID string;
 * null means the browser must save the plan itself.
 */
export function readPlanId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const planId = (body as { planId?: unknown }).planId;

  return typeof planId === "string" && UUID.test(planId) ? planId : null;
}
