import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import { dbErrorKey, type ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import {
  historyPageRange,
  mapHistoryRows,
  type WeeklyPlanHistoryPage,
} from "@/lib/weeklyPlansHistory";

export type {
  WeeklyPlanHistoryItem,
  WeeklyPlanHistoryPage,
} from "@/lib/weeklyPlansHistory";

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

/**
 * One page (20 plans, newest first) of the history list. Downloads only the
 * three numbers the list shows, not the whole plan_json (~10 KB each).
 * `page` starts at 0; only the first plan of page 0 is marked as current.
 */
export async function fetchWeeklyPlansHistory(page = 0): Promise<{
  data: WeeklyPlanHistoryPage | null;
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

  // Asks for 21 rows: the 21st only tells us whether there is another page.
  // id is the tie-breaker so two plans with the same created_at never move
  // between pages (matches the index of migration 009).
  // Depends on migration 009: shopping_item_count is a column generated from
  // plan_json->'shopping_list', so the full plan_json is never downloaded.
  const { from, to } = historyPageRange(page);

  const { data: rows, error: selectError } = await supabase
    .from("weekly_plans")
    .select(
      "id, created_at, updated_at, " +
        "estimated_total_cop:plan_json->summary->estimated_total_cop, " +
        "estimated_daily_kcal:plan_json->summary->estimated_daily_kcal, " +
        "shopping_item_count",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (selectError) {
    return { data: null, error: dbErrorKey(selectError, "errors.load") };
  }

  return { data: mapHistoryRows(rows, page), error: null };
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
