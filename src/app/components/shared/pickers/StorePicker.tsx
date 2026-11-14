import { useId } from "react";
import type { SupermarketId } from "@/lib/supermarkets";
import { storeOptions, toggleStore, type StoreOption } from "@/lib/storeChoice";
import { useI18n } from "@/i18n/I18nProvider";
import { ChoiceCard } from "@/app/ui";

const OPTIONS = storeOptions();

interface Props {
  value: SupermarketId[];
  onChange: (value: SupermarketId[]) => void;
  disabled?: boolean;
  label: string;
}

/**
 * Multi-select list of supermarket chains (setup flow and settings).
 * "Coming soon" chains are shown greyed out with a text badge and can't be
 * chosen; which chains those are comes from the shared store list.
 */
export function StorePicker({ value, onChange, disabled, label }: Props) {
  const { t } = useI18n();
  const hintId = useId();

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3">
      {OPTIONS.map((option) =>
        option.selectable ? (
          <ChoiceCard
            key={option.id}
            selected={value.includes(option.id)}
            onSelect={() => onChange(toggleStore(value, option.id))}
            icon={<span className="text-lg font-extrabold">{option.name[0]}</span>}
            title={option.name}
            description={t(`store.${option.id}.tagline`)}
            disabled={disabled}
          />
        ) : (
          <ComingSoonCard key={option.id} option={option} hintId={`${hintId}-${option.id}`} />
        ),
      )}

      {value.length === 0 && (
        <p role="status" className="text-[13px] font-medium text-ink-600">
          {t("stores.pickAvailable")}
        </p>
      )}
    </div>
  );
}

/**
 * Not a button: it is out of the tab order, but screen readers still read its
 * name, the "Próximamente" badge and why it can't be chosen.
 */
function ComingSoonCard({ option, hintId }: { option: StoreOption; hintId: string }) {
  const { t } = useI18n();

  return (
    <div
      role="checkbox"
      aria-checked={false}
      aria-disabled
      aria-describedby={hintId}
      className="flex w-full items-center gap-3.5 rounded-card border border-dashed border-ink-200 bg-ink-50 p-4 text-left"
    >
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-400"
      >
        <span className="text-lg font-extrabold">{option.name[0]}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold leading-snug text-ink-500">
            {option.name}
          </span>
          <span className="rounded-full border border-ink-300 bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-600">
            {t("stores.comingSoon")}
          </span>
        </span>
        <span id={hintId} className="mt-0.5 text-[13px] leading-snug text-ink-500">
          {t("stores.comingSoonHint")}
        </span>
      </span>
    </div>
  );
}
