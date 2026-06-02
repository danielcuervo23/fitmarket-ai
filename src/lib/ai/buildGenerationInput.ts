import type { PostgrestError } from "@supabase/supabase-js";
import { normalizeDietaryRestrictionsFromDb } from "@/lib/dietaryRestrictions";
import { isGoalType } from "@/lib/goals";
import { isSupermarketId } from "@/lib/supermarkets";
import { supabase } from "@/lib/supabase";

export interface GenerationInput {
  weekly_budget_cop: number;
  goals: string[];
  supermarkets: string[];
  dietary_restrictions: string[];
  locale: "es-CO";
  household_size: 1;
}

function getGenerationInputErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  if (message.includes("row-level security") || error.code === "42501") {
    return "No tienes permiso para generar tu plan. Inicia sesión e intenta de nuevo.";
  }

  return "No pudimos cargar tus preferencias. Intenta de nuevo en unos segundos.";
}

function validateGenerationInput(
  weeklyBudgetCop: number | null | undefined,
  goals: string[],
  supermarkets: string[],
): string | null {
  if (weeklyBudgetCop == null || weeklyBudgetCop <= 0) {
    return "Configura un presupuesto semanal mayor a cero antes de generar tu plan.";
  }

  if (goals.length === 0) {
    return "Selecciona al menos un objetivo antes de generar tu plan.";
  }

  if (supermarkets.length === 0) {
    return "Selecciona al menos un supermercado antes de generar tu plan.";
  }

  return null;
}

export async function buildGenerationInput(): Promise<{
  data: GenerationInput | null;
  error: string | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: "Debes iniciar sesión para generar tu plan." };
  }

  const [profileResult, goalsResult, supermarketsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("weekly_budget_cop, dietary_restrictions")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_goals").select("goal_type").eq("user_id", user.id),
    supabase
      .from("user_supermarkets")
      .select("supermarket_id")
      .eq("user_id", user.id),
  ]);

  const firstError =
    profileResult.error ?? goalsResult.error ?? supermarketsResult.error;

  if (firstError) {
    return { data: null, error: getGenerationInputErrorMessage(firstError) };
  }

  const goals = (goalsResult.data ?? [])
    .map((row) => row.goal_type)
    .filter(isGoalType);

  const supermarkets = (supermarketsResult.data ?? [])
    .map((row) => row.supermarket_id)
    .filter(isSupermarketId);

  const validationError = validateGenerationInput(
    profileResult.data?.weekly_budget_cop,
    goals,
    supermarkets,
  );

  if (validationError) {
    return { data: null, error: validationError };
  }

  const weeklyBudgetCop = profileResult.data!.weekly_budget_cop as number;
  const dietaryRestrictions = normalizeDietaryRestrictionsFromDb(
    profileResult.data?.dietary_restrictions,
  );

  return {
    data: {
      weekly_budget_cop: weeklyBudgetCop,
      goals,
      supermarkets,
      dietary_restrictions: dietaryRestrictions,
      locale: "es-CO",
      household_size: 1,
    },
    error: null,
  };
}
