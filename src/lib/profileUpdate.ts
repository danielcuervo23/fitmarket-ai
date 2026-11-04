// Relative import (not "@/lib/errors") so `node --test` can load this file.
// Keep errors.ts free of runtime "@/" imports for the same reason.
import { dbErrorKey, type ErrorKey } from "./errors.ts";

interface ProfileUpdateResult {
  data: unknown[] | null;
  error: { message: string; code?: string } | null;
}

/** Turns the result of an `update` on `profiles` into an error key, or null. */
export function profileUpdateError(result: ProfileUpdateResult): ErrorKey | null {
  const { error } = result;

  if (error) {
    // Defensive: PGRST116 only comes with `.single()`, which the callers do
    // not use today. Kept so a future `.single()` still maps correctly.
    if (error.code === "PGRST116" || error.message.toLowerCase().includes("0 rows")) {
      return "errors.profileFirst";
    }

    return dbErrorKey(error);
  }

  // Supabase answers an update that matched no row with success and no data:
  // nothing was saved because the profile does not exist yet.
  if (!result.data?.length) {
    return "errors.profileFirst";
  }

  return null;
}
