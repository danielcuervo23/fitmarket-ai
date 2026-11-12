import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { saveWeeklyBudget } from "@/lib/budget";
import {
  budgetIssue,
  budgetMinimumMessage,
  thousandsSuggestion,
} from "@/lib/budgetSuggestion";
import { useHouseholdSize } from "@/hooks/useHouseholdSize";
import type { ErrorKey } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
  TextField,
} from "@/app/ui";

interface Props {
  onNext: (budget: number) => void;
  onBack: () => void;
}

// All at or above the one-person minimum (130 000); bigger households see the minimum message.
const PRESETS = [130_000, 150_000, 200_000, 250_000] as const;
const MAX_BUDGET_COP = 20_000_000;

export function BudgetScreen({ onNext, onBack }: Props) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const [preset, setPreset] = useState<number | null>(150_000);
  const [custom, setCustom] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const customAmount = Number(custom.replace(/\D/g, "")) || 0;
  const usingCustom = custom.trim() !== "";
  const budget = Math.min(
    usingCustom ? customAmount : (preset ?? 0),
    MAX_BUDGET_COP,
  );

  // The household was asked on the profile screen, before this one.
  const householdSize = useHouseholdSize();
  const minimum = budgetMinimumMessage(householdSize);
  const issue = budgetIssue(usingCustom ? customAmount : budget, householdSize);
  const suggestion = usingCustom ? thousandsSuggestion(customAmount, householdSize) : null;
  const issueText =
    issue === "too_low"
      ? t(minimum.key, { amount: formatCurrency(minimum.amount), perPerson: formatCurrency(minimum.perPerson) })
      : issue === "too_high"
        ? t("budget.tooHigh")
        : null;

  const handleContinue = async () => {
    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await saveWeeklyBudget(budget);

      if (error) {
        setErrorKey(error);
        return;
      }

      onNext(budget);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        step={{ current: 3, total: 5 }}
        title={t("budget.title")}
        subtitle={t("budget.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <ScreenBody className="flex flex-col gap-5 pb-6">
        <section
          aria-live="polite"
          className="flex flex-col gap-1 rounded-card bg-brand-900 p-5 text-white shadow-float"
        >
          <p className="text-[13px] font-medium text-brand-200">
            {t("budget.selected")}
          </p>
          <p className="text-4xl font-extrabold tabular-nums tracking-tight">
            {budget > 0 ? formatCurrency(budget) : "—"}
          </p>
          {budget > 0 && (
            <p className="text-xs text-brand-200/80">
              {t("budget.breakdown", {
                perDay: formatCurrency(Math.round(budget / 7)),
                perMeal: formatCurrency(Math.round(budget / 21)),
              })}
            </p>
          )}
        </section>

        <div
          role="radiogroup"
          aria-label={t("budget.selected")}
          className="grid grid-cols-2 gap-3"
        >
          {PRESETS.map((value) => {
            const selected = !usingCustom && preset === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={isLoading}
                onClick={() => {
                  setPreset(value);
                  setCustom("");
                  setErrorKey(null);
                }}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-card border bg-white py-4 transition-all active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  selected
                    ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
                    : "border-ink-200",
                )}
              >
                <span
                  className={cn(
                    "text-lg font-extrabold tabular-nums",
                    selected ? "text-brand-800" : "text-ink-900",
                  )}
                >
                  {formatCurrency(value)}
                </span>
                <span className="text-xs text-ink-500">{t("budget.perWeek")}</span>
              </button>
            );
          })}
        </div>

        <TextField
          label={t("budget.custom")}
          inputMode="numeric"
          icon={<span className="text-sm font-bold">$</span>}
          placeholder={t("budget.customPlaceholder")}
          hint={t("budget.currencyNote")}
          error={issueText}
          value={custom}
          disabled={isLoading}
          onChange={(event) => {
            setCustom(event.target.value);
            setErrorKey(null);
          }}
        />
        {suggestion && (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setCustom(formatNumber(suggestion))}
            className="-mt-2 w-fit rounded-full border border-brand-600 bg-brand-50 px-3.5 py-1.5 text-[13px] font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {t("budget.didYouMean", { amount: formatCurrency(suggestion) })}
          </button>
        )}
      </ScreenBody>

      <ScreenFooter>
        {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
        <Button
          size="lg"
          full
          loading={isLoading}
          disabled={budget === 0 || issue !== null}
          onClick={handleContinue}
        >
          {t("common.continue")}
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden />
        </Button>
      </ScreenFooter>
    </Screen>
  );
}
