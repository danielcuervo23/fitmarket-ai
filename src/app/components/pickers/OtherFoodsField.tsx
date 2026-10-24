import { useMemo } from "react";
import { AlertCircle, Check } from "lucide-react";
import { explainRestriction } from "@shared/planner/restrictions.ts";
import {
  MAX_OTHER_FOODS_LENGTH,
  parseOtherFoodsText,
} from "@/lib/dietaryRestrictions";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/i18n/messages";
import { useI18n } from "@/i18n/I18nProvider";
import { TextField } from "@/app/ui";

const SUGGESTIONS = [
  "granos",
  "legumbres",
  "verduras",
  "frutas",
  "huevos",
  "pollo",
  "res",
  "cerdo",
  "pescado",
  "lacteos",
  "dulces",
  "cilantro",
  "aguacate",
  "cebolla",
] as const;

const SHOWN_FOODS = 5;
const MAX_EXPLAINED = 8;

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Free-text foods to avoid. We adapt to how people name foods: tapping a
 * suggestion adds it, and every entry shows which foods we understood from it
 * so the user can see exactly what will be left out.
 */
export function OtherFoodsField({ value, onChange, disabled }: Props) {
  const { t, language } = useI18n();
  const entries = useMemo(() => parseOtherFoodsText(value), [value]);
  const explained = useMemo(
    () =>
      entries
        .slice(0, MAX_EXPLAINED)
        .map((entry) => ({ entry, ...explainRestriction(entry) })),
    [entries],
  );

  const suggestionKey = (id: (typeof SUGGESTIONS)[number]) =>
    `dietary.sg.${id}` as MessageKey;

  const isActive = (label: string) =>
    entries.includes(label.trim().toLowerCase());

  const toggle = (label: string) => {
    const wanted = label.trim().toLowerCase();
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const next = isActive(label)
      ? parts.filter((part) => part.toLowerCase() !== wanted)
      : [...parts, label];

    onChange(next.join(", ").slice(0, MAX_OTHER_FOODS_LENGTH));
  };

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t("dietary.other")}
        placeholder={t("dietary.otherPlaceholder")}
        hint={t("dietary.otherHint")}
        maxLength={MAX_OTHER_FOODS_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-ink-500">
          {t("dietary.suggestions")}
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((id) => {
            const label = t(suggestionKey(id));
            const active = isActive(label);

            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => toggle(label)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60",
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                )}
              >
                {active && <Check size={13} strokeWidth={3} aria-hidden />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {explained.length > 0 && (
        <section
          aria-live="polite"
          aria-label={t("dietary.understood")}
          className="flex flex-col gap-2.5 rounded-card border border-ink-100 bg-ink-50/60 p-3.5"
        >
          <h4 className="text-xs font-semibold text-ink-500">
            {t("dietary.understood")}
          </h4>
          {explained.map(({ entry, matched, ingredients }) => {
            const names = ingredients.map(
              (ingredient) => ingredient.name[language],
            );
            const extra = names.length - SHOWN_FOODS;

            return (
              <div key={entry} className="flex flex-col gap-0.5 text-[13px]">
                <span className="font-bold text-ink-900">{entry}</span>
                {!matched ? (
                  <span className="flex items-start gap-1.5 text-warning-700">
                    <AlertCircle
                      size={14}
                      className="mt-0.5 shrink-0"
                      aria-hidden
                    />
                    {t("dietary.unknown")}
                  </span>
                ) : names.length === 0 ? (
                  <span className="text-ink-500">{t("dietary.notUsed")}</span>
                ) : (
                  <span className="leading-snug text-ink-600">
                    {names.slice(0, SHOWN_FOODS).join(", ")}
                    {extra > 0 && ` ${t("dietary.andMore", { n: extra })}`}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
