import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function getBudgetErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();
  const code = error.code;

  if (code === "23514" || message.includes("check constraint")) {
    return "El presupuesto debe ser mayor a cero.";
  }

  if (code === "PGRST116" || message.includes("0 rows")) {
    return "Completa tu perfil antes de guardar el presupuesto.";
  }

  if (code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar tu presupuesto. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos guardar tu presupuesto. Intenta de nuevo en unos segundos.";
}

function validateBudget(amountCop: number): string | null {
  if (!Number.isFinite(amountCop) || amountCop <= 0) {
    return "Ingresa un presupuesto válido mayor a cero.";
  }

  return null;
}

export async function saveWeeklyBudget(
  amountCop: number,
): Promise<{ error: string | null }> {
  const validationError = validateBudget(amountCop);

  if (validationError) {
    return { error: validationError };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Debes iniciar sesión para guardar tu presupuesto." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ weekly_budget_cop: Math.round(amountCop) })
    .eq("id", user.id);

  if (error) {
    return { error: getBudgetErrorMessage(error) };
  }

  return { error: null };
}
