import type { AuthError, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Returns the signed-in user from the locally stored session, without a
 * network round trip. Data access is still protected by Row Level Security on
 * the server, so this is safe for scoping queries (`user_id = ...`). Use
 * `supabase.auth.getUser()` only where the token must be re-validated.
 */
export async function getSessionUser(): Promise<{
  data: { user: User | null };
  error: AuthError | null;
}> {
  const { data, error } = await supabase.auth.getSession();

  return { data: { user: data.session?.user ?? null }, error };
}
