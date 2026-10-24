import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { BudgetTooLowGenerationError } from "@/lib/ai/generateWeeklyPlan";
import {
  budgetIssue,
  MIN_WEEKLY_BUDGET_COP,
  parseBudgetInput,
  suggestBudget,
} from "@/lib/budgetSuggestion";
import type { ErrorKey } from "@/lib/errors";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert, Button, Card, ProblemScreen } from "@/app/ui";
import { BudgetEditor } from "./BudgetEditor";

interface Props {
  error: BudgetTooLowGenerationError;
  /** Saves the new budget and starts a new generation; returns an error key. */
  onSaveAndRegenerate: (budgetCop: number) => Promise<ErrorKey | null>;
  onRetry: () => void;
  onAdjustSettings: () => void;
}

/**
 * Shown when the plan does not fit the budget. Explains it in numbers and lets
 * the user raise the budget and regenerate without leaving the screen.
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
  const canSubmit = amount > error.currentBudget && budgetIssue(amount) === null;

  const options = [
    { label: `${t("gen.shortfall.recommended")} · ${formatCurrency(recommended)}`, value: recommended },
    { label: `+${formatCurrency(10_000)}`, value: error.currentBudget + 10_000 },
    { label: `+${formatCurrency(20_000)}`, value: error.currentBudget + 20_000 },
  ].filter((option) => option.value >= MIN_WEEKLY_BUDGET_COP);

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
    <ProblemScreen
      title={t("gen.budgetTitle")}
      body={t("gen.shortfall.intro")}
      actions={
        <>
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
          <Button variant="secondary" full disabled={isSaving} onClick={onRetry}>
            {t("gen.shortfall.retrySame")}
          </Button>
          <Button variant="ghost" full disabled={isSaving} onClick={onAdjustSettings}>
            {t("gen.adjust")}
          </Button>
        </>
      }
    >
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

      <BudgetEditor
        label={t("gen.shortfall.newBudget")}
        value={input}
        onChange={(value) => {
          setInput(value);
          setErrorKey(null);
        }}
        options={options}
        hint={t("gen.shortfall.hint")}
        disabled={isSaving}
      />

      {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
    </ProblemScreen>
  );
}
