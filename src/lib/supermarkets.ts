import type { PostgrestError } from "@supabase/supabase-js";
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

function getSupermarketsErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();
  const code = error.code;

  if (code === "23503" || message.includes("foreign key")) {
    return "Uno o más supermercados no son válidos.";
  }

  if (code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar tus supermercados. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos guardar tus supermercados. Intenta de nuevo en unos segundos.";
}

function validateStoreIds(storeIds: string[]): string | null {
  if (storeIds.length === 0) {
    return "Selecciona al menos un supermercado.";
  }

  const invalid = storeIds.find((id) => !isSupermarketId(id));

  if (invalid) {
    return "Uno o más supermercados no son válidos.";
  }

  return null;
}

export async function saveUserSupermarkets(
  storeIds: string[],
): Promise<{ error: string | null }> {
  const validationError = validateStoreIds(storeIds);

  if (validationError) {
    return { error: validationError };
  }

  const {
    data: { user },
    error: authError,
  } = await getSessionUser();

  if (authError || !user) {
    return { error: "Debes iniciar sesión para guardar tus supermercados." };
  }

  const uniqueStores = [...new Set(storeIds.filter(isSupermarketId))];

  const { error: deleteError } = await supabase
    .from("user_supermarkets")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    return { error: getSupermarketsErrorMessage(deleteError) };
  }

  const rows = uniqueStores.map((supermarket_id) => ({
    user_id: user.id,
    supermarket_id,
  }));

  const { error: insertError } = await supabase
    .from("user_supermarkets")
    .insert(rows);

  if (insertError) {
    return { error: getSupermarketsErrorMessage(insertError) };
  }

  return { error: null };
}
