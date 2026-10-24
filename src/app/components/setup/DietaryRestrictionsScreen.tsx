import { useState } from "react";
import { ShieldAlert, Sparkles } from "lucide-react";
import {
  buildStoredDietaryRestrictions,
  saveDietaryRestrictions,
  type DietaryRestrictionId,
} from "@/lib/dietaryRestrictions";
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
import { DietaryPicker } from "../shared/pickers/DietaryPicker";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export function DietaryRestrictionsScreen({ onNext, onBack }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<DietaryRestrictionId[]>([]);
  const [otherFoods, setOtherFoods] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const handleContinue = async () => {
    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await saveDietaryRestrictions(
        buildStoredDietaryRestrictions(selected, otherFoods),
      );

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

  return (
    <Screen>
      <ScreenHeader
        step={{ current: 5, total: 5 }}
        title={t("dietary.title")}
        subtitle={t("dietary.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <ScreenBody className="flex flex-col gap-5 pb-6">
        <DietaryPicker
          label={t("dietary.title")}
          selected={selected}
          onSelectedChange={(value) => {
            setSelected(value);
            setErrorKey(null);
          }}
          otherFoods={otherFoods}
          onOtherFoodsChange={(value) => {
            setOtherFoods(value);
            setErrorKey(null);
          }}
          disabled={isLoading}
        />

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {t("dietary.disclaimer")}
        </p>
      </ScreenBody>

      <ScreenFooter>
        {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
        <Button size="lg" full loading={isLoading} onClick={handleContinue}>
          <Sparkles size={18} aria-hidden />
          {t("dietary.generate")}
        </Button>
      </ScreenFooter>
    </Screen>
  );
}
