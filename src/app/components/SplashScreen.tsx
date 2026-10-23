import { motion } from "motion/react";
import { CalendarDays, ShieldCheck, Wallet } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { BrandMark, Button, LanguageSwitch } from "@/app/ui";

interface Props {
  onNext: () => void;
  onGoToLogin: () => void;
}

const FEATURES: { icon: typeof Wallet; key: MessageKey }[] = [
  { icon: Wallet, key: "splash.feature.budget" },
  { icon: CalendarDays, key: "splash.feature.menu" },
  { icon: ShieldCheck, key: "splash.feature.diet" },
];

export function SplashScreen({ onNext, onGoToLogin }: Props) {
  const { t } = useI18n();

  return (
    <div className="absolute inset-0 flex flex-col bg-brand-950 bg-[radial-gradient(120%_55%_at_85%_0%,rgba(42,157,104,0.42),transparent_62%)] px-7 pb-10 pt-14 text-white">
      <div className="flex justify-end">
        <LanguageSwitch tone="light" />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-9">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-5"
        >
          <BrandMark size={72} />
          <div className="flex flex-col gap-3">
            <h1 className="text-[38px] font-extrabold leading-none tracking-tight">
              {t("brand.name")}
            </h1>
            <p className="text-balance text-[17px] leading-snug text-white/70">
              {t("splash.tagline")}
            </p>
          </div>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-col gap-4"
        >
          {FEATURES.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-200">
                <Icon size={19} aria-hidden />
              </span>
              <span className="text-[15px] font-medium text-white/85">
                {t(key)}
              </span>
            </li>
          ))}
        </motion.ul>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex flex-col gap-3"
      >
        <Button
          size="lg"
          full
          onClick={onNext}
          className="bg-white text-brand-800 shadow-float hover:bg-brand-50"
        >
          {t("splash.cta")}
        </Button>
        <Button variant="ghost" size="md" full onClick={onGoToLogin} className="text-white/85 hover:bg-white/10">
          {t("splash.haveAccount")}
        </Button>
        <p className="pt-1 text-center text-xs text-white/45">
          {t("splash.footnote")}
        </p>
      </motion.div>
    </div>
  );
}
