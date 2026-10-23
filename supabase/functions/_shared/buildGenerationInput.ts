import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  mapGenerationInputLoadError,
  type GenerationInputError,
} from "./generationInputErrors.ts";
import { isActivityLevel, type Sex } from "./nutrition.ts";
import type { GenerateInput } from "./planner/generate.ts";

const GOAL_TYPES = new Set([
  "muscle",
  "fat",
  "healthy",
  "save",
  "family",
  "energy",
]);

const SUPERMARKET_IDS = new Set(["D1", "Ara", "Exito", "Jumbo", "Carulla"]);

/** Ids the app offers as tiles; anything else is free text. */
const PREDEFINED_RESTRICTION_IDS = new Set([
  "lactose",
  "gluten",
  "pork",
  "fish",
  "shellfish",
  "peanut",
  "nuts",
  "vegetarian",
  "vegan",
]);

/** Splits free text ("cilantro, huevo") into trimmed, lowercase, unique items. */
function splitFreeText(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeRestrictions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();

    if (PREDEFINED_RESTRICTION_IDS.has(trimmed)) {
      result.add(trimmed);
      continue;
    }

    splitFreeText(trimmed).forEach((part) => result.add(part));
  }

  return [...result].slice(0, 20);
}

function incomplete(
  code: GenerationInputError["code"],
  message: string,
): { data: null; error: GenerationInputError } {
  return { data: null, error: { code, message } };
}

export async function buildGenerationInputFromDb(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  data: GenerateInput | null;
  error: GenerationInputError | null;
}> {
  const [profileResult, goalsResult, supermarketsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "weekly_budget_cop, dietary_restrictions, age, weight_kg, height_cm, activity_level, sex, household_size",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_goals").select("goal_type").eq("user_id", userId),
    supabase
      .from("user_supermarkets")
      .select("supermarket_id")
      .eq("user_id", userId),
  ]);

  if (profileResult.error) {
    return {
      data: null,
      error: mapGenerationInputLoadError(profileResult.error, "profiles"),
    };
  }

  if (goalsResult.error) {
    return {
      data: null,
      error: mapGenerationInputLoadError(goalsResult.error, "user_goals"),
    };
  }

  if (supermarketsResult.error) {
    return {
      data: null,
      error: mapGenerationInputLoadError(
        supermarketsResult.error,
        "user_supermarkets",
      ),
    };
  }

  const goals = (goalsResult.data ?? [])
    .map((row: { goal_type: string }) => row.goal_type)
    .filter((goal: string) => GOAL_TYPES.has(goal));

  const stores = (supermarketsResult.data ?? [])
    .map((row: { supermarket_id: string }) => row.supermarket_id)
    .filter((id: string) => SUPERMARKET_IDS.has(id));

  const profile = profileResult.data;
  const weeklyBudgetCop = profile?.weekly_budget_cop as number | null | undefined;

  if (weeklyBudgetCop == null || weeklyBudgetCop <= 0) {
    return incomplete(
      "budget_missing",
      "Configura un presupuesto semanal mayor a cero antes de generar tu plan.",
    );
  }

  if (goals.length === 0) {
    return incomplete(
      "goals_missing",
      "Selecciona al menos un objetivo antes de generar tu plan.",
    );
  }

  if (stores.length === 0) {
    return incomplete(
      "stores_missing",
      "Selecciona al menos un supermercado antes de generar tu plan.",
    );
  }

  const age = profile?.age as number | null | undefined;
  const weightKg = profile?.weight_kg as number | null | undefined;
  const heightCm = profile?.height_cm as number | null | undefined;
  const activity = profile?.activity_level as string | null | undefined;

  if (
    age == null ||
    weightKg == null ||
    heightCm == null ||
    !activity ||
    !isActivityLevel(activity)
  ) {
    return incomplete(
      "profile_incomplete",
      "Completa tu perfil (edad, peso, altura y actividad) antes de generar tu plan.",
    );
  }

  const sex = profile?.sex;
  const household = Number(profile?.household_size);

  return {
    data: {
      weeklyBudgetCop,
      goals,
      stores,
      restrictions: normalizeRestrictions(profile?.dietary_restrictions),
      householdSize:
        Number.isInteger(household) && household >= 1 && household <= 8
          ? household
          : 1,
      profile: {
        age,
        weightKg: Number(weightKg),
        heightCm,
        activity,
        sex: sex === "female" || sex === "male" ? (sex as Sex) : null,
      },
    },
    error: null,
  };
}
