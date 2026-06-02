import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type PostAuthRoute = "dashboard" | "profile";

function getSignInErrorMessage(error: AuthError): string {
  const message = error.message.toLowerCase();

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return "Correo o contraseña incorrectos.";
  }

  if (message.includes("email not confirmed")) {
    return "Confirma tu correo antes de iniciar sesión.";
  }

  if (message.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e intenta de nuevo.";
  }

  return "No pudimos iniciar sesión. Revisa tus datos e intenta de nuevo.";
}

export function validateAuthForm(
  email: string,
  password: string,
): string | null {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "Ingresa tu correo electrónico.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return "Ingresa un correo electrónico válido.";
  }

  if (!password) {
    return "Ingresa una contraseña.";
  }

  return null;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: getSignInErrorMessage(error) };
  }

  return { error: null };
}

export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: "No pudimos cerrar sesión. Intenta de nuevo." };
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
