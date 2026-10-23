import { useState } from "react";
import {
  Apple,
  ChevronRight,
  Dumbbell,
  Flame,
  PiggyBank,
  Users,
  Zap,
} from "lucide-react";
import { saveUserGoals, type GoalType } from "@/lib/goals";
import type { ErrorKey } from "@/lib/errors";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  ChoiceCard,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
} from "@/app/ui";

interface Props {
  onNext: (goals: string[]) => void;
  onBack: () => void;
}

const GOALS: { id: GoalType; icon: typeof Dumbbell }[] = [
  { id: "muscle", icon: Dumbbell },
  { id: "fat", icon: Flame },
  { id: "healthy", icon: Apple },
  { id: "save", icon: PiggyBank },
  { id: "family", icon: Users },
  { id: "energy", icon: Zap },
];

export function GoalsScreen({ onNext, onBack }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<GoalType[]>(["healthy"]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const toggle = (id: GoalType) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((goal) => goal !== id)
        : [...current, id],
    );
    setErrorKey(null);
  };

  const handleContinue = async () => {
    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await saveUserGoals(selected);

      if (error) {
        setErrorKey(error);
        return;
      }

      onNext(selected);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        step={{ current: 2, total: 5 }}
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <ScreenBody className="pb-6">
        <div
          role="group"
          aria-label={t("goals.title")}
          className="grid grid-cols-2 gap-3"
        >
          {GOALS.map(({ id, icon: Icon }) => (
            <ChoiceCard
              key={id}
              layout="tile"
              selected={selected.includes(id)}
              onSelect={() => toggle(id)}
              icon={<Icon size={22} />}
              title={t(`goal.${id}`)}
              disabled={isLoading}
            />
          ))}
        </div>
      </ScreenBody>

      <ScreenFooter>
        {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
        <p className="text-center text-xs font-medium text-ink-500">
          {t("goals.selectedCount", { count: selected.length })}
        </p>
        <Button
          size="lg"
          full
          loading={isLoading}
          disabled={selected.length === 0}
          onClick={handleContinue}
        >
          {t("common.continue")}
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden />
        </Button>
      </ScreenFooter>
    </Screen>
  );
}
