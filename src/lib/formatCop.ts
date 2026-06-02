import type { DashboardSupermarket } from "@/lib/dashboard";

export function formatCOP(val: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(val);
}

export function storeDisplayName(
  storeId: string,
  supermarkets: DashboardSupermarket[] | undefined,
): string {
  return supermarkets?.find((store) => store.id === storeId)?.name ?? storeId;
}
