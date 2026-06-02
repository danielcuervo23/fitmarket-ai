import type { ShoppingItem } from "@/lib/ai/types";

export interface ShoppingListStoreGroup {
  storeId: string;
  items: ShoppingItem[];
  itemCount: number;
  subtotalCop: number;
}

export function groupShoppingListByStore(
  shoppingList: ShoppingItem[],
  storeOrder: string[] = [],
): ShoppingListStoreGroup[] {
  const itemsByStore = new Map<string, ShoppingItem[]>();

  for (const item of shoppingList) {
    const storeItems = itemsByStore.get(item.store_id) ?? [];
    storeItems.push(item);
    itemsByStore.set(item.store_id, storeItems);
  }

  const orderedStoreIds = [
    ...storeOrder.filter((storeId) => itemsByStore.has(storeId)),
    ...[...itemsByStore.keys()].filter(
      (storeId) => !storeOrder.includes(storeId),
    ),
  ];

  return orderedStoreIds.map((storeId) => {
    const items = itemsByStore.get(storeId) ?? [];

    return {
      storeId,
      items,
      itemCount: items.length,
      subtotalCop: items.reduce(
        (sum, item) => sum + item.estimated_price_cop,
        0,
      ),
    };
  });
}
