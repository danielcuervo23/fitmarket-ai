import { createVtexReader, extractFastStoreProduct, type CitySelector } from "./vtex.ts";

// How Exito picks the city. The page is read for the store's default region:
// the Bucaramanga selector was NOT confirmed without breaking the policy
// precautions (no /api/ calls, product pages only), so it stays unverified
// and is a pending-owner item. When confirmed, put the cookie/header here.
export const BUCARAMANGA_SELECTOR: CitySelector = {
  verified: false,
  headers: {},
  note: "Exito default region; Bucaramanga selection pending owner confirmation",
};

export const reader = createVtexReader("Exito", extractFastStoreProduct, BUCARAMANGA_SELECTOR);
