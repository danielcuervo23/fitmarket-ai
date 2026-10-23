import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export interface ProfileInput {
  age: number;
  weight: number;
  height: number;
  activity_level: ActivityLevel;
}

/** Campos de preferencias almacenados en public.profiles */
export interface ProfileRecord {
  dietary_restrictions: string[];
}

const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;

export function isActivityLevel(value: string): value is ActivityLevel {
  return ACTIVITY_LEVELS.includes(value as ActivityLevel);
}

function getProfileErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();
  const code = error.code ?? "";

  console.error("[upsertProfile] save failed", {
    code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  if (code === "23514" || message.includes("check constraint")) {
    return "Algunos valores del perfil no son válidos. Revísalos e intenta de nuevo.";
  }

  if (code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar este perfil. Inicia sesión e intenta de nuevo.";
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout")
  ) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  if (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    (message.includes("column") && message.includes("profiles"))
  ) {
    return "Falta configurar la base de datos (columnas de perfil). Aplica las migraciones de Supabase e intenta de nuevo.";
  }

  if (code === "23503" || message.includes("foreign key")) {
    return "Tu sesión no está lista. Cierra sesión, vuelve a iniciar sesión e intenta de nuevo.";
  }

  return "No pudimos guardar tu perfil. Intenta de nuevo en unos segundos.";
}

function buildProfileRow(userId: string, input: ProfileInput) {
  return {
    id: userId,
    age: Math.round(input.age),
    weight_kg: Number(input.weight),
    height_cm: Math.round(input.height),
    activity_level: input.activity_level,
  };
}

export async function upsertProfile(
  input: ProfileInput,
): Promise<{ error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "Debes iniciar sesión para guardar tu perfil." };
  }

  const row = buildProfileRow(user.id, input);

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    return { error: getProfileErrorMessage(selectError) };
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        age: row.age,
        weight_kg: row.weight_kg,
        height_cm: row.height_cm,
        activity_level: row.activity_level,
      })
      .eq("id", user.id);

    if (updateError) {
      return { error: getProfileErrorMessage(updateError) };
    }

    return { error: null };
  }

  const { error: insertError } = await supabase.from("profiles").insert(row);

  if (insertError) {
    return { error: getProfileErrorMessage(insertError) };
  }

  return { error: null };
}
