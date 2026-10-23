import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { BudgetTooLowGenerationError } from "@/lib/ai/generateWeeklyPlan";
import {
  MAX_WEEKLY_BUDGET_COP,
  parseBudgetInput,
  suggestBudget,
} from "@/lib/budgetSuggestion";
import type { ErrorKey } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert, Button, Card, Screen, TextField } from "@/app/ui";

interface Props {
  error: BudgetTooLowGenerationError;
  /** Saves the new budget and starts a new generation; returns an error key. */
  onSaveAndRegenerate: (budgetCop: number) => Promise<ErrorKey | null>;
  onRetry: () => void;
  onAdjustSettings: () => void;
}

/**
 * Shown when the plan does not fit the budget. Lets the user raise it and
 * regenerate without leaving the screen.
 */
export function BudgetShortfallPanel({
  error,
  onSaveAndRegenerate,
  onRetry,
  onAdjustSettings,
}: Props) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const recommended = suggestBudget(error.currentBudget, error.requiredBudget);
  const [input, setInput] = useState(formatNumber(recommended));
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const amount = parseBudgetInput(input);
  const tooHigh = amount > MAX_WEEKLY_BUDGET_COP;
  const canSubmit = amount > error.currentBudget && !tooHigh;

  const quickOptions = [
    { label: t("gen.shortfall.recommended"), value: recommended },
    { label: `+${formatCurrency(10_000)}`, value: error.currentBudget + 10_000 },
    { label: `+${formatCurrency(20_000)}`, value: error.currentBudget + 20_000 },
  ];

  const handleSubmit = async () => {
    setErrorKey(null);
    setIsSaving(true);

    try {
      const failure = await onSaveAndRegenerate(amount);

      // On success the parent switches to the "generating" view, so this
      // component simply unmounts; only a failure needs handling here.
      if (failure) {
        setErrorKey(failure);
      }
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen className="gap-5 overflow-y-auto px-6 pb-8 pt-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-warning-50 text-warning-600">
          <AlertTriangle size={26} aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t("gen.budgetTitle")}
        </h1>
        <p className="text-[15px] leading-snug text-ink-500">
          {t("gen.shortfall.intro")}
        </p>
      </div>

      <Card className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-ink-500">{t("gen.currentBudget")}</span>
          <span className="font-bold tabular-nums">
            {formatCurrency(error.currentBudget)}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-ink-500">{t("gen.requiredBudget")}</span>
          <span className="font-bold tabular-nums">
            {formatCurrency(error.requiredBudget)}
          </span>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <TextField
          label={t("gen.shortfall.newBudget")}
          inputMode="numeric"
          icon={<span className="text-sm font-bold">$</span>}
          hint={t("gen.shortfall.hint")}
          error={tooHigh ? t("errors.budgetInvalid") : null}
          value={input}
          disabled={isSaving}
          onChange={(event) => {
            setInput(event.target.value);
            setErrorKey(null);
          }}
        />

        <div className="flex flex-wrap gap-2">
          {quickOptions.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              disabled={isSaving}
              onClick={() => setInput(formatNumber(value))}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-600",
                amount === value
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
              )}
            >
              {label}
              {label === t("gen.shortfall.recommended") &&
                ` · ${formatCurrency(value)}`}
            </button>
          ))}
        </div>
      </div>

      {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}

      <div className="mt-auto flex flex-col gap-3">
        <Button
          size="lg"
          full
          loading={isSaving}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          <RefreshCw size={18} aria-hidden />
          {t("gen.shortfall.saveAndRegenerate")}
        </Button>
        <Button
          variant="secondary"
          full
          disabled={isSaving}
          onClick={onRetry}
        >
          {t("gen.shortfall.retrySame")}
        </Button>
        <Button variant="ghost" full disabled={isSaving} onClick={onAdjustSettings}>
          {t("gen.adjust")}
        </Button>
      </div>
    </Screen>
  );
}
