import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import { dbErrorKey, type ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export interface WeeklyPlanHistoryItem {
  id: string;
  created_at: string;
  updated_at: string;
  estimated_total_cop: number;
  product_count: number;
  estimated_daily_kcal: number;
  is_current: boolean;
}

function buildHistorySummary(
  planJson: unknown,
): Pick<
  WeeklyPlanHistoryItem,
  "estimated_total_cop" | "product_count" | "estimated_daily_kcal"
> | null {
  const { data: plan, error } = parseWeeklyPlanJson(planJson);

  if (error || !plan) {
    return null;
  }

  return {
    estimated_total_cop: plan.summary.estimated_total_cop,
    product_count: plan.shopping_list.length,
    estimated_daily_kcal: plan.summary.estimated_daily_kcal,
  };
}

export async function saveWeeklyPlan(
  plan: WeeklyPlan,
): Promise<{ data: WeeklyPlan | null; error: ErrorKey | null }> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "errors.notSignedIn",
    };
  }

  const { error: insertError } = await supabase.from("weekly_plans").insert({
    user_id: user.id,
    plan_json: plan,
  });

  if (insertError) {
    return { data: null, error: dbErrorKey(insertError, "errors.save") };
  }

  return { data: plan, error: null };
}

export async function fetchLatestWeeklyPlan(): Promise<{
  data: WeeklyPlan | null;
  error: ErrorKey | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "errors.notSignedIn",
    };
  }

  const { data: row, error: selectError } = await supabase
    .from("weekly_plans")
    .select("plan_json")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    return { data: null, error: dbErrorKey(selectError, "errors.load") };
  }

  if (!row?.plan_json) {
    return { data: null, error: null };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(row.plan_json);

  if (parseError || !plan) {
    return {
      data: null,
      error: "errors.planInvalid",
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}

export async function fetchWeeklyPlansHistory(): Promise<{
  data: WeeklyPlanHistoryItem[] | null;
  error: ErrorKey | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "errors.notSignedIn",
    };
  }

  const { data: rows, error: selectError } = await supabase
    .from("weekly_plans")
    .select("id, created_at, updated_at, plan_json")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (selectError) {
    return { data: null, error: dbErrorKey(selectError, "errors.load") };
  }

  if (!rows?.length) {
    return { data: [], error: null };
  }

  const latestId = rows[0]?.id;

  const items: WeeklyPlanHistoryItem[] = rows
    .map((row) => {
      const summary = buildHistorySummary(row.plan_json);

      if (!summary) {
        return null;
      }

      return {
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ...summary,
        is_current: row.id === latestId,
      };
    })
    .filter((item): item is WeeklyPlanHistoryItem => item !== null);

  return { data: items, error: null };
}

export async function fetchWeeklyPlanById(planId: string): Promise<{
  data: WeeklyPlan | null;
  error: ErrorKey | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "errors.notSignedIn",
    };
  }

  const { data: row, error: selectError } = await supabase
    .from("weekly_plans")
    .select("plan_json")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    return { data: null, error: dbErrorKey(selectError, "errors.load") };
  }

  if (!row?.plan_json) {
    return { data: null, error: "errors.planNotFound" };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(row.plan_json);

  if (parseError || !plan) {
    return {
      data: null,
      error: "errors.planInvalid",
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}
