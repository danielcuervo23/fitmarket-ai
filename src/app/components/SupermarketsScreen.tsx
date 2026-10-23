import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { saveUserSupermarkets, type SupermarketId } from "@/lib/supermarkets";
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
  onNext: (stores: string[]) => void;
  onBack: () => void;
}

/** Chain names are brand names, so they are not translated. */
const STORES: { id: SupermarketId; name: string }[] = [
  { id: "D1", name: "D1" },
  { id: "Ara", name: "Ara" },
  { id: "Exito", name: "Éxito" },
  { id: "Jumbo", name: "Jumbo" },
  { id: "Carulla", name: "Carulla" },
];

export function SupermarketsScreen({ onNext, onBack }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<SupermarketId[]>(["D1", "Ara"]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const toggle = (id: SupermarketId) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((store) => store !== id)
        : [...current, id],
    );
    setErrorKey(null);
  };

  const handleContinue = async () => {
    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await saveUserSupermarkets(selected);

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
        step={{ current: 4, total: 5 }}
        title={t("stores.title")}
        subtitle={t("stores.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <ScreenBody className="pb-6">
        <div
          role="group"
          aria-label={t("stores.title")}
          className="flex flex-col gap-3"
        >
          {STORES.map(({ id, name }) => (
            <ChoiceCard
              key={id}
              selected={selected.includes(id)}
              onSelect={() => toggle(id)}
              icon={<span className="text-lg font-extrabold">{name[0]}</span>}
              title={name}
              description={t(`store.${id}.tagline`)}
              disabled={isLoading}
            />
          ))}
        </div>
      </ScreenBody>

      <ScreenFooter>
        {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
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
