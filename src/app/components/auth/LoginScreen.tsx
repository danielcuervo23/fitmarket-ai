import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { signInWithEmail, validateAuthForm } from "@/lib/auth";
import type { ErrorKey } from "@/lib/errors";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  PasswordField,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
  TextField,
} from "@/app/ui";

interface Props {
  onSuccess: () => void;
  onGoToRegister: () => void;
  onBack: () => void;
}

export function LoginScreen({ onSuccess, onGoToRegister, onBack }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const validationError = validateAuthForm(email, password);

    if (validationError) {
      setErrorKey(validationError);
      return;
    }

    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await signInWithEmail(email, password);

      if (error) {
        setErrorKey(error);
        return;
      }

      onSuccess();
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen className="bg-white">
      <ScreenHeader
        title={t("login.title")}
        subtitle={t("login.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ScreenBody className="flex flex-col gap-4 pb-4">
          <TextField
            label={t("auth.email")}
            type="email"
            autoComplete="email"
            inputMode="email"
            icon={<Mail size={17} />}
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            disabled={isLoading}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrorKey(null);
            }}
          />
          <PasswordField
            label={t("auth.password")}
            autoComplete="current-password"
            placeholder={t("login.passwordPlaceholder")}
            value={password}
            disabled={isLoading}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrorKey(null);
            }}
          />
        </ScreenBody>

        <ScreenFooter>
          {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}

          <Button type="submit" size="lg" full loading={isLoading}>
            {t("login.submit")}
          </Button>

          <p className="text-center text-sm text-ink-500">
            {t("login.noAccount")}{" "}
            <button
              type="button"
              onClick={onGoToRegister}
              disabled={isLoading}
              className="font-bold text-brand-700 hover:underline"
            >
              {t("login.createAccount")}
            </button>
          </p>
        </ScreenFooter>
      </form>
    </Screen>
  );
}
