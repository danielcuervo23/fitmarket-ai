import { useId, useMemo, useState } from "react";
import { RefreshCw, Target, Wallet } from "lucide-react";
import type { GoalsUnreachableGenerationError } from "@/lib/ai/generateWeeklyPlan";
import {
  budgetOptionAmounts,
  describeConflict,
  unreachableIntroKey,
} from "@/lib/ai/goalConflicts";
import { budgetIssue, parseBudgetInput } from "@/lib/budgetSuggestion";
import type { ErrorKey } from "@/lib/errors";
import { useI18n } from "@/i18n/I18nProvider";
import { es, type MessageKey } from "@/i18n/messages";
import { Alert, Button, ProblemScreen } from "@/app/ui";
import { BudgetEditor } from "./BudgetEditor";

interface Props {
  error: GoalsUnreachableGenerationError;
  /** False once the user already asked for the plan anyway. */
  canForce: boolean;
  /** "Quiero el plan igual": generates again with `allowPartial`. */
  onForce: () => void;
  /** Saves the new budget and starts a new generation; returns an error key. */
  onSaveBudgetAndRegenerate: (budgetCop: number) => Promise<ErrorKey | null>;
  onAdjustSettings: () => void;
}

interface Line {
  id: string;
  text: string;
}

const GENERIC: MessageKey = "gen.conflict.generic";

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(es, key);
}

/**
 * "No se puede cumplir": the plan can't meet every goal. No plan is shown;
 * each conflict is explained in plain words with its numbers, the budget
 * option (when the server found one) can be applied right here, and "Quiero
 * el plan igual" asks for the best plan that still keeps the budget, the
 * restrictions and the safety rules.
 *
 * Everything shown is our own copy plus numbers: no server text is rendered.
 */
export function GoalsUnreachablePanel({
  error,
  canForce,
  onForce,
  onSaveBudgetAndRegenerate,
  onAdjustSettings,
}: Props) {
  const { t, locale, formatCurrency, formatNumber } = useI18n();
  const forceHelpId = useId();
  const optionsHeadingId = useId();
  const listHeadingId = useId();
  const budget = error.budgetOption;
  // One computation for the label ("+$25.000") and the editor's prefill.
  const amounts = budget ? budgetOptionAmounts(budget) : null;
  const recommended = amounts?.newBudget ?? 0;

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [input, setInput] = useState(() => formatNumber(recommended));
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const lines = useMemo<Line[]>(() => {
    const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const result: Line[] = [];
    let hasGeneric = false;

    error.conflicts.forEach((conflict, index) => {
      const line = describeConflict(conflict);

      if (line && isMessageKey(line.key)) {
        const params = Object.fromEntries(
          Object.entries(line.params).map(([name, value]) => [name, format.format(value)]),
        );
        result.push({ id: `${conflict.rule}-${index}`, text: t(line.key, params) });
      } else if (!hasGeneric) {
        hasGeneric = true;
        result.push({ id: "generic", text: t(GENERIC) });
      }
    });

    if (result.length === 0) {
      result.push({ id: "generic", text: t(GENERIC) });
    }

    return result;
  }, [error.conflicts, locale, t]);

  const introKey = unreachableIntroKey({ hasBudget: amounts !== null, canForce });

  const amount = parseBudgetInput(input);
  const canSaveBudget =
    budget !== null && amount > budget.currentBudget && budgetIssue(amount) === null;

  const handleSaveBudget = async () => {
    setErrorKey(null);
    setIsSaving(true);

    try {
      const failure = await onSaveBudgetAndRegenerate(amount);

      // On success the parent switches to the "generating" view.
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
      focusTitle
      title={t("gen.unreachable.title")}
      body={isMessageKey(introKey) ? t(introKey) : ""}
      actions={
        <>
          {budgetOpen && (
            <Button
              size="lg"
              full
              loading={isSaving}
              disabled={!canSaveBudget}
              onClick={() => void handleSaveBudget()}
            >
              <RefreshCw size={18} aria-hidden />
              {t("gen.fix.saveAndGenerate")}
            </Button>
          )}
          {canForce && (
            <Button
              size={budgetOpen ? "md" : "lg"}
              variant={budgetOpen ? "secondary" : "primary"}
              full
              disabled={isSaving}
              aria-describedby={forceHelpId}
              onClick={onForce}
            >
              {t("gen.unreachable.force")}
            </Button>
          )}
          <Button variant="ghost" full disabled={isSaving} onClick={onAdjustSettings}>
            {t("gen.adjust")}
          </Button>
        </>
      }
    >
      {budget && amounts && (
        <section aria-labelledby={optionsHeadingId} className="flex flex-col gap-2.5">
          <h2 id={optionsHeadingId} className="text-[13px] font-semibold text-ink-500">
            {t("gen.unreachable.optionsHeading")}
          </h2>
          <div className="flex flex-col gap-3 rounded-card border border-ink-100 bg-white p-4">
            <div className="flex flex-col items-start gap-3">
              <p className="flex items-start gap-2.5 text-[15px] font-semibold text-ink-900">
                <Wallet size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
                <span>
                  {t("gen.unreachable.budget", {
                    amount: formatCurrency(amounts.increase),
                  })}
                </span>
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={isSaving}
                aria-expanded={budgetOpen}
                onClick={() => {
                  setErrorKey(null);
                  setBudgetOpen((open) => !open);
                }}
              >
                {budgetOpen
                  ? t("gen.trouble.close")
                  : t("gen.unreachable.changeBudget")}
              </Button>
            </div>

            {budgetOpen && (
              <BudgetEditor
                label={t("gen.shortfall.newBudget")}
                value={input}
                onChange={(value) => {
                  setInput(value);
                  setErrorKey(null);
                }}
                options={[
                  {
                    label: `${t("gen.shortfall.recommended")} · ${formatCurrency(recommended)}`,
                    value: recommended,
                  },
                ]}
                disabled={isSaving}
              />
            )}
          </div>
        </section>
      )}

      <section aria-labelledby={listHeadingId} className="flex flex-col gap-2.5">
        <h2 id={listHeadingId} className="text-[13px] font-semibold text-ink-500">
          {t("gen.unreachable.listHeading")}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-start gap-2.5 rounded-card border border-ink-100 bg-white p-4 text-[15px] leading-snug text-ink-900"
            >
              <Target size={18} aria-hidden className="mt-0.5 shrink-0 text-warning-600" />
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {canForce && (
        <p id={forceHelpId} className="text-[13px] leading-snug text-ink-500">
          {t("gen.unreachable.forceHelp")}
        </p>
      )}

      {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
    </ProblemScreen>
  );
}
