import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert } from "./Alert";
import { Button } from "./Button";

/** Centered spinner with a message, for screens that are still loading. */
export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
      <Loader2 size={30} className="animate-spin text-brand-600" aria-hidden />
      <p role="status" className="text-sm font-medium text-ink-500">
        {message}
      </p>
    </div>
  );
}

/** An error message with a retry button. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <Alert tone="error" className="w-full">
        {message}
      </Alert>
      <Button variant="secondary" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden />
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** Icon + title + text + optional action, for "nothing here yet" states. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-600"
        aria-hidden
      >
        {icon}
      </span>
      <h2 className="text-lg font-bold text-ink-900">{title}</h2>
      {body && (
        <p className="max-w-[17rem] text-sm leading-relaxed text-ink-500">
          {body}
        </p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
