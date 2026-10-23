import type { PostgrestError } from "@supabase/supabase-js";
import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

function getWeeklyPlanSaveErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();
  const code = error.code;

  if (code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar tu plan. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos guardar tu plan. Intenta de nuevo en unos segundos.";
}

function getWeeklyPlanFetchErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();

  if (message.includes("row-level security") || error.code === "42501") {
    return "No tienes permiso para ver tu plan. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos cargar tu plan. Intenta de nuevo en unos segundos.";
}

export interface WeeklyPlanHistoryItem {
  id: string;
  created_at: string;
  updated_at: string;
  estimated_total_cop: number;
  product_count: number;
  estimated_daily_kcal: number;
  is_current: boolean;
}

export function formatPlanHistoryDate(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
): Promise<{ data: WeeklyPlan | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "Debes iniciar sesión para guardar tu plan.",
    };
  }

  const { error: insertError } = await supabase.from("weekly_plans").insert({
    user_id: user.id,
    plan_json: plan,
  });

  if (insertError) {
    return { data: null, error: getWeeklyPlanSaveErrorMessage(insertError) };
  }

  return { data: plan, error: null };
}

export async function fetchLatestWeeklyPlan(): Promise<{
  data: WeeklyPlan | null;
  error: string | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "Debes iniciar sesión para ver tu plan.",
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
    return { data: null, error: getWeeklyPlanFetchErrorMessage(selectError) };
  }

  if (!row?.plan_json) {
    return { data: null, error: null };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(row.plan_json);

  if (parseError || !plan) {
    return {
      data: null,
      error: parseError ?? "El plan guardado no tiene un formato válido.",
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}

export async function fetchWeeklyPlansHistory(): Promise<{
  data: WeeklyPlanHistoryItem[] | null;
  error: string | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "Debes iniciar sesión para ver tu historial.",
    };
  }

  const { data: rows, error: selectError } = await supabase
    .from("weekly_plans")
    .select("id, created_at, updated_at, plan_json")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (selectError) {
    return { data: null, error: getWeeklyPlanFetchErrorMessage(selectError) };
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
  error: string | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return {
      data: null,
      error: "Debes iniciar sesión para ver este plan.",
    };
  }

  const { data: row, error: selectError } = await supabase
    .from("weekly_plans")
    .select("plan_json")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    return { data: null, error: getWeeklyPlanFetchErrorMessage(selectError) };
  }

  if (!row?.plan_json) {
    return { data: null, error: "No encontramos este plan." };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(row.plan_json);

  if (parseError || !plan) {
    return {
      data: null,
      error: parseError ?? "El plan guardado no tiene un formato válido.",
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}
