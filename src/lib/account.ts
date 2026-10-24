import type { ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

/**
 * Permanently deletes the signed-in user's account and all their data (done
 * server-side by the delete-account Edge Function), then ends the session.
 */
export async function deleteAccount(): Promise<{ error: ErrorKey | null }> {
  const { error } = await supabase.functions.invoke("delete-account", {
    body: {},
  });

  if (error) {
    console.error("[FitMarket] delete-account failed:", error.message);
    return { error: "account.deleteFailed" };
  }

  // The user no longer exists: drop the local session without a server call.
  await supabase.auth.signOut({ scope: "local" });

  return { error: null };
}
