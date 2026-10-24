import { dbErrorKey, type ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export async function saveWeeklyBudget(
  amountCop: number,
): Promise<{ error: ErrorKey | null }> {
  if (!Number.isFinite(amountCop) || amountCop <= 0) {
    return { error: "errors.budgetInvalid" };
  }

  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "errors.notSignedIn" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ weekly_budget_cop: Math.round(amountCop) })
    .eq("id", user.id);

  if (error) {
    // No profile row yet (the budget step was reached before the profile step).
    if (
      error.code === "PGRST116" ||
      error.message.toLowerCase().includes("0 rows")
    ) {
      return { error: "errors.profileFirst" };
    }

    return { error: dbErrorKey(error) };
  }

  return { error: null };
}
