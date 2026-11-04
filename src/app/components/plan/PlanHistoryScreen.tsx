import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, FileText, History } from "lucide-react";
import type { WeeklyPlan } from "@/lib/ai/types";
import type { ErrorKey } from "@/lib/errors";
import {
  fetchWeeklyPlanById,
  fetchWeeklyPlansHistory,
  type WeeklyPlanHistoryItem,
} from "@/lib/weeklyPlans";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  ScreenBody,
  ScreenHeader,
} from "@/app/ui";
import { WeeklyMenuScreen } from "./WeeklyMenuScreen";

interface Props {
  onBack: () => void;
  onViewCurrentPlan: () => void;
}

export function PlanHistoryScreen({ onBack, onViewCurrentPlan }: Props) {
  const { t, plural, formatCurrency, formatNumber, formatDate } = useI18n();
  const [items, setItems] = useState<WeeklyPlanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [detailError, setDetailError] = useState<ErrorKey | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  // Pagination: the next page to ask for, and whether there is one.
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<ErrorKey | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setLoadMoreError(null);

    const { data, error } = await fetchWeeklyPlansHistory(0);

    if (error || !data) {
      setErrorKey(error ?? "errors.load");
      setItems([]);
      setHasMore(false);
    } else {
      setItems(data.items);
      setHasMore(data.hasMore);
      setNextPage(1);
    }

    setIsLoading(false);
  }, []);

  const loadMore = async () => {
    if (isLoadingMore) return;

    setIsLoadingMore(true);
    setLoadMoreError(null);

    const { data, error } = await fetchWeeklyPlansHistory(nextPage);

    setIsLoadingMore(false);

    if (error || !data) {
      setLoadMoreError(error ?? "errors.load");
      return;
    }

    // Appends without reloading earlier pages. Skips ids already shown, in
    // case a new plan was saved meanwhile and shifted the rows by one.
    setItems((previous) => {
      const seen = new Set(previous.map((item) => item.id));
      return [...previous, ...data.items.filter((item) => !seen.has(item.id))];
    });
    setHasMore(data.hasMore);
    setNextPage((page) => page + 1);
  };

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleOpenPlan = async (item: WeeklyPlanHistoryItem) => {
    if (item.is_current) {
      onViewCurrentPlan();
      return;
    }

    setDetailError(null);
    setSelectedDate(formatDate(item.created_at));
    setIsLoadingDetail(true);
    setSelectedPlan(null);

    const { data, error } = await fetchWeeklyPlanById(item.id);

    setIsLoadingDetail(false);

    if (error || !data) {
      setDetailError(error ?? "errors.load");
      setSelectedDate(null);
      return;
    }

    setSelectedPlan(data);
  };

  const handleCloseDetail = () => {
    setSelectedPlan(null);
    setSelectedDate(null);
  };

  if (isLoadingDetail) {
    return (
      <Screen>
        <LoadingState message={t("history.loadingPlan")} />
      </Screen>
    );
  }

  if (selectedPlan) {
    return (
      <WeeklyMenuScreen
        viewPlan={selectedPlan}
        readOnly
        onBack={handleCloseDetail}
        onReturnToCurrent={onViewCurrentPlan}
        headerTitle={t("menu.previousPlan")}
        headerDateLabel={selectedDate ?? undefined}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t("history.title")}
        subtitle={t("history.subtitle")}
        onBack={onBack}
      />

      <ScreenBody className="flex flex-col gap-3 pb-10">
        {detailError && <Alert tone="error">{t(detailError)}</Alert>}

        {isLoading ? (
          <LoadingState message={t("history.loading")} />
        ) : errorKey ? (
          <ErrorState message={t(errorKey)} onRetry={() => void loadHistory()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<History size={26} />}
            title={t("history.empty")}
            body={t("history.emptyBody")}
          />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void handleOpenPlan(item)}
              className={cn(
                "flex w-full items-center gap-3.5 rounded-card border bg-white p-4 text-left shadow-card transition-all active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-brand-600",
                item.is_current ? "border-brand-300" : "border-ink-100",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  item.is_current
                    ? "bg-brand-100 text-brand-700"
                    : "bg-ink-100 text-ink-500",
                )}
              >
                {item.is_current ? (
                  <CheckCircle2 size={20} aria-hidden />
                ) : (
                  <FileText size={20} aria-hidden />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-bold">
                    {item.is_current
                      ? t("history.current")
                      : t("history.previous")}
                  </span>
                  {item.is_current && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                      {t("history.active")}
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-medium text-ink-500">
                  {formatDate(item.created_at)}
                </span>
                <span className="text-[13px] text-ink-700">
                  {formatCurrency(item.estimated_total_cop)} ·{" "}
                  {plural("plural.product", item.product_count)} ·{" "}
                  {t("history.kcalPerDay", {
                    kcal: formatNumber(item.estimated_daily_kcal),
                  })}
                </span>
              </span>

              <ChevronRight
                size={18}
                className="shrink-0 text-ink-300"
                aria-hidden
              />
            </button>
          ))
        )}

        {!isLoading && !errorKey && items.length > 0 && (
          <>
            {/* On error the button stays, so tapping it again retries. */}
            {loadMoreError && <Alert tone="error">{t(loadMoreError)}</Alert>}
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
                className="mt-1 w-full rounded-card border border-ink-100 bg-white p-3.5 text-[14px] font-bold text-brand-700 shadow-card transition-all active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                {isLoadingMore
                  ? t("history.loadingMore")
                  : t("history.loadMore")}
              </button>
            )}
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
