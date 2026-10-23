import { useState } from "react";
import {
  Bean,
  Fish,
  Ham,
  Milk,
  Nut,
  Salad,
  ShieldAlert,
  Shrimp,
  Sparkles,
  Sprout,
  Wheat,
} from "lucide-react";
import {
  buildStoredDietaryRestrictions,
  MAX_OTHER_FOODS_LENGTH,
  saveDietaryRestrictions,
  type DietaryRestrictionId,
} from "@/lib/dietaryRestrictions";
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
  TextField,
} from "@/app/ui";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const OPTIONS: { id: DietaryRestrictionId; icon: typeof Milk }[] = [
  { id: "lactose", icon: Milk },
  { id: "gluten", icon: Wheat },
  { id: "pork", icon: Ham },
  { id: "fish", icon: Fish },
  { id: "shellfish", icon: Shrimp },
  { id: "peanut", icon: Bean },
  { id: "nuts", icon: Nut },
  { id: "vegetarian", icon: Salad },
  { id: "vegan", icon: Sprout },
];

export function DietaryRestrictionsScreen({ onNext, onBack }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<DietaryRestrictionId[]>([]);
  const [otherFoods, setOtherFoods] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const toggle = (id: DietaryRestrictionId) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setErrorKey(null);
  };

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
        <div
          role="group"
          aria-label={t("dietary.title")}
          className="grid grid-cols-2 gap-3"
        >
          {OPTIONS.map(({ id, icon: Icon }) => (
            <ChoiceCard
              key={id}
              layout="tile"
              selected={selected.includes(id)}
              onSelect={() => toggle(id)}
              icon={<Icon size={22} />}
              title={t(`dietary.${id}`)}
              disabled={isLoading}
            />
          ))}
        </div>

        <TextField
          label={t("dietary.other")}
          placeholder={t("dietary.otherPlaceholder")}
          hint={t("dietary.otherHint")}
          maxLength={MAX_OTHER_FOODS_LENGTH}
          value={otherFoods}
          disabled={isLoading}
          onChange={(event) => {
            setOtherFoods(event.target.value);
            setErrorKey(null);
          }}
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
