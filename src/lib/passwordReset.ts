// Relative imports (not "@/...") so `node --test` can load this file.
import type { ErrorKey } from "@/lib/errors";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "./authRules.ts";

export { MIN_PASSWORD_LENGTH };

/** Validates the address typed on the "Forgot your password?" screen. */
export function validateResetEmail(email: string): ErrorKey | null {
  const trimmed = email.trim();

  if (!trimmed) return "auth.error.emailRequired";
  if (!isValidEmail(trimmed)) return "auth.error.emailInvalid";

  return null;
}

/**
 * The URL written into the reset e-mail. `configuredBase` is
 * VITE_AUTH_REDIRECT_URL (so the native app can use its own link later);
 * without it, or if it is malformed, the current site is used.
 */
function canParseUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function buildPasswordResetRedirect(
  path: string,
  configuredBase: string | undefined,
  origin: string,
): string {
  const base = configuredBase?.trim() || origin;
  const usableBase = canParseUrl(base) ? base : origin;

  return `${usableBase.replace(/\/+$/, "")}${path}`;
}

/** The parts of a Supabase AuthError this module reads. */
export interface AuthErrorLike {
  message: string;
  status?: number;
  code?: string;
  name?: string;
}

function isRateLimited(error: AuthErrorLike): boolean {
  const message = error.message.toLowerCase();
  return (
    error.status === 429 ||
    (error.code ?? "").startsWith("over_") ||
    message.includes("rate limit") ||
    message.includes("security purposes")
  );
}

function isNetworkFailure(error: AuthErrorLike): boolean {
  const message = error.message.toLowerCase();
  return (
    error.name === "AuthRetryableFetchError" ||
    message.includes("fetch") ||
    message.includes("network")
  );
}

/**
 * Result of asking for a reset e-mail. `null` means "show the neutral
 * 'if an account exists, we sent a link' message".
 *
 * Only problems that do not depend on the address are shown: no connection,
 * and the per-IP request limit (`over_request_rate_limit`). The e-mail send
 * limits (once every 60 s per user, the hourly e-mail quota) only apply when
 * Supabase actually sends a message, i.e. when the account exists, so they —
 * and any 429 we cannot identify — get the neutral message instead.
 */
export function resetRequestErrorKey(
  error: AuthErrorLike | null,
): ErrorKey | null {
  if (!error) return null;
  if (error.code === "over_request_rate_limit") return "auth.error.rateLimit";
  if (isRateLimited(error)) return null;
  if (isNetworkFailure(error)) return "errors.network";
  return null;
}

/** Validates the new password and its confirmation. */
export function validateNewPassword(
  password: string,
  confirmation: string,
): ErrorKey | null {
  if (!password) return "auth.error.passwordRequired";
  if (password.length < MIN_PASSWORD_LENGTH) return "auth.error.passwordTooShort";
  if (password !== confirmation) return "auth.error.passwordMismatch";
  return null;
}

const EXPIRED_SESSION_CODES = new Set([
  "session_not_found",
  "session_expired",
  "reauthentication_needed",
  "bad_jwt",
]);

/** What to tell the user when `updateUser({ password })` fails. */
export function updatePasswordErrorKey(error: AuthErrorLike): ErrorKey {
  const code = error.code ?? "";

  if (code === "same_password") return "auth.error.samePassword";
  if (code === "weak_password") return "auth.error.passwordWeak";
  if (
    EXPIRED_SESSION_CODES.has(code) ||
    error.name === "AuthSessionMissingError"
  ) {
    return "auth.error.resetLinkInvalid";
  }
  if (isRateLimited(error)) return "auth.error.rateLimit";
  if (isNetworkFailure(error)) return "errors.network";

  return "auth.error.passwordUpdateFailed";
}

function params(fragment: string): URLSearchParams {
  return new URLSearchParams(fragment.replace(/^[#?]/, ""));
}

/**
 * True when Supabase sent the user back with an error (expired or already
 * used link). The implicit flow puts it in the hash, PKCE in the query.
 */
export function hasAuthLinkError(search: string, hash: string): boolean {
  return [params(search), params(hash)].some(
    (p) => p.has("error") || p.has("error_code") || p.has("error_description"),
  );
}

/**
 * True when the URL hash looks like a password-recovery callback: it must
 * say `type=recovery` and carry an access token. Supabase still validates
 * the token; this only decides whether to start in recovery mode.
 */
export function isRecoveryCallback(hash: string): boolean {
  const p = params(hash);
  return p.get("type") === "recovery" && Boolean(p.get("access_token"));
}

/**
 * Whether the current session came from a recovery link and the password
 * has not been changed yet. Set by PASSWORD_RECOVERY; cleared once the
 * password is saved (USER_UPDATED), the user signs out, or there is no
 * session at all (a leftover flag must not force anything).
 */
export function nextRecoveryFlag(
  current: boolean,
  event: string,
  hasSession = true,
): boolean {
  if (event === "PASSWORD_RECOVERY") return true;
  if (event === "USER_UPDATED" || event === "SIGNED_OUT") return false;
  if (!hasSession) return false;
  return current;
}

/**
 * sessionStorage key for the recovery flag. Supabase drops the hash after
 * reading it but keeps the session, so without this a reload on the
 * new-password screen would forget that the password still has to be set.
 * sessionStorage (not localStorage) keeps it to this tab.
 */
export const RECOVERY_FLAG_KEY = "fitmarket.passwordRecovery";

/** The subset of the Web Storage API used here. */
export type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's sessionStorage, or null when it is missing or blocked. */
export function browserSessionStorage(): FlagStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Reads the stored flag; any storage problem counts as "not recovering". */
export function readRecoveryFlag(storage: FlagStorage | null): boolean {
  try {
    return storage?.getItem(RECOVERY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Stores the flag (or removes it). Storage problems are ignored. */
export function writeRecoveryFlag(
  storage: FlagStorage | null,
  isRecovering: boolean,
): void {
  try {
    if (isRecovering) storage?.setItem(RECOVERY_FLAG_KEY, "1");
    else storage?.removeItem(RECOVERY_FLAG_KEY);
  } catch {
    // Unavailable storage only loses the reload protection.
  }
}

/** The flag at start-up: a valid recovery hash, or one stored before a reload. */
export function initialRecoveryFlag(
  hash: string,
  storage: FlagStorage | null,
): boolean {
  return isRecoveryCallback(hash) || readRecoveryFlag(storage);
}

/**
 * While a recovery session is active, every route leads to the new-password
 * screen, so no automatic redirect (splash -> dashboard) can take the user
 * into the app before the password is set. Returns the path to go to, or
 * null to stay. Without a session (bad link) the user is never trapped.
 */
export function recoveryRedirect(state: {
  location: string;
  resetPath: string;
  isRecovering: boolean;
  hasSession: boolean;
}): string | null {
  const { location, resetPath, isRecovering, hasSession } = state;

  if (!isRecovering || !hasSession || location === resetPath) return null;

  return resetPath;
}
