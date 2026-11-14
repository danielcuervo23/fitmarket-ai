import { dbErrorKey, type ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { prepareStoresToSave } from "@/lib/storeChoice";

export {
  isSupermarketId,
  type SupermarketId,
} from "@shared/supermarkets.ts";

/**
 * Replaces the user's supermarkets with `storeIds`. New rows are inserted
 * first and only then are removed ones deleted (never an empty state).
 */
export async function saveUserSupermarkets(
  storeIds: string[],
): Promise<{ error: ErrorKey | null }> {
  // Unknown ids fail; coming-soon chains (Ara) are never saved.
  const { stores: uniqueStores, error } = prepareStoresToSave(storeIds);

  if (error) {
    return { error };
  }

  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "errors.notSignedIn" };
  }

  const { error: insertError } = await supabase
    .from("user_supermarkets")
    .upsert(
      uniqueStores.map((supermarket_id) => ({
        user_id: user.id,
        supermarket_id,
      })),
      { onConflict: "user_id,supermarket_id", ignoreDuplicates: true },
    );

  if (insertError) {
    return { error: dbErrorKey(insertError) };
  }

  const { error: deleteError } = await supabase
    .from("user_supermarkets")
    .delete()
    .eq("user_id", user.id)
    .not("supermarket_id", "in", `(${uniqueStores.join(",")})`);

  if (deleteError) {
    return { error: dbErrorKey(deleteError) };
  }

  return { error: null };
}
