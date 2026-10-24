import { TrendingUp } from "lucide-react";
import type { WeeklyPlan } from "@/lib/ai/types";
import { buildBudgetIncreaseRecommendations } from "@/lib/budgetRecommendations";
import { useI18n } from "@/i18n/I18nProvider";
import { Card } from "@/app/ui";

interface Props {
  plan: WeeklyPlan | null;
  weeklyBudgetCop: number | null | undefined;
}

export function BudgetRecommendationsSection({ plan, weeklyBudgetCop }: Props) {
  const { t, formatCurrency } = useI18n();
  const scenarios = buildBudgetIncreaseRecommendations(weeklyBudgetCop);
  const hasPlan = plan != null && plan.shopping_list.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <TrendingUp size={17} className="text-brand-600" aria-hidden />
          {t("market.whatIf")}
        </h2>
        <p className="text-[13px] text-ink-500">{t("market.whatIfNote")}</p>
      </div>

      {!hasPlan || !scenarios ? (
        <Card>
          <p className="text-sm leading-relaxed text-ink-500">
            {t(hasPlan ? "market.whatIfNoBudget" : "market.whatIfNoPlan")}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-ink-100 p-0">
          {scenarios.map((scenario) => (
            <div key={scenario.increaseCop} className="px-4 py-3.5">
              <p className="text-sm font-bold text-brand-700">
                +{formatCurrency(scenario.increaseCop)}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-ink-600">
                {t(scenario.benefitKey)}
              </p>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
