import { useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { upsertProfile, type ProfileInput } from "@/lib/profile";
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
import { BodyDataFields } from "../shared/BodyDataFields";

interface Props {
  name: string;
  onNext: () => void;
  onBack: () => void;
}

const DEFAULTS: ProfileInput = {
  age: 28,
  weight: 65,
  height: 165,
  activity_level: "moderate",
  sex: null,
  household_size: 1,
};

export function ProfileScreen({ name, onNext, onBack }: Props) {
  const { t } = useI18n();
  const [body, setBody] = useState<ProfileInput>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const handleContinue = async () => {
    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await upsertProfile(body);

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
        step={{ current: 1, total: 5 }}
        title={t("profile.title", { name: name.split(" ")[0] })}
        subtitle={t("profile.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <ScreenBody className="flex flex-col gap-6 pb-6">
        <BodyDataFields
          value={body}
          onChange={(patch) => setBody((current) => ({ ...current, ...patch }))}
          disabled={isLoading}
        />

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
