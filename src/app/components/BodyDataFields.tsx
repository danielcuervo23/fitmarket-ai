import {
  Armchair,
  Bike,
  Dumbbell,
  Footprints,
  Trophy,
} from "lucide-react";
import type { ActivityLevel, ProfileInput } from "@/lib/profile";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { ChoiceCard, NumberStepper } from "@/app/ui";

const ACTIVITY_LEVELS: { id: ActivityLevel; icon: typeof Armchair }[] = [
  { id: "sedentary", icon: Armchair },
  { id: "light", icon: Footprints },
  { id: "moderate", icon: Bike },
  { id: "active", icon: Dumbbell },
  { id: "very_active", icon: Trophy },
];

const AGE_MIN = 14;
const AGE_MAX = 80;

interface Props {
  value: ProfileInput;
  onChange: (patch: Partial<ProfileInput>) => void;
  disabled?: boolean;
}

/**
 * Age, weight, height, sex, household size and activity level. Used both in
 * the first setup and in Settings, so the two always ask for the same things.
 */
export function BodyDataFields({ value, onChange, disabled }: Props) {
  const { t } = useI18n();
  const agePercent = ((value.age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-card border border-ink-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="body-age"
            className="text-[13px] font-semibold text-ink-500"
          >
            {t("profile.age")}
          </label>
          <span className="text-2xl font-extrabold tabular-nums tracking-tight text-ink-900">
            {t("profile.ageValue", { age: value.age })}
          </span>
        </div>
        <input
          id="body-age"
          type="range"
          min={AGE_MIN}
          max={AGE_MAX}
          value={value.age}
          disabled={disabled}
          onChange={(event) => onChange({ age: Number(event.target.value) })}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-brand-600"
          style={{
            background: `linear-gradient(to right, var(--color-brand-600) ${agePercent}%, var(--color-ink-200) ${agePercent}%)`,
          }}
        />
        <div className="flex justify-between text-xs text-ink-400">
          <span>{AGE_MIN}</span>
          <span>{AGE_MAX}</span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <NumberStepper
          label={t("profile.weight")}
          unit="kg"
          value={value.weight}
          min={40}
          max={150}
          onChange={(weight) => onChange({ weight })}
          decreaseLabel={t("profile.decrease", { field: t("profile.weight") })}
          increaseLabel={t("profile.increase", { field: t("profile.weight") })}
          disabled={disabled}
        />
        <NumberStepper
          label={t("profile.height")}
          unit="cm"
          value={value.height}
          min={140}
          max={220}
          onChange={(height) => onChange({ height })}
          decreaseLabel={t("profile.decrease", { field: t("profile.height") })}
          increaseLabel={t("profile.increase", { field: t("profile.height") })}
          disabled={disabled}
        />
      </div>

      <section
        role="radiogroup"
        aria-label={t("profile.sex")}
        className="flex flex-col gap-2.5"
      >
        <div>
          <h2 className="text-[13px] font-semibold text-ink-500">
            {t("profile.sex")}
          </h2>
          <p className="text-xs text-ink-400">{t("profile.sexHint")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["female", "sex.female"],
              ["male", "sex.male"],
              [null, "sex.none"],
            ] as const
          ).map(([option, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={value.sex === option}
              disabled={disabled}
              onClick={() => onChange({ sex: option })}
              className={cn(
                "rounded-control border px-2 py-3 text-[13px] font-semibold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-brand-600",
                value.sex === option
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <NumberStepper
          label={t("profile.household")}
          unit={t("profile.householdUnit")}
          value={value.household_size}
          min={1}
          max={8}
          onChange={(household_size) => onChange({ household_size })}
          decreaseLabel={t("profile.decrease", { field: t("profile.household") })}
          increaseLabel={t("profile.increase", { field: t("profile.household") })}
          disabled={disabled}
        />
        <p className="text-xs text-ink-400">{t("profile.householdHint")}</p>
      </section>

      <section
        role="radiogroup"
        aria-label={t("profile.activity")}
        className="flex flex-col gap-2.5"
      >
        <h2 className="text-[13px] font-semibold text-ink-500">
          {t("profile.activity")}
        </h2>
        {ACTIVITY_LEVELS.map(({ id, icon: Icon }) => (
          <ChoiceCard
            key={id}
            role="radio"
            selected={value.activity_level === id}
            onSelect={() => onChange({ activity_level: id })}
            icon={<Icon size={20} />}
            title={t(`activity.${id}.label`)}
            description={t(`activity.${id}.desc`)}
            disabled={disabled}
          />
        ))}
      </section>
    </div>
  );
}
