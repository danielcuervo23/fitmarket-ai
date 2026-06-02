import type { WeeklyPlan } from "@/lib/ai/types";

const STORAGE_PREFIX = "fitmarket:shopping-checklist";

export function buildPlanFingerprint(plan: WeeklyPlan): string {
  const signature = plan.shopping_list
    .map(
      (item) =>
        `${item.store_id}|${item.name}|${item.quantity}|${item.estimated_price_cop}`,
    )
    .join("\n");

  let hash = 5381;

  for (let i = 0; i < signature.length; i++) {
    hash = (hash * 33) ^ signature.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
}

export function getChecklistStorageKey(
  userId: string,
  planFingerprint: string,
): string {
  return `${STORAGE_PREFIX}:${userId}:${planFingerprint}`;
}

export function loadCheckedIndices(storageKey: string, itemCount: number): Set<number> {
  if (typeof window === "undefined" || itemCount === 0) {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return new Set();
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const valid = parsed
      .map((value) =>
        typeof value === "number" ? value : parseInt(String(value), 10),
      )
      .filter(
        (index) =>
          Number.isInteger(index) && index >= 0 && index < itemCount,
      );

    return new Set(valid);
  } catch {
    return new Set();
  }
}

export function saveCheckedIndices(
  storageKey: string,
  checked: Set<number>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload = [...checked].sort((a, b) => a - b);

  window.localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function calcChecklistProgress(checked: number, total: number): {
  checked: number;
  total: number;
  percent: number;
} {
  if (total <= 0) {
    return { checked: 0, total: 0, percent: 0 };
  }

  const percent = Math.round((checked / total) * 100);

  return { checked, total, percent };
}
