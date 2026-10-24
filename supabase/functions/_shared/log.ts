/**
 * Structured logging that never includes personal or health data
 * (age, weight, height, restrictions, budget, user ids). Only event names and
 * non-identifying codes belong here.
 */
export function logEvent(
  event: string,
  fields: Record<string, string | number | boolean> = {},
): void {
  console.log(JSON.stringify({ event, ...fields }));
}
