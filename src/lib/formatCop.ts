import type { DashboardSupermarket } from "@/lib/dashboard";

export function storeDisplayName(
  storeId: string,
  supermarkets: DashboardSupermarket[] | undefined,
): string {
  return supermarkets?.find((store) => store.id === storeId)?.name ?? storeId;
}
