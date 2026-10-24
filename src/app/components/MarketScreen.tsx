import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useShoppingChecklist } from "@/hooks/useShoppingChecklist";
import type { WeeklyPlan } from "@/lib/ai/types";
import type { DashboardData } from "@/lib/dashboard";
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
import { BottomNav, type NavTab } from "./BottomNav";
import { BudgetRecommendationsSection } from "./market/BudgetRecommendationsSection";
import { ShoppingProgressBar } from "./market/ShoppingProgressBar";
import { StoreShoppingPlanSection } from "./market/StoreShoppingPlanSection";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onGeneratePlan?: () => void;
}

export function MarketScreen({ onTabChange, onGeneratePlan }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { plan } = usePlan();
  const { data, isLoading, errorKey, reload } = useDashboardData();

  if (isLoading || errorKey || !data) {
    return (
      <Screen>
        {errorKey ? (
          <ErrorState message={t(errorKey)} onRetry={() => void reload()} />
        ) : (
          <LoadingState message={t("market.loading")} />
        )}
        <BottomNav active="market" onChange={onTabChange} />
      </Screen>
    );
  }

  return (
    <MarketView
      data={data}
      plan={plan}
      userId={user?.id}
      onTabChange={onTabChange}
      onGeneratePlan={onGeneratePlan}
    />
  );
}

interface ViewProps extends Props {
  data: DashboardData;
  plan: WeeklyPlan | null;
  userId: string | undefined;
}

/** Presentational market screen; split from the container for previews. */
export function MarketView({
  data,
  plan,
  userId,
  onTabChange,
  onGeneratePlan,
}: ViewProps) {
  const { t, plural, formatCurrency } = useI18n();
  const checklist = useShoppingChecklist(plan, userId);
  const itemCount = plan?.shopping_list.length ?? 0;

  const handleGenerate = () => {
    if (onGeneratePlan) {
      onGeneratePlan();
    } else {
      onTabChange("dashboard");
    }
  };

  return (
    <Screen>
      <header className="flex flex-col gap-1 px-6 pb-4 pt-14">
        <h1 className="text-[26px] font-extrabold tracking-tight">
          {t("market.title")}
        </h1>
        <p className="text-sm text-ink-500">{t("market.subtitle")}</p>
      </header>

      <ScreenBody className="flex flex-col gap-5 pb-28">
        {plan && itemCount > 0 ? (
          <section className="flex flex-col gap-4 rounded-card bg-brand-900 p-5 text-white shadow-float">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-200">
                <ShoppingCart size={20} aria-hidden />
              </span>
              <div>
                <p className="text-[13px] font-medium text-brand-200">
                  {t("market.totalEstimated")}
                </p>
                <p className="text-2xl font-extrabold tabular-nums tracking-tight">
                  {formatCurrency(plan.summary.estimated_total_cop)}
                </p>
                <p className="text-xs text-brand-200/80">
                  {plural("plural.product", itemCount)}
                </p>
              </div>
            </div>

            {checklist.hasPlan && (
              <ShoppingProgressBar
                tone="onDark"
                label={t("market.progress")}
                checked={checklist.overallProgress.checked}
                total={checklist.overallProgress.total}
                percent={checklist.overallProgress.percent}
              />
            )}
          </section>
        ) : (
          <Card>
            <EmptyState
              icon={<ShoppingCart size={26} />}
              title={t("market.title")}
              body={t("market.noPlan")}
              action={
                <Button onClick={handleGenerate}>{t("market.generate")}</Button>
              }
            />
          </Card>
        )}

        {plan && itemCount > 0 && (
          <StoreShoppingPlanSection
            plan={plan}
            supermarkets={data.supermarkets}
            checklist={checklist}
          />
        )}

        <BudgetRecommendationsSection
          plan={plan}
          weeklyBudgetCop={data.weeklyBudgetCop}
        />
      </ScreenBody>

      <BottomNav active="market" onChange={onTabChange} />
    </Screen>
  );
}
