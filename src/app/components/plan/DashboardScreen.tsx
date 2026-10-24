import {
  CalendarDays,
  ChevronRight,
  ShoppingCart,
  Sparkles,
  Store,
  Target,
  type LucideIcon,
} from "lucide-react";
import { usePlan } from "@/contexts/PlanContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import type { WeeklyPlan } from "@/lib/ai/types";
import type { DashboardData } from "@/lib/dashboard";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  ScreenBody,
} from "@/app/ui";
import { BottomNav, type NavTab } from "../shared/BottomNav";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onGeneratePlan?: () => void;
}

export function DashboardScreen({ onTabChange, onGeneratePlan }: Props) {
  const { t } = useI18n();
  const { plan } = usePlan();
  const { data, isLoading, errorKey, reload } = useDashboardData();

  if (isLoading || errorKey || !data) {
    return (
      <Screen>
        {errorKey ? (
          <ErrorState message={t(errorKey)} onRetry={() => void reload()} />
        ) : (
          <LoadingState message={t("dashboard.loading")} />
        )}
        <BottomNav active="dashboard" onChange={onTabChange} />
      </Screen>
    );
  }

  return (
    <DashboardView
      data={data}
      plan={plan}
      onTabChange={onTabChange}
      onGeneratePlan={onGeneratePlan}
    />
  );
}

interface ViewProps extends Props {
  data: DashboardData;
  plan: WeeklyPlan | null;
}

/** Presentational dashboard; split from the container so it can be previewed. */
export function DashboardView({
  data,
  plan,
  onTabChange,
  onGeneratePlan,
}: ViewProps) {
  const { t, plural, formatCurrency, formatNumber } = useI18n();

  const firstName = data.displayName.split(" ")[0];
  const budget = data.weeklyBudgetCop;
  const hasPlan = plan != null && plan.shopping_list.length > 0;

  const planTotal = hasPlan ? plan.summary.estimated_total_cop : 0;
  const usedPercent =
    hasPlan && budget ? Math.round((planTotal / budget) * 100) : null;
  const overBy = hasPlan && budget && planTotal > budget ? planTotal - budget : 0;

  return (
    <Screen>
      <header className="flex items-center justify-between gap-4 px-6 pb-4 pt-14">
        <div className="min-w-0">
          <p className="text-sm text-ink-500">{t("dashboard.subtitle")}</p>
          <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight">
            {t("dashboard.greeting", { name: firstName })}
          </h1>
        </div>
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-800"
        >
          {firstName.charAt(0).toUpperCase()}
        </span>
      </header>

      <ScreenBody className="flex flex-col gap-5 pb-28">
        <section className="flex flex-col gap-3 rounded-card bg-brand-900 p-5 text-white shadow-float">
          <p className="text-[13px] font-medium text-brand-200">
            {t("dashboard.budget")}
          </p>
          <p className="text-4xl font-extrabold tabular-nums tracking-tight">
            {budget ? formatCurrency(budget) : "—"}
          </p>

          {!budget && (
            <p className="text-xs text-brand-200/80">
              {t("dashboard.budgetMissing")}
            </p>
          )}

          {usedPercent !== null && (
            <div className="flex flex-col gap-2 pt-1">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(usedPercent, 100)}
                aria-label={t("dashboard.budgetUsed", { percent: usedPercent })}
                className="h-2 overflow-hidden rounded-full bg-white/15"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    overBy > 0 ? "bg-warning-100" : "bg-brand-300",
                  )}
                  style={{ width: `${Math.min(usedPercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between gap-3 text-xs text-brand-200">
                <span>
                  {t("dashboard.planTotal", { amount: formatCurrency(planTotal) })}
                </span>
                <span className="font-semibold">
                  {overBy > 0
                    ? t("dashboard.overBudget", { amount: formatCurrency(overBy) })
                    : t("dashboard.budgetUsed", { percent: usedPercent })}
                </span>
              </div>
            </div>
          )}
        </section>

        {hasPlan ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold text-ink-500">
              {t("dashboard.summary")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label={t("dashboard.products")}
                value={String(plan.shopping_list.length)}
              />
              <Stat
                label={t("dashboard.estimatedTotal")}
                value={formatCurrency(planTotal)}
              />
              <Stat
                label={t("dashboard.dailyKcal")}
                value={t("dashboard.kcalValue", {
                  value: formatNumber(plan.summary.estimated_daily_kcal),
                })}
              />
              <Stat
                label={t("dashboard.stores")}
                value={String(data.supermarkets.length)}
              />
            </div>
          </section>
        ) : (
          <Card>
            <EmptyState
              icon={<Sparkles size={26} />}
              title={t("dashboard.noPlanTitle")}
              body={t("dashboard.noPlanBody")}
              action={
                onGeneratePlan && (
                  <Button onClick={onGeneratePlan}>
                    <Sparkles size={16} aria-hidden />
                    {t("dashboard.generate")}
                  </Button>
                )
              }
            />
          </Card>
        )}

        <Chips
          icon={Target}
          title={t("dashboard.goals")}
          emptyText={t("dashboard.noGoals")}
          items={data.goals.map((goal) => t(`goal.${goal.id}`))}
        />

        <Chips
          icon={Store}
          title={t("dashboard.storesTitle")}
          emptyText={t("dashboard.noStores")}
          items={data.supermarkets.map((store) => store.name)}
        />

        <section className="flex flex-col gap-3">
          <ActionRow
            icon={CalendarDays}
            title={t("dashboard.viewMenu")}
            description={t("dashboard.viewMenuDesc")}
            onClick={() => onTabChange("menu")}
          />
          <ActionRow
            icon={ShoppingCart}
            title={t("dashboard.goMarket")}
            description={
              hasPlan
                ? `${t("dashboard.goMarketDesc")} · ${plural("plural.product", plan.shopping_list.length)}`
                : t("dashboard.goMarketDesc")
            }
            onClick={() => onTabChange("market")}
          />
          {hasPlan && onGeneratePlan && (
            <Button variant="secondary" size="lg" full onClick={onGeneratePlan}>
              <Sparkles size={18} aria-hidden />
              {t("dashboard.regenerate")}
            </Button>
          )}
        </section>
      </ScreenBody>

      <BottomNav active="dashboard" onChange={onTabChange} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-ink-500">{label}</span>
      <span className="truncate text-lg font-extrabold tabular-nums tracking-tight">
        {value}
      </span>
    </Card>
  );
}

function Chips({
  icon: Icon,
  title,
  emptyText,
  items,
}: {
  icon: LucideIcon;
  title: string;
  emptyText: string;
  items: string[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-500">
        <Icon size={15} aria-hidden />
        {title}
      </h2>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-800"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-400">{emptyText}</p>
      )}
    </section>
  );
}

function ActionRow({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-card border border-ink-100 bg-white p-4 text-left shadow-card transition-all hover:border-ink-200 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon size={20} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold text-ink-900">{title}</span>
        <span className="truncate text-[13px] text-ink-500">{description}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-300" aria-hidden />
    </button>
  );
}
