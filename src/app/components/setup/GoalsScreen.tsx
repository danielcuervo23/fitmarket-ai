import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { saveUserGoals, type GoalType } from "@/lib/goals";
import type { ErrorKey } from "@/lib/errors";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
} from "@/app/ui";
import { GoalPicker } from "../shared/pickers/GoalPicker";

interface Props {
  onNext: (goals: string[]) => void;
  onBack: () => void;
}

export function GoalsScreen({ onNext, onBack }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<GoalType[]>(["healthy"]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

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
        <GoalPicker
          label={t("goals.title")}
          value={selected}
          onChange={(value) => {
            setSelected(value);
            setErrorKey(null);
          }}
          disabled={isLoading}
        />
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
