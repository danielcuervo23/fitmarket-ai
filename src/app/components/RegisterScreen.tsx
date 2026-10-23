import { useState, type FormEvent } from "react";
import { Mail, User } from "lucide-react";
import { signUpErrorKey, validateAuthForm } from "@/lib/auth";
import type { ErrorKey } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
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
  onNext: (name: string) => void;
  onAuthenticated: (name: string) => void;
  onGoToLogin: () => void;
  onBack: () => void;
}

export function RegisterScreen({ onAuthenticated, onGoToLogin, onBack }: Props) {
  const { t, language } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const validationError = validateAuthForm(email, password, {
      requireStrongPassword: true,
    });

    if (validationError) {
      setErrorKey(validationError);
      return;
    }

    setErrorKey(null);
    setNeedsConfirmation(false);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), language } },
      });

      if (error) {
        setErrorKey(signUpErrorKey(error));
        return;
      }

      if (data.session) {
        onAuthenticated(name.trim());
        return;
      }

      // Email confirmation is enabled: the user has to confirm before signing in.
      setNeedsConfirmation(true);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  const clearFeedback = () => {
    setErrorKey(null);
    setNeedsConfirmation(false);
  };

  return (
    <Screen className="bg-white">
      <ScreenHeader
        title={t("register.title")}
        subtitle={t("register.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ScreenBody className="flex flex-col gap-4 pb-4">
          <TextField
            label={t("register.name")}
            autoComplete="name"
            icon={<User size={17} />}
            placeholder={t("register.namePlaceholder")}
            value={name}
            disabled={isLoading}
            onChange={(event) => {
              setName(event.target.value);
              clearFeedback();
            }}
          />
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
              clearFeedback();
            }}
          />
          <PasswordField
            label={t("auth.password")}
            autoComplete="new-password"
            placeholder={t("register.passwordPlaceholder")}
            value={password}
            disabled={isLoading}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFeedback();
            }}
          />
        </ScreenBody>

        <ScreenFooter>
          {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
          {needsConfirmation && (
            <Alert tone="info">{t("auth.error.confirmEmail")}</Alert>
          )}

          <Button type="submit" size="lg" full loading={isLoading}>
            {t("register.submit")}
          </Button>

          <p className="text-center text-sm text-ink-500">
            {t("register.haveAccount")}{" "}
            <button
              type="button"
              onClick={onGoToLogin}
              disabled={isLoading}
              className="font-bold text-brand-700 hover:underline"
            >
              {t("register.signIn")}
            </button>
          </p>
        </ScreenFooter>
      </form>
    </Screen>
  );
}
