import type { PostgrestError } from "@supabase/supabase-js";
import { dbErrorKey, type ErrorKey } from "@/lib/errors";
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

function getProfileErrorKey(error: PostgrestError): ErrorKey {
  console.error("[upsertProfile] save failed", {
    code: error.code,
    message: error.message,
  });

  return dbErrorKey(error);
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
): Promise<{ error: ErrorKey | null }> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "errors.notSignedIn" };
  }

  const row = buildProfileRow(user.id, input);

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    return { error: getProfileErrorKey(selectError) };
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
      return { error: getProfileErrorKey(updateError) };
    }

    return { error: null };
  }

  const { error: insertError } = await supabase.from("profiles").insert(row);

  if (insertError) {
    return { error: getProfileErrorKey(insertError) };
  }

  return { error: null };
}
