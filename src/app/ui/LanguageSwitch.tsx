import { cn } from "@/lib/cn";
import { LANGUAGES, useI18n } from "@/i18n/I18nProvider";

/** Compact ES | EN toggle. Use tone "light" over dark or photo backgrounds. */
export function LanguageSwitch({
  tone = "dark",
  className,
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  const { language, setLanguage, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className={cn(
        "inline-flex rounded-full p-0.5 text-xs font-bold",
        tone === "light" ? "bg-white/15" : "bg-ink-100",
        className,
      )}
    >
      {LANGUAGES.map((code) => {
        const active = code === language;

        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLanguage(code)}
            className={cn(
              "rounded-full px-3 py-1.5 uppercase transition-colors",
              active
                ? "bg-white text-ink-900 shadow-sm"
                : tone === "light"
                  ? "text-white/75"
                  : "text-ink-500",
            )}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
