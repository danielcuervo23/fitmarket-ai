import type { ErrorKey } from "@/lib/errors";
import { profileUpdateError } from "@/lib/profileUpdate";
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

  // `select` returns the updated rows, so "no profile yet" is detectable.
  const { data, error } = await supabase
    .from("profiles")
    .update({ weekly_budget_cop: Math.round(amountCop) })
    .eq("id", user.id)
    .select("id");

  return { error: profileUpdateError({ data, error }) };
}
