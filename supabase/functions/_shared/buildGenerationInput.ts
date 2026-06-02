import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { DIETARY_PREDEFINED_IDS } from "./dietaryRestrictions.ts";
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

function parseOtherFoodsText(otherText: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of otherText.split(",")) {
    const normalized = part.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function dedupeDietaryRestrictions(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = DIETARY_PREDEFINED_IDS.has(item)
      ? item
      : item.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(DIETARY_PREDEFINED_IDS.has(item) ? item : normalized);
  }

  return result;
}

function normalizeDietaryRestrictions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const expanded: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();

    if (!trimmed) {
      continue;
    }

    if (DIETARY_PREDEFINED_IDS.has(trimmed)) {
      expanded.push(trimmed);
      continue;
    }

    expanded.push(...parseOtherFoodsText(trimmed));
  }

  return dedupeDietaryRestrictions(expanded);
}

export async function buildGenerationInputFromDb(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: WeeklyPlanPromptInput | null; error: string | null }> {
  const [profileResult, goalsResult, supermarketsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("weekly_budget_cop, dietary_restrictions")
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
      dietary_restrictions: normalizeDietaryRestrictions(
        profileResult.data?.dietary_restrictions,
      ),
      locale: "es-CO",
      household_size: 1,
    },
    error: null,
  };
}
