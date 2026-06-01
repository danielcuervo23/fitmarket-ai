import type { PostgrestError } from "@supabase/supabase-js";
import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import { supabase } from "@/lib/supabase";

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

export async function saveWeeklyPlan(
  plan: WeeklyPlan,
): Promise<{ data: WeeklyPlan | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      data: null,
      error: "Debes iniciar sesión para guardar tu plan.",
    };
  }

  const { data: existing, error: selectError } = await supabase
    .from("weekly_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    return { data: null, error: getWeeklyPlanSaveErrorMessage(selectError) };
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("weekly_plans")
      .update({ plan_json: plan })
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (updateError) {
      return { data: null, error: getWeeklyPlanSaveErrorMessage(updateError) };
    }

    return { data: plan, error: null };
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
  } = await supabase.auth.getUser();

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
    .order("updated_at", { ascending: false })
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
