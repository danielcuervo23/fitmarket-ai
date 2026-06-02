import { useCallback, useEffect, useMemo, useState } from "react";
import type { WeeklyPlan } from "@/lib/ai/types";
import {
  buildPlanFingerprint,
  calcChecklistProgress,
  getChecklistStorageKey,
  loadCheckedIndices,
  saveCheckedIndices,
} from "@/lib/shoppingChecklist";

export function useShoppingChecklist(
  plan: WeeklyPlan | null,
  userId: string | undefined,
) {
  const itemCount = plan?.shopping_list.length ?? 0;
  const planFingerprint = plan ? buildPlanFingerprint(plan) : null;

  const storageKey = useMemo(() => {
    if (!userId || !planFingerprint) {
      return null;
    }

    return getChecklistStorageKey(userId, planFingerprint);
  }, [userId, planFingerprint]);

  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!storageKey || itemCount === 0) {
      setCheckedIndices(new Set());
      return;
    }

    setCheckedIndices(loadCheckedIndices(storageKey, itemCount));
  }, [storageKey, itemCount]);

  const persist = useCallback(
    (next: Set<number>) => {
      setCheckedIndices(next);

      if (storageKey) {
        saveCheckedIndices(storageKey, next);
      }
    },
    [storageKey],
  );

  const isChecked = useCallback(
    (listIndex: number) => checkedIndices.has(listIndex),
    [checkedIndices],
  );

  const toggleItem = useCallback(
    (listIndex: number) => {
      if (listIndex < 0 || listIndex >= itemCount) {
        return;
      }

      const next = new Set(checkedIndices);

      if (next.has(listIndex)) {
        next.delete(listIndex);
      } else {
        next.add(listIndex);
      }

      persist(next);
    },
    [checkedIndices, itemCount, persist],
  );

  const overallProgress = useMemo(
    () => calcChecklistProgress(checkedIndices.size, itemCount),
    [checkedIndices.size, itemCount],
  );

  const getStoreProgress = useCallback(
    (listIndices: number[]) => {
      const checked = listIndices.filter((index) =>
        checkedIndices.has(index),
      ).length;

      return calcChecklistProgress(checked, listIndices.length);
    },
    [checkedIndices],
  );

  return {
    isChecked,
    toggleItem,
    overallProgress,
    getStoreProgress,
    hasPlan: itemCount > 0,
  };
}
