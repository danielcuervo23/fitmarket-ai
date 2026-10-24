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

export type Sex = "female" | "male";

export interface ProfileInput {
  age: number;
  weight: number;
  height: number;
  activity_level: ActivityLevel;
  /** Optional: only used to estimate calories. null = prefer not to say. */
  sex: Sex | null;
  /** People who share the same shopping (1-8). */
  household_size: number;
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
    sex: input.sex,
    household_size: Math.min(8, Math.max(1, Math.round(input.household_size))),
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
        sex: row.sex,
        household_size: row.household_size,
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

/** The saved body data and household of the signed-in user (null if not set yet). */
export async function fetchProfile(): Promise<{
  data: ProfileInput | null;
  error: ErrorKey | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { data: null, error: "errors.notSignedIn" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("age, weight_kg, height_cm, activity_level, sex, household_size")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { data: null, error: dbErrorKey(error, "errors.load") };
  }

  if (
    !data ||
    data.age == null ||
    data.weight_kg == null ||
    data.height_cm == null
  ) {
    return { data: null, error: null };
  }

  return {
    data: {
      age: Number(data.age),
      weight: Number(data.weight_kg),
      height: Number(data.height_cm),
      activity_level: isActivityLevel(String(data.activity_level))
        ? (data.activity_level as ActivityLevel)
        : "moderate",
      sex: data.sex === "female" || data.sex === "male" ? data.sex : null,
      household_size: Number(data.household_size) || 1,
    },
    error: null,
  };
}
