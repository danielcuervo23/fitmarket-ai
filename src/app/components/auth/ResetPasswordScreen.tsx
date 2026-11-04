import { useEffect, useRef, useState, type FormEvent } from "react";
import { updatePassword } from "@/lib/auth";
import type { ErrorKey } from "@/lib/errors";
import {
  hasAuthLinkError,
  leaveRecoverySession,
  validateNewPassword,
} from "@/lib/passwordReset";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  PasswordField,
  ProblemScreen,
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenHeader,
} from "@/app/ui";

interface Props {
  /** The password is saved and the session is valid: go into the app. */
  onDone: () => void;
  onRequestNewLink: () => void;
  onGoToLogin: () => void;
}

/**
 * Opened from the reset e-mail. Supabase has already turned the link into a
 * (recovery) session by the time this renders; without one, or when the link
 * came back with an error, the user is offered a new link instead.
 */
export function ResetPasswordScreen({
  onDone,
  onRequestNewLink,
  onGoToLogin,
}: Props) {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  // Read once: Supabase leaves an error in the URL when the link is expired
  // or was already used.
  const [linkError] = useState(() =>
    hasAuthLinkError(window.location.search, window.location.hash),
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  // Kept apart from errorKey: a failed sign-out on the "invalid link" screen
  // must not replace the reason that screen is shown.
  const [leaveErrorKey, setLeaveErrorKey] = useState<ErrorKey | null>(null);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saved) savedRef.current?.focus();
  }, [saved]);

  // Leaving without a new password ends the recovery session (and the
  // recovery flag), so the router does not bounce the user back here and
  // nobody who picks up this device later is signed in by an unfinished
  // reset.
  const leave = async (next: () => void) => {
    if (isLoading) return;
    setLeaveErrorKey(null);
    setIsLoading(true);
    try {
      setLeaveErrorKey(await leaveRecoverySession(signOut, next));
    } catch {
      setLeaveErrorKey("errors.signOut");
    } finally {
      setIsLoading(false);
    }
  };

  const linkUnusable =
    !saved &&
    (linkError || !session || errorKey === "auth.error.resetLinkInvalid");

  if (linkUnusable) {
    return (
      <ProblemScreen
        title={t("resetPassword.invalidTitle")}
        body={t("auth.error.resetLinkInvalid")}
        actions={
          <>
            {leaveErrorKey && <Alert tone="error">{t(leaveErrorKey)}</Alert>}
            <Button
              size="lg"
              full
              loading={isLoading}
              onClick={() => void leave(onRequestNewLink)}
            >
              {t("resetPassword.requestNew")}
            </Button>
            <Button
              variant="ghost"
              full
              disabled={isLoading}
              onClick={() => void leave(onGoToLogin)}
            >
              {t("forgotPassword.backToLogin")}
            </Button>
          </>
        }
      />
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    const validationError = validateNewPassword(password, confirmation);

    if (validationError) {
      setErrorKey(validationError);
      return;
    }

    setErrorKey(null);
    setIsLoading(true);

    try {
      const { error } = await updatePassword(password);

      if (error) {
        setErrorKey(error);
        return;
      }

      setPassword("");
      setConfirmation("");
      setSaved(true);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoading(false);
    }
  };

  if (saved) {
    return (
      <Screen className="bg-white">
        <ScreenHeader title={t("resetPassword.successTitle")} />
        <ScreenBody className="pb-4">
          <div ref={savedRef} tabIndex={-1} className="outline-none">
            <Alert tone="success">{t("resetPassword.success")}</Alert>
          </div>
        </ScreenBody>
        <ScreenFooter>
          <Button size="lg" full onClick={onDone}>
            {t("resetPassword.continue")}
          </Button>
        </ScreenFooter>
      </Screen>
    );
  }

  const clearError = () => {
    setErrorKey(null);
    setLeaveErrorKey(null);
  };
  const formError = leaveErrorKey ?? errorKey;

  return (
    <Screen className="bg-white">
      <ScreenHeader
        title={t("resetPassword.title")}
        subtitle={t("resetPassword.subtitle")}
        onBack={() => void leave(onGoToLogin)}
        disabled={isLoading}
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <ScreenBody className="flex flex-col gap-4 pb-4">
          <PasswordField
            label={t("resetPassword.newPassword")}
            autoComplete="new-password"
            placeholder={t("register.passwordPlaceholder")}
            value={password}
            disabled={isLoading}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
          />
          <PasswordField
            label={t("resetPassword.confirmPassword")}
            autoComplete="new-password"
            placeholder={t("resetPassword.confirmPlaceholder")}
            value={confirmation}
            disabled={isLoading}
            onChange={(event) => {
              setConfirmation(event.target.value);
              clearError();
            }}
          />
        </ScreenBody>

        <ScreenFooter>
          {formError && <Alert tone="error">{t(formError)}</Alert>}

          <Button type="submit" size="lg" full loading={isLoading}>
            {t("resetPassword.submit")}
          </Button>
        </ScreenFooter>
      </form>
    </Screen>
  );
}
