import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { saveUserSupermarkets, type SupermarketId } from "@/lib/supermarkets";
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
import { StorePicker } from "../shared/pickers/StorePicker";

interface Props {
  onNext: (stores: string[]) => void;
  onBack: () => void;
}

export function SupermarketsScreen({ onNext, onBack }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<SupermarketId[]>(["D1", "Ara"]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

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
        <StorePicker
          label={t("stores.title")}
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
