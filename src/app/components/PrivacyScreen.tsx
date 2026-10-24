import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Alert, Screen, ScreenBody, ScreenHeader } from "@/app/ui";

interface Props {
  onBack: () => void;
}

const UPDATED_AT = "2026-10-23";

const SECTIONS: { title: MessageKey; body: MessageKey }[] = [
  { title: "privacy.s1.title", body: "privacy.s1.body" },
  { title: "privacy.s2.title", body: "privacy.s2.body" },
  { title: "privacy.s3.title", body: "privacy.s3.body" },
  { title: "privacy.s4.title", body: "privacy.s4.body" },
  { title: "privacy.s5.title", body: "privacy.s5.body" },
  { title: "privacy.s6.title", body: "privacy.s6.body" },
];

export function PrivacyScreen({ onBack }: Props) {
  const { t, formatDate } = useI18n();

  return (
    <Screen className="bg-white">
      <ScreenHeader
        title={t("privacy.title")}
        subtitle={t("privacy.updated", { date: formatDate(UPDATED_AT) })}
        onBack={onBack}
      />

      <ScreenBody className="flex flex-col gap-6 pb-10">
        <Alert tone="info">{t("privacy.draftNote")}</Alert>

        {SECTIONS.map(({ title, body }) => (
          <section key={title} className="flex flex-col gap-1.5">
            <h2 className="text-base font-bold">{t(title)}</h2>
            <p className="text-[14px] leading-relaxed text-ink-600">{t(body)}</p>
          </section>
        ))}
      </ScreenBody>
    </Screen>
  );
}
