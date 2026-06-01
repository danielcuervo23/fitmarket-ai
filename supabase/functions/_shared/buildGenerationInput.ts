import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { WeeklyPlanPromptInput } from "./prompts.ts";

const GOAL_TYPES = new Set([
  "muscle",
  "fat",
  "healthy",
  "save",
  "family",
  "energy",
]);

const SUPERMARKET_IDS = new Set(["D1", "Ara", "Exito", "Jumbo", "Carulla"]);

export async function buildGenerationInputFromDb(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: WeeklyPlanPromptInput | null; error: string | null }> {
  const [profileResult, goalsResult, supermarketsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("weekly_budget_cop")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_goals").select("goal_type").eq("user_id", userId),
    supabase
      .from("user_supermarkets")
      .select("supermarket_id")
      .eq("user_id", userId),
  ]);

  const firstError =
    profileResult.error ?? goalsResult.error ?? supermarketsResult.error;

  if (firstError) {
    const message = firstError.message.toLowerCase();

    if (message.includes("row-level security") || firstError.code === "42501") {
      return {
        data: null,
        error:
          "No tienes permiso para generar tu plan. Inicia sesión e intenta de nuevo.",
      };
    }

    return {
      data: null,
      error: "No pudimos cargar tus preferencias. Intenta de nuevo en unos segundos.",
    };
  }

  const goals = (goalsResult.data ?? [])
    .map((row: { goal_type: string }) => row.goal_type)
    .filter((goal: string) => GOAL_TYPES.has(goal));

  const supermarkets = (supermarketsResult.data ?? [])
    .map((row: { supermarket_id: string }) => row.supermarket_id)
    .filter((id: string) => SUPERMARKET_IDS.has(id));

  const weeklyBudgetCop = profileResult.data?.weekly_budget_cop as
    | number
    | null
    | undefined;

  if (weeklyBudgetCop == null || weeklyBudgetCop <= 0) {
    return {
      data: null,
      error:
        "Configura un presupuesto semanal mayor a cero antes de generar tu plan.",
    };
  }

  if (goals.length === 0) {
    return {
      data: null,
      error: "Selecciona al menos un objetivo antes de generar tu plan.",
    };
  }

  if (supermarkets.length === 0) {
    return {
      data: null,
      error:
        "Selecciona al menos un supermercado antes de generar tu plan.",
    };
  }

  return {
    data: {
      weekly_budget_cop: weeklyBudgetCop,
      goals,
      supermarkets,
      locale: "es-CO",
      household_size: 1,
    },
    error: null,
  };
}
