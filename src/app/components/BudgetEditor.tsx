import {
  budgetIssue,
  MIN_WEEKLY_BUDGET_COP,
  parseBudgetInput,
  thousandsSuggestion,
} from "@/lib/budgetSuggestion";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { TextField } from "@/app/ui";

interface Option {
  label: string;
  value: number;
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  hint?: string;
  disabled?: boolean;
}

/**
 * Budget input with quick amounts. It explains a bad amount in words (too
 * low, too high) and catches the classic "150" typed for 150,000.
 */
export function BudgetEditor({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: Props) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const amount = parseBudgetInput(value);
  const issue = budgetIssue(amount);
  const suggestion = thousandsSuggestion(amount);

  const error =
    issue === "too_low"
      ? t("budget.minimum", { amount: formatCurrency(MIN_WEEKLY_BUDGET_COP) })
      : issue === "too_high"
        ? t("budget.tooHigh")
        : null;

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={label}
        inputMode="numeric"
        icon={<span className="text-sm font-bold">$</span>}
        hint={hint}
        error={error}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />

      {suggestion && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(formatNumber(suggestion))}
          className="w-fit rounded-full border border-brand-600 bg-brand-50 px-3.5 py-1.5 text-[13px] font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {t("budget.didYouMean", { amount: formatCurrency(suggestion) })}
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {options.map(({ label: optionLabel, value: optionValue }) => (
          <button
            key={optionLabel}
            type="button"
            disabled={disabled}
            onClick={() => onChange(formatNumber(optionValue))}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-600",
              amount === optionValue
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
            )}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
