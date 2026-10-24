import { dbErrorKey, type ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";

export type SupermarketId = "D1" | "Ara" | "Exito" | "Jumbo" | "Carulla";

const SUPERMARKET_IDS: readonly SupermarketId[] = [
  "D1",
  "Ara",
  "Exito",
  "Jumbo",
  "Carulla",
] as const;

export function isSupermarketId(value: string): value is SupermarketId {
  return SUPERMARKET_IDS.includes(value as SupermarketId);
}

/**
 * Replaces the user's supermarkets with `storeIds`. New rows are inserted
 * first and only then are removed ones deleted (never an empty state).
 */
export async function saveUserSupermarkets(
  storeIds: string[],
): Promise<{ error: ErrorKey | null }> {
  if (storeIds.length === 0) {
    return { error: "errors.storesRequired" };
  }

  if (storeIds.some((id) => !isSupermarketId(id))) {
    return { error: "errors.invalidValues" };
  }

  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "errors.notSignedIn" };
  }

  const uniqueStores = [...new Set(storeIds.filter(isSupermarketId))];

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
