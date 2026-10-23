import { Check, MessageCircle } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { EmptyState, Screen, ScreenBody, TextField } from "@/app/ui";
import { BottomNav, type NavTab } from "./BottomNav";

interface Props {
  onTabChange: (tab: NavTab) => void;
}

const UPCOMING: MessageKey[] = [
  "chat.feature.swapMeals",
  "chat.feature.adjustBudget",
  "chat.feature.substitute",
  "chat.feature.regenerateDays",
];

/** Placeholder: the AI chat is not built yet, and the screen says so. */
export function ChatScreen({ onTabChange }: Props) {
  const { t } = useI18n();

  return (
    <Screen>
      <header className="flex flex-col gap-1 px-6 pb-3 pt-14">
        <h1 className="text-[26px] font-extrabold tracking-tight">
          {t("chat.title")}
        </h1>
        <p className="text-sm font-semibold text-brand-700">
          {t("chat.comingSoon")}
        </p>
      </header>

      <ScreenBody className="pb-6">
        <EmptyState
          icon={<MessageCircle size={26} />}
          title={t("chat.title")}
          body={t("chat.body")}
        />
        <ul className="mx-auto flex max-w-xs flex-col gap-2.5">
          {UPCOMING.map((key) => (
            <li
              key={key}
              className="flex items-center gap-2.5 text-sm font-medium text-ink-700"
            >
              <Check size={16} className="text-brand-600" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </ScreenBody>

      <div className="px-6 pb-28 pt-3">
        <TextField
          label={t("chat.title")}
          disabled
          placeholder={t("chat.inputPlaceholder")}
        />
      </div>

      <BottomNav active="dashboard" onChange={onTabChange} />
    </Screen>
  );
}
