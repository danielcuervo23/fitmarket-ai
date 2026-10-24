import { useState } from "react";
import {
  Apple,
  ArrowLeft,
  Coffee,
  Eye,
  Moon,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { usePlan } from "@/contexts/PlanContext";
import type {
  DayId,
  DayMenu,
  MealSlot,
  WeeklyMenu,
  WeeklyPlan,
} from "@/lib/ai/types";
import { DAY_IDS, isDayId } from "@/lib/ai/types";
import { saveWeeklyPlan } from "@/lib/weeklyPlans";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Screen,
  ScreenBody,
} from "@/app/ui";
import { BottomNav, type NavTab } from "./BottomNav";

interface Props {
  onTabChange?: (tab: NavTab) => void;
  onGeneratePlan?: () => void;
  /** Plan to show (history). If omitted, the plan from context is used. */
  viewPlan?: WeeklyPlan;
  readOnly?: boolean;
  onBack?: () => void;
  onReturnToCurrent?: () => void;
  headerTitle?: string;
  headerDateLabel?: string;
}

const MEALS: { key: MealSlot; icon: LucideIcon }[] = [
  { key: "desayuno", icon: Coffee },
  { key: "almuerzo", icon: Utensils },
  { key: "cena", icon: Moon },
  { key: "snacks", icon: Apple },
];

const WEEKDAY_TO_DAY_ID: Record<number, DayId> = {
  0: "dom",
  1: "lun",
  2: "mar",
  3: "mie",
  4: "jue",
  5: "vie",
  6: "sab",
};

function getInitialActiveDay(weeklyMenu: WeeklyMenu | undefined): DayId {
  const today = WEEKDAY_TO_DAY_ID[new Date().getDay()];

  return weeklyMenu && isDayId(today) && weeklyMenu[today] ? today : "lun";
}

export function WeeklyMenuScreen({
  onTabChange,
  onGeneratePlan,
  viewPlan,
  readOnly = false,
  onBack,
  onReturnToCurrent,
  headerTitle,
  headerDateLabel,
}: Props) {
  const { t, language, formatNumber } = useI18n();
  const { plan: contextPlan, hasUnsavedPlan, setHasUnsavedPlan } = usePlan();
  const plan = viewPlan ?? contextPlan;
  const [activeDay, setActiveDay] = useState<DayId>(() =>
    getInitialActiveDay(plan?.weekly_menu),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const title = headerTitle ?? t("menu.title");
  const nav = onTabChange && <BottomNav active="menu" onChange={onTabChange} />;

  const handleGenerate = () => {
    if (onGeneratePlan) {
      onGeneratePlan();
    } else {
      onTabChange?.("dashboard");
    }
  };

  const handleSaveNow = async () => {
    if (!plan) {
      return;
    }

    setIsSaving(true);
    setSaveFailed(false);

    const { error } = await saveWeeklyPlan(plan);

    setIsSaving(false);

    if (error) {
      setSaveFailed(true);
      return;
    }

    setHasUnsavedPlan(false);
  };

  if (!plan) {
    return (
      <Screen>
        <header className="px-6 pb-4 pt-14">
          <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
        </header>
        <ScreenBody className="pb-28">
          <EmptyState
            icon={<Sparkles size={26} />}
            title={t("menu.emptyTitle")}
            body={t("menu.emptyBody")}
            action={
              <Button onClick={handleGenerate}>{t("menu.generate")}</Button>
            }
          />
        </ScreenBody>
        {nav}
      </Screen>
    );
  }

  // Newer plans carry the menu in both languages; older ones only in Spanish.
  const hasEnglishMenu = plan.weekly_menu_en !== undefined;
  const menuSource =
    language === "en" && plan.weekly_menu_en
      ? plan.weekly_menu_en
      : plan.weekly_menu;
  const dayMenu: DayMenu = menuSource[activeDay];
  const kcal = formatNumber(plan.summary.estimated_daily_kcal);
  const subtitle = headerDateLabel
    ? t("menu.subtitleWithDate", { date: headerDateLabel, kcal })
    : t("menu.subtitle", { kcal });

  return (
    <Screen>
      <header className="flex flex-col gap-1 px-6 pb-3 pt-14">
        {readOnly && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 mb-2 flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            <ArrowLeft size={16} aria-hidden />
            {t("menu.backToHistory")}
          </button>
        )}
        <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-500">{subtitle}</p>
      </header>

      <div
        role="tablist"
        aria-label={title}
        className="grid grid-cols-7 gap-1.5 px-5 pb-3"
      >
        {DAY_IDS.map((day) => {
          const isActive = activeDay === day;

          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveDay(day)}
              className={cn(
                "rounded-xl border py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-600",
                isActive
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
              )}
            >
              {t(`dayShort.${day}`)}
            </button>
          );
        })}
      </div>

      <ScreenBody className="flex flex-col gap-4 pb-28">
        {hasUnsavedPlan && !readOnly && (
          <Alert tone="warning">
            <p>{t("menu.unsaved")}</p>
            {saveFailed && (
              <p className="mt-1 font-semibold">{t("errors.save")}</p>
            )}
            <button
              type="button"
              onClick={() => void handleSaveNow()}
              disabled={isSaving}
              className="mt-2 font-bold underline disabled:opacity-60"
            >
              {t("menu.saveNow")}
            </button>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t(`day.${activeDay}`)}</h2>
            <p className="text-[13px] text-ink-500">
              {t("menu.dayInfo", { kcal })}
            </p>
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
              readOnly
                ? "bg-ink-100 text-ink-600"
                : "bg-brand-50 text-brand-700",
            )}
          >
            {readOnly && <Eye size={13} aria-hidden />}
            {readOnly ? t("menu.readOnly") : t("menu.active")}
          </span>
        </div>

        {MEALS.map(({ key, icon: Icon }) => {
          const dish = plan.dish_names?.[activeDay]?.[key]?.[language];

          return (
          <Card key={key} className="flex flex-col gap-3 p-0">
            <div className="flex items-start gap-3 border-b border-ink-100 px-4 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Icon size={17} aria-hidden />
              </span>
              <div className="min-w-0">
                {dish && (
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">
                    {t(`meal.${key}`)}
                  </p>
                )}
                <h3 className="text-[16px] font-bold leading-snug text-ink-900">
                  {dish ?? t(`meal.${key}`)}
                </h3>
              </div>
            </div>
            <p className="px-4 text-xs font-semibold text-ink-500">
              {t("menu.ingredients")}
            </p>
            <ul className="-mt-1 flex flex-col gap-2 px-4 pb-4">
              {dayMenu[key].map((item, index) => (
                <li
                  key={`${key}-${index}`}
                  className="flex items-start gap-3 text-[14px] leading-snug text-ink-700"
                >
                  <span
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-400"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          );
        })}

        {language !== "es" && !hasEnglishMenu && (
          <p className="text-center text-xs text-ink-400">
            {t("menu.contentNote")}
          </p>
        )}

        {readOnly && (onReturnToCurrent ?? onBack) ? (
          <Button size="lg" full onClick={onReturnToCurrent ?? onBack}>
            {t("menu.backToCurrent")}
          </Button>
        ) : (
          onGeneratePlan && (
            <Button variant="secondary" size="lg" full onClick={onGeneratePlan}>
              {t("menu.regenerate")}
            </Button>
          )
        )}
      </ScreenBody>

      {nav}
    </Screen>
  );
}
