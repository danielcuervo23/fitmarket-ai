import { useState } from "react";
import { ChevronDown, Store } from "lucide-react";
import type { WeeklyPlan } from "@/lib/ai/types";
import type { DashboardSupermarket } from "@/lib/dashboard";
import { storeDisplayName } from "@/lib/formatCop";
import { groupShoppingListByStore } from "@/lib/shoppingListGroups";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { Card } from "@/app/ui";
import { ShoppingChecklistItem } from "./ShoppingChecklistItem";
import { ShoppingProgressBar } from "./ShoppingProgressBar";

interface ChecklistApi {
  isChecked: (listIndex: number) => boolean;
  toggleItem: (listIndex: number) => void;
  getStoreProgress: (listIndices: number[]) => {
    checked: number;
    total: number;
    percent: number;
  };
}

interface Props {
  plan: WeeklyPlan;
  supermarkets: DashboardSupermarket[];
  checklist: ChecklistApi;
}

export function StoreShoppingPlanSection({
  plan,
  supermarkets,
  checklist,
}: Props) {
  const { t, plural, formatCurrency } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const groups = groupShoppingListByStore(
    plan.shopping_list,
    supermarkets.map((store) => store.id),
  );

  const toggle = (storeId: string) =>
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        next.add(storeId);
      }

      return next;
    });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-bold">{t("market.byStore")}</h2>
        <p className="text-[13px] text-ink-500">{t("market.byStoreHint")}</p>
      </div>

      {groups.map((group) => {
        const isOpen = expanded.has(group.storeId);
        const name = storeDisplayName(group.storeId, supermarkets);
        const progress = checklist.getStoreProgress(
          group.items.map((item) => item.listIndex),
        );
        const panelId = `store-panel-${group.storeId}`;

        return (
          <Card key={group.storeId} className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => toggle(group.storeId)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-start gap-3.5 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Store size={19} aria-hidden />
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-bold text-ink-900">
                    {name}
                  </span>
                  <span className="text-[13px] text-ink-500">
                    {plural("plural.product", group.itemCount)} ·{" "}
                    {t("market.estimatedCost")}{" "}
                    <strong className="font-bold text-ink-900">
                      {formatCurrency(group.subtotalCop)}
                    </strong>
                  </span>
                </span>
                <ShoppingProgressBar
                  label={t("market.progress")}
                  checked={progress.checked}
                  total={progress.total}
                  percent={progress.percent}
                />
              </span>

              <span className="flex shrink-0 flex-col items-center gap-0.5 pt-1 text-ink-400">
                <ChevronDown
                  size={18}
                  className={cn("transition-transform", isOpen && "rotate-180")}
                  aria-hidden
                />
                <span className="text-[10px] font-semibold">
                  {isOpen ? t("market.collapse") : t("market.expand")}
                </span>
              </span>
            </button>

            {isOpen && (
              <div id={panelId} role="group" aria-label={name}>
                {group.items.map((item) => (
                  <ShoppingChecklistItem
                    key={`${group.storeId}-${item.listIndex}`}
                    item={item}
                    checked={checklist.isChecked(item.listIndex)}
                    onToggle={() => checklist.toggleItem(item.listIndex)}
                  />
                ))}
                <div className="flex items-center justify-between border-t border-ink-100 bg-brand-50 px-4 py-3">
                  <span className="text-[13px] font-semibold text-brand-800">
                    {t("market.subtotal")}
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-brand-800">
                    {formatCurrency(group.subtotalCop)}
                  </span>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <div className="flex items-center justify-between rounded-card bg-brand-50 px-4 py-3.5">
        <span className="text-[13px] font-semibold text-brand-800">
          {t("market.planTotal")}
        </span>
        <span className="text-base font-extrabold tabular-nums text-brand-800">
          {formatCurrency(plan.summary.estimated_total_cop)}
        </span>
      </div>
    </section>
  );
}
