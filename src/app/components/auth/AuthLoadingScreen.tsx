import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Screen } from "@/app/ui";

export function AuthLoadingScreen() {
  const { t } = useI18n();

  return (
    <Screen className="items-center justify-center gap-4">
      <Loader2 size={32} className="animate-spin text-brand-600" aria-hidden />
      <p role="status" className="text-sm font-medium text-ink-500">
        {t("authLoading.message")}
      </p>
    </Screen>
  );
}
