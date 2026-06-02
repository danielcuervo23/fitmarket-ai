import type { ShoppingItem } from "@/lib/ai/types";

export interface GroupedShoppingItem extends ShoppingItem {
  /** Índice estable en plan.shopping_list (checklist local). */
  listIndex: number;
}

export interface ShoppingListStoreGroup {
  storeId: string;
  items: GroupedShoppingItem[];
  itemCount: number;
  subtotalCop: number;
}

export function groupShoppingListByStore(
  shoppingList: ShoppingItem[],
  storeOrder: string[] = [],
): ShoppingListStoreGroup[] {
  const itemsByStore = new Map<string, GroupedShoppingItem[]>();

  shoppingList.forEach((item, listIndex) => {
    const storeItems = itemsByStore.get(item.store_id) ?? [];
    storeItems.push({ ...item, listIndex });
    itemsByStore.set(item.store_id, storeItems);
  });

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
