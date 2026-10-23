import { dbErrorKey, type ErrorKey } from "@/lib/errors";
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

/**
 * Replaces the user's goals with `goalTypes`. New goals are inserted first
 * and only then are removed ones deleted, so a failure half-way can never
 * leave the user with no goals at all.
 */
export async function saveUserGoals(
  goalTypes: string[],
): Promise<{ error: ErrorKey | null }> {
  if (goalTypes.length === 0) {
    return { error: "errors.goalsRequired" };
  }

  if (goalTypes.some((goal) => !isGoalType(goal))) {
    return { error: "errors.invalidValues" };
  }

  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "errors.notSignedIn" };
  }

  const uniqueGoals = [...new Set(goalTypes.filter(isGoalType))];

  const { error: insertError } = await supabase.from("user_goals").upsert(
    uniqueGoals.map((goal_type) => ({ user_id: user.id, goal_type })),
    { onConflict: "user_id,goal_type", ignoreDuplicates: true },
  );

  if (insertError) {
    return { error: dbErrorKey(insertError) };
  }

  const { error: deleteError } = await supabase
    .from("user_goals")
    .delete()
    .eq("user_id", user.id)
    .not("goal_type", "in", `(${uniqueGoals.join(",")})`);

  if (deleteError) {
    return { error: dbErrorKey(deleteError) };
  }

  return { error: null };
}
