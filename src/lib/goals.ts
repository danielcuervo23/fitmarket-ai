import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export type GoalType =
  | "muscle"
  | "fat"
  | "healthy"
  | "save"
  | "family"
  | "energy";

const GOAL_TYPES: readonly GoalType[] = [
  "muscle",
  "fat",
  "healthy",
  "save",
  "family",
  "energy",
] as const;

export function isGoalType(value: string): value is GoalType {
  return GOAL_TYPES.includes(value as GoalType);
}

function getGoalsErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();
  const code = error.code;

  if (code === "23514" || message.includes("check constraint")) {
    return "Uno o más objetivos no son válidos. Revísalos e intenta de nuevo.";
  }

  if (code === "23503" || message.includes("foreign key")) {
    return "No se pudo vincular tus objetivos. Completa tu perfil primero.";
  }

  if (code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar tus objetivos. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos guardar tus objetivos. Intenta de nuevo en unos segundos.";
}

function validateGoalTypes(goalTypes: string[]): string | null {
  if (goalTypes.length === 0) {
    return "Selecciona al menos un objetivo.";
  }

  const invalid = goalTypes.find((goal) => !isGoalType(goal));

  if (invalid) {
    return "Uno o más objetivos no son válidos.";
  }

  return null;
}

export async function saveUserGoals(
  goalTypes: string[],
): Promise<{ error: string | null }> {
  const validationError = validateGoalTypes(goalTypes);

  if (validationError) {
    return { error: validationError };
  }

  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "Debes iniciar sesión para guardar tus objetivos." };
  }

  const uniqueGoals = [...new Set(goalTypes.filter(isGoalType))];

  const { error: deleteError } = await supabase
    .from("user_goals")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    return { error: getGoalsErrorMessage(deleteError) };
  }

  const rows = uniqueGoals.map((goal_type) => ({
    user_id: user.id,
    goal_type,
  }));

  const { error: insertError } = await supabase.from("user_goals").insert(rows);

  if (insertError) {
    return { error: getGoalsErrorMessage(insertError) };
  }

  return { error: null };
}
