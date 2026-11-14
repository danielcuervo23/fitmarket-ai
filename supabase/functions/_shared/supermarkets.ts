/**
 * The supermarket chains the app knows: the single source of truth for both
 * the web (via the `@shared` alias) and the Edge Functions.
 *
 * `coming_soon` means the chain is shown greyed out ("Próximamente"), cannot
 * be selected and is never used for plans. Ara is coming soon because its
 * terms forbid reading its prices (scripts/prices/policy.json), so it has no
 * real prices yet. To launch a chain, change its status to `available`.
 *
 * No imports on purpose: the web, Deno and `node --test` all load this file.
 */

export type SupermarketStatus = "available" | "coming_soon";

export type SupermarketId = "D1" | "Ara" | "Exito" | "Jumbo" | "Carulla";

export interface Supermarket {
  id: SupermarketId;
  /** Brand name, never translated. */
  name: string;
  status: SupermarketStatus;
}

export const SUPERMARKETS: readonly Supermarket[] = [
  { id: "D1", name: "D1", status: "available" },
  { id: "Ara", name: "Ara", status: "coming_soon" },
  { id: "Exito", name: "Éxito", status: "available" },
  { id: "Jumbo", name: "Jumbo", status: "available" },
  { id: "Carulla", name: "Carulla", status: "available" },
];

const BY_ID = new Map(SUPERMARKETS.map((store) => [store.id as string, store]));

/** A chain the app knows, whatever its status (saved rows may hold any). */
export function isSupermarketId(value: string): value is SupermarketId {
  return BY_ID.has(value);
}

/** Can the user pick this chain and can plans use it? */
export function isStoreSelectable(value: string): value is SupermarketId {
  return BY_ID.get(value)?.status === "available";
}

/** The saved chains a plan may use: known and available, in the same order. */
export function plannableStores(ids: readonly string[]): SupermarketId[] {
  return ids.filter(isStoreSelectable);
}
