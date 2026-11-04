import type { AuthError } from "@supabase/supabase-js";
import type { ErrorKey } from "@/lib/errors";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/authRules";
import {
  buildPasswordResetRedirect,
  resetRequestErrorKey,
  signOutOtherDevicesIfAsked,
  updatePasswordErrorKey,
} from "@/lib/passwordReset";
import { supabase } from "@/lib/supabase";

export type PostAuthRoute = "dashboard" | "profile";

export { MIN_PASSWORD_LENGTH };

function signInErrorKey(error: AuthError): ErrorKey {
  const message = error.message.toLowerCase();

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return "auth.error.invalidCredentials";
  }

  if (message.includes("email not confirmed")) {
    return "auth.error.emailNotConfirmed";
  }

  if (message.includes("rate limit")) {
    return "auth.error.rateLimit";
  }

  return "auth.error.signInFailed";
}

export function signUpErrorKey(error: AuthError): ErrorKey {
  const message = error.message.toLowerCase();

  if (
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "auth.error.emailTaken";
  }

  if (message.includes("invalid") && message.includes("email")) {
    return "auth.error.emailInvalid";
  }

  if (message.includes("password")) {
    return "auth.error.passwordTooShort";
  }

  if (message.includes("rate limit")) {
    return "auth.error.rateLimit";
  }

  return "auth.error.signUpFailed";
}

/** Validates the sign-in form; `requireStrongPassword` adds the sign-up rules. */
export function validateAuthForm(
  email: string,
  password: string,
  options: { requireStrongPassword?: boolean } = {},
): ErrorKey | null {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "auth.error.emailRequired";
  }

  if (!isValidEmail(trimmedEmail)) {
    return "auth.error.emailInvalid";
  }

  if (!password) {
    return "auth.error.passwordRequired";
  }

  if (options.requireStrongPassword && password.length < MIN_PASSWORD_LENGTH) {
    return "auth.error.passwordTooShort";
  }

  return null;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ error: ErrorKey | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: signInErrorKey(error) };
  }

  return { error: null };
}

/**
 * Sends the reset e-mail. Returns an error only for problems the user can act
 * on (network, rate limit); otherwise the screen shows the same neutral
 * message whether or not the address has an account. `resetPath` is the
 * app route the e-mail link opens.
 */
export async function requestPasswordReset(
  email: string,
  resetPath: string,
): Promise<{ error: ErrorKey | null }> {
  const redirectTo = buildPasswordResetRedirect(
    resetPath,
    import.meta.env.VITE_AUTH_REDIRECT_URL,
    window.location.origin,
  );
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  return { error: resetRequestErrorKey(error) };
}

/**
 * Saves a new password for the signed-in (or recovering) user. With
 * `signOutOthers`, every other session is closed afterwards (this one stays);
 * if that part fails the password is still saved and `warning` says so.
 */
export async function updatePassword(
  password: string,
  { signOutOthers = false }: { signOutOthers?: boolean } = {},
): Promise<{ error: ErrorKey | null; warning: ErrorKey | null }> {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: updatePasswordErrorKey(error), warning: null };

  const { warningKey } = await signOutOtherDevicesIfAsked(
    signOutOthers,
    supabase.auth,
  );

  return { error: null, warning: warningKey };
}

export async function signOut(): Promise<{ error: ErrorKey | null }> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: "errors.signOut" };
  }

  return { error: null };
}

export async function fetchHasProfile(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, age, weight_kg, height_cm, activity_level")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return (
    data.age != null &&
    data.weight_kg != null &&
    data.height_cm != null &&
    typeof data.activity_level === "string" &&
    data.activity_level.length > 0
  );
}

export async function resolvePostAuthRoute(): Promise<PostAuthRoute> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return "profile";
  }

  const hasCompleteProfile = await fetchHasProfile(user.id);
  return hasCompleteProfile ? "dashboard" : "profile";
}
