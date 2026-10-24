import { CalendarDays, Home, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";

export type NavTab = "dashboard" | "menu" | "market" | "profile";

interface Props {
  active: NavTab;
  onChange: (tab: NavTab) => void;
}

const TABS: { id: NavTab; label: MessageKey; Icon: typeof Home }[] = [
  { id: "dashboard", label: "nav.home", Icon: Home },
  { id: "menu", label: "nav.menu", Icon: CalendarDays },
  { id: "market", label: "nav.market", Icon: ShoppingCart },
  { id: "profile", label: "nav.profile", Icon: User },
];

export function BottomNav({ active, onChange }: Props) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.label")}
      className="absolute inset-x-0 bottom-0 flex border-t border-ink-100 bg-white px-2 pb-6 pt-2"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-600",
              isActive ? "text-brand-700" : "text-ink-400 hover:text-ink-600",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                isActive && "bg-brand-100",
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden />
            </span>
            {t(label)}
          </button>
        );
      })}
    </nav>
  );
}
