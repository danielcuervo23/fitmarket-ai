import { useState } from "react";
import {
  Armchair,
  Bike,
  ChevronRight,
  Dumbbell,
  Footprints,
  Lock,
  Trophy,
} from "lucide-react";
import { isActivityLevel, upsertProfile, type ActivityLevel } from "@/lib/profile";
import type { ErrorKey } from "@/lib/errors";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  ChoiceCard,
  NumberStepper,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
} from "@/app/ui";

interface Props {
  name: string;
  onNext: () => void;
  onBack: () => void;
}

const ACTIVITY_LEVELS: { id: ActivityLevel; icon: typeof Armchair }[] = [
  { id: "sedentary", icon: Armchair },
  { id: "light", icon: Footprints },
  { id: "moderate", icon: Bike },
  { id: "active", icon: Dumbbell },
  { id: "very_active", icon: Trophy },
];

const AGE_MIN = 14;
const AGE_MAX = 80;

export function ProfileScreen({ name, onNext, onBack }: Props) {
  const { t } = useI18n();
  const [age, setAge] = useState(28);
  const [weight, setWeight] = useState(65);
  const [height, setHeight] = useState(165);
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const handleContinue = async () => {
    if (!isActivityLevel(activity)) {
      setErrorKey("errors.invalidValues");
      return;
    }

    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await upsertProfile({
        age,
        weight,
        height,
        activity_level: activity,
      });

      if (error) {
        setErrorKey(error);
        return;
      }

      onNext();
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  const agePercent = ((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;
  const firstName = name.split(" ")[0];

  return (
    <Screen>
      <ScreenHeader
        step={{ current: 1, total: 5 }}
        title={t("profile.title", { name: firstName })}
        subtitle={t("profile.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <ScreenBody className="flex flex-col gap-6 pb-6">
        <section className="flex flex-col gap-3 rounded-card border border-ink-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="profile-age"
              className="text-[13px] font-semibold text-ink-500"
            >
              {t("profile.age")}
            </label>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight text-ink-900">
              {t("profile.ageValue", { age })}
            </span>
          </div>
          <input
            id="profile-age"
            type="range"
            min={AGE_MIN}
            max={AGE_MAX}
            value={age}
            disabled={isLoading}
            onChange={(event) => setAge(Number(event.target.value))}
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
            value={weight}
            min={40}
            max={150}
            onChange={setWeight}
            decreaseLabel={t("profile.decrease", { field: t("profile.weight") })}
            increaseLabel={t("profile.increase", { field: t("profile.weight") })}
            disabled={isLoading}
          />
          <NumberStepper
            label={t("profile.height")}
            unit="cm"
            value={height}
            min={140}
            max={220}
            onChange={setHeight}
            decreaseLabel={t("profile.decrease", { field: t("profile.height") })}
            increaseLabel={t("profile.increase", { field: t("profile.height") })}
            disabled={isLoading}
          />
        </div>

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
              selected={activity === id}
              onSelect={() => setActivity(id)}
              icon={<Icon size={20} />}
              title={t(`activity.${id}.label`)}
              description={t(`activity.${id}.desc`)}
              disabled={isLoading}
            />
          ))}
        </section>

        <p className="flex items-center gap-2 text-xs text-ink-500">
          <Lock size={13} aria-hidden />
          {t("profile.privacy")}
        </p>
      </ScreenBody>

      <ScreenFooter>
        {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
        <Button size="lg" full loading={isLoading} onClick={handleContinue}>
          {t("common.continue")}
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden />
        </Button>
      </ScreenFooter>
    </Screen>
  );
}
