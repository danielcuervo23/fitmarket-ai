import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { IconButton } from "./IconButton";

/** Full-height page inside the phone frame. */
export function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("absolute inset-0 flex flex-col bg-canvas", className)}>
      {children}
    </div>
  );
}

/** Segmented progress for multi-step flows (e.g. onboarding). */
export function StepProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-col gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={t("common.step", { current, total })}
    >
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index < current ? "bg-brand-600" : "bg-ink-200",
            )}
          />
        ))}
      </div>
      <p className="text-xs font-semibold text-ink-500">
        {t("common.step", { current, total })}
      </p>
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  step,
  disabled,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  step?: { current: number; total: number };
  disabled?: boolean;
  action?: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <header className="flex flex-col gap-5 px-6 pb-5 pt-14">
      {(onBack || action) && (
        <div className="flex items-center justify-between">
          {onBack ? (
            <IconButton
              label={t("common.back")}
              onClick={onBack}
              disabled={disabled}
            >
              <ChevronLeft size={20} />
            </IconButton>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}

      {step && <StepProgress current={step.current} total={step.total} />}

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink-900">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[15px] leading-snug text-ink-500">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

export function ScreenBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("no-scrollbar flex-1 overflow-y-auto px-6", className)}>
      {children}
    </div>
  );
}

export function ScreenFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="flex flex-col gap-3 border-t border-ink-100 bg-canvas px-6 pb-9 pt-4">
      {children}
    </footer>
  );
}
