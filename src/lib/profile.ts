import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
  const code = error.code;

  if (code === "23514" || message.includes("check constraint")) {
    return "Algunos valores del perfil no son válidos. Revísalos e intenta de nuevo.";
  }

  if (code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar este perfil. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos guardar tu perfil. Intenta de nuevo en unos segundos.";
}

export async function upsertProfile(
  input: ProfileInput,
): Promise<{ error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Debes iniciar sesión para guardar tu perfil." };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      age: input.age,
      weight: input.weight,
      height: input.height,
      activity_level: input.activity_level,
    },
    { onConflict: "id" },
  );

  if (error) {
    return { error: getProfileErrorMessage(error) };
  }

  return { error: null };
}
