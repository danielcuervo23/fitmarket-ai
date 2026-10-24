import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

interface Props {
  label: string;
  checked: number;
  total: number;
  percent: number;
  /** "onDark" for use on the dark brand card, "default" on white cards. */
  tone?: "default" | "onDark";
}

export function ShoppingProgressBar({
  label,
  checked,
  total,
  percent,
  tone = "default",
}: Props) {
  const { t } = useI18n();
  const onDark = tone === "onDark";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "text-[13px] font-semibold",
            onDark ? "text-white" : "text-ink-700",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-[13px] font-bold tabular-nums",
            onDark ? "text-brand-200" : "text-brand-700",
          )}
        >
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        className={cn(
          "h-2 overflow-hidden rounded-full",
          onDark ? "bg-white/15" : "bg-ink-100",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            onDark ? "bg-brand-300" : "bg-brand-600",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn("text-xs", onDark ? "text-brand-200/80" : "text-ink-500")}
      >
        {t("market.progressDetail", { checked, total })}
      </span>
    </div>
  );
}
