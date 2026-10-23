import { normalizeDietaryRestrictionsFromDb } from "@/lib/dietaryRestrictions";
import { type GoalType, isGoalType } from "@/lib/goals";
import { displayNameFromUser } from "@/lib/displayName";
import { dbErrorKey, type ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export interface DashboardGoal {
  id: GoalType;
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
  error: ErrorKey | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { data: null, error: "errors.notSignedIn" };
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
    return { data: null, error: dbErrorKey(firstError, "errors.load") };
  }

  const goals: DashboardGoal[] = (goalsResult.data ?? [])
    .map((row) => row.goal_type)
    .filter(isGoalType)
    .map((id) => ({ id }));

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
