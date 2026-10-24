import type { MessageKey } from "@/i18n/messages";

/**
 * Library functions never return user-facing text. They return a MessageKey,
 * and the screen shows `t(key)` in the user's language.
 */
export type ErrorKey = MessageKey;

interface DbErrorLike {
  message: string;
  code?: string;
}

/**
 * Maps a Supabase/Postgres error to a translatable message. `fallback` is
 * the feature-specific message used when nothing more precise applies.
 */
export function dbErrorKey(
  error: DbErrorLike,
  fallback: ErrorKey = "errors.save",
): ErrorKey {
  const message = error.message.toLowerCase();
  const code = error.code ?? "";

  if (code === "42501" || message.includes("row-level security")) {
    return "errors.permission";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "errors.network";
  }

  if (code === "23514" || message.includes("check constraint")) {
    return "errors.invalidValues";
  }

  if (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  ) {
    return "errors.dbNotConfigured";
  }

  if (code === "23503" || message.includes("foreign key")) {
    return "errors.sessionNotReady";
  }

  return fallback;
}
