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

/** A class-like error name ("TypeError", "FunctionsHttpError"), nothing else. */
const SAFE_ERROR_NAME = /^[A-Za-z]{1,64}$/;

/**
 * Logs a crash caught by a function's last-resort `catch`. Only the error
 * type is kept: the message can contain personal or health data, and so can
 * a custom `name`, which is why only plain class-like names pass.
 */
export function logUnexpected(fn: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "";

  logEvent("unexpected_error", {
    fn,
    name: SAFE_ERROR_NAME.test(name) ? name : "unknown",
  });
}
