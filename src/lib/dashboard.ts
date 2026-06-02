import type { PostgrestError } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { normalizeDietaryRestrictionsFromDb } from "@/lib/dietaryRestrictions";
import { type GoalType, isGoalType } from "@/lib/goals";
import { supabase } from "@/lib/supabase";

export interface DashboardGoal {
  id: GoalType;
  label: string;
}

export interface DashboardSupermarket {
  id: string;
  name: string;
}

export interface DashboardData {
  displayName: string;
  weeklyBudgetCop: number | null;
  goals: DashboardGoal[];
  supermarkets: DashboardSupermarket[];
  dietaryRestrictions: string[];
}

const GOAL_LABELS: Record<GoalType, string> = {
  muscle: "Ganar masa muscular",
  fat: "Perder grasa",
  healthy: "Comer saludable",
  save: "Ahorrar dinero",
  family: "Alimentación familiar",
  energy: "Mejorar mi energía",
};

function displayNameFromUser(user: User): string {
  const metaName = user.user_metadata?.full_name;

  if (typeof metaName === "string" && metaName.trim()) {
    return metaName.trim();
  }

  const emailPrefix = user.email?.split("@")[0];

  if (emailPrefix) {
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }

  return "Usuario";
}

function getDashboardErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  if (message.includes("row-level security") || error.code === "42501") {
    return "No tienes permiso para ver tu panel. Inicia sesión e intenta de nuevo.";
  }

  return "No pudimos cargar tu panel. Intenta de nuevo en unos segundos.";
}

type UserSupermarketRow = {
  supermarket_id: string;
  supermarkets: { name: string } | { name: string }[] | null;
};

function supermarketNameFromRow(row: UserSupermarketRow): string {
  const markets = row.supermarkets;

  if (Array.isArray(markets)) {
    return markets[0]?.name ?? row.supermarket_id;
  }

  if (markets && typeof markets === "object" && "name" in markets) {
    return markets.name;
  }

  return row.supermarket_id;
}

export async function fetchDashboardData(): Promise<{
  data: DashboardData | null;
  error: string | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: "Debes iniciar sesión para ver tu panel." };
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
      .select("supermarket_id, supermarkets(name)")
      .eq("user_id", user.id),
  ]);

  const firstError =
    profileResult.error ?? goalsResult.error ?? supermarketsResult.error;

  if (firstError) {
    return { data: null, error: getDashboardErrorMessage(firstError) };
  }

  const goals: DashboardGoal[] = (goalsResult.data ?? [])
    .map((row) => row.goal_type)
    .filter(isGoalType)
    .map((id) => ({
      id,
      label: GOAL_LABELS[id],
    }));

  const supermarkets: DashboardSupermarket[] = (
    (supermarketsResult.data ?? []) as UserSupermarketRow[]
  ).map((row) => ({
    id: row.supermarket_id,
    name: supermarketNameFromRow(row),
  }));

  return {
    data: {
      displayName: displayNameFromUser(user),
      weeklyBudgetCop: profileResult.data?.weekly_budget_cop ?? null,
      goals,
      supermarkets,
      dietaryRestrictions: normalizeDietaryRestrictionsFromDb(
        profileResult.data?.dietary_restrictions,
      ),
    },
    error: null,
  };
}
