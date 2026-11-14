// Pure store-picker logic. No runtime "@/" imports: `node --test` loads this
// file directly. Store definitions come from the shared single source.
import type { ErrorKey } from "./errors.ts";
import {
  SUPERMARKETS,
  isStoreSelectable,
  isSupermarketId,
  plannableStores,
  type SupermarketId,
} from "../../supabase/functions/_shared/supermarkets.ts";

export interface StoreOption {
  id: SupermarketId;
  name: string;
  /** false for "coming soon" chains: shown, greyed out, never selectable. */
  selectable: boolean;
}

export function storeOptions(): StoreOption[] {
  return SUPERMARKETS.map(({ id, name }) => ({ id, name, selectable: isStoreSelectable(id) }));
}

/** Adds or removes a chain; a coming-soon chain leaves the value untouched. */
export function toggleStore(value: SupermarketId[], id: SupermarketId): SupermarketId[] {
  if (!isStoreSelectable(id)) {
    return value;
  }

  return value.includes(id) ? value.filter((store) => store !== id) : [...value, id];
}

/** Saved chains the user can keep editing: a saved Ara is dropped. */
export function editableStores(saved: readonly string[]): SupermarketId[] {
  return plannableStores(saved);
}

/** Validates a choice before saving: unknown ids fail, Ara is never saved. */
export function prepareStoresToSave(
  ids: readonly string[],
): { stores: SupermarketId[]; error: ErrorKey | null } {
  if (ids.some((id) => !isSupermarketId(id))) {
    return { stores: [], error: "errors.invalidValues" };
  }

  const stores = [...new Set(plannableStores(ids))];

  return stores.length === 0
    ? { stores: [], error: "errors.storesRequired" }
    : { stores, error: null };
}
