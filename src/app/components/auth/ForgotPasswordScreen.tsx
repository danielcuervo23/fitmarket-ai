import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth";
import type { ErrorKey } from "@/lib/errors";
import { validateResetEmail } from "@/lib/passwordReset";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
  TextField,
} from "@/app/ui";

interface Props {
  /** App route the e-mail link opens (the new-password screen). */
  resetPath: string;
  onBack: () => void;
}

export function ForgotPasswordScreen({ resetPath, onBack }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [sent, setSent] = useState(false);
  const sentRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // Only validation errors belong to the field; server errors use the alert.
  const [isFieldError, setIsFieldError] = useState(false);

  // Move focus to the confirmation so screen readers announce it.
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    const validationError = validateResetEmail(email);

    if (validationError) {
      setErrorKey(validationError);
      setIsFieldError(true);
      emailRef.current?.focus();
      return;
    }

    setErrorKey(null);
    setIsFieldError(false);
    setIsLoading(true);

    try {
      const { error } = await requestPasswordReset(email, resetPath);

      if (error) {
        setErrorKey(error);
        return;
      }

      setSent(true);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen className="bg-white">
      <ScreenHeader
        title={t("forgotPassword.title")}
        subtitle={t("forgotPassword.subtitle")}
        onBack={onBack}
        disabled={isLoading}
      />

      {sent ? (
        <>
          <ScreenBody className="pb-4">
            <div ref={sentRef} tabIndex={-1} className="outline-none">
              <Alert tone="success">{t("forgotPassword.sent")}</Alert>
            </div>
          </ScreenBody>

          <ScreenFooter>
            <Button size="lg" full onClick={onBack}>
              {t("forgotPassword.backToLogin")}
            </Button>
            <Button
              variant="ghost"
              full
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
            >
              {t("forgotPassword.useOtherEmail")}
            </Button>
          </ScreenFooter>
        </>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <ScreenBody className="flex flex-col gap-4 pb-4">
            <TextField
              ref={emailRef}
              error={isFieldError && errorKey ? t(errorKey) : null}
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
          </ScreenBody>

          <ScreenFooter>
            {errorKey && !isFieldError && (
              <Alert tone="error">{t(errorKey)}</Alert>
            )}

            <Button type="submit" size="lg" full loading={isLoading}>
              {t("forgotPassword.submit")}
            </Button>
          </ScreenFooter>
        </form>
      )}
    </Screen>
  );
}
