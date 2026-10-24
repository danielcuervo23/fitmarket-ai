import type { AuthError } from "@supabase/supabase-js";
import type { ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export type PostAuthRoute = "dashboard" | "profile";

export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
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
