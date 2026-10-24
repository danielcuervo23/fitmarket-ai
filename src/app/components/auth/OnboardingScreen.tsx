import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, ShoppingBasket, SlidersHorizontal, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Button, LanguageSwitch, Screen } from "@/app/ui";

interface Props {
  onNext: () => void;
  onGoToLogin: () => void;
}

const SLIDES: {
  icon: typeof ShoppingBasket;
  title: MessageKey;
  body: MessageKey;
}[] = [
  { icon: ShoppingBasket, title: "onboarding.s1.title", body: "onboarding.s1.body" },
  { icon: Target, title: "onboarding.s2.title", body: "onboarding.s2.body" },
  { icon: SlidersHorizontal, title: "onboarding.s3.title", body: "onboarding.s3.body" },
];

export function OnboardingScreen({ onNext, onGoToLogin }: Props) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const slide = SLIDES[current];
  const Icon = slide.icon;
  const isLast = current === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      onNext();
    } else {
      setCurrent((index) => index + 1);
    }
  };

  return (
    <Screen className="bg-white">
      <div className="flex items-center justify-between px-6 pt-14">
        <LanguageSwitch />
        {!isLast ? (
          <Button variant="ghost" size="sm" onClick={onNext}>
            {t("common.skip")}
          </Button>
        ) : (
          <span />
        )}
      </div>

      <div className="flex flex-1 items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col items-center gap-10 text-center"
          >
            <div className="flex size-48 items-center justify-center rounded-full bg-brand-50">
              <div className="flex size-32 items-center justify-center rounded-full bg-brand-100">
                <div className="flex size-20 items-center justify-center rounded-3xl bg-brand-600 text-white shadow-brand">
                  <Icon size={36} strokeWidth={1.8} aria-hidden />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink-900">
                {t(slide.title)}
              </h2>
              <p className="text-[15px] leading-relaxed text-ink-500">
                {t(slide.body)}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-5 px-6 pb-10">
        <div className="flex justify-center gap-2" aria-hidden>
          {SLIDES.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                index === current ? "w-6 bg-brand-600" : "w-2 bg-ink-200",
              )}
            />
          ))}
        </div>

        <Button size="lg" full onClick={handleNext}>
          {isLast ? t("onboarding.createAccount") : t("onboarding.next")}
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden />
        </Button>

        <p className="text-center text-sm text-ink-500">
          {t("onboarding.haveAccount")}{" "}
          <button
            type="button"
            onClick={onGoToLogin}
            className="font-bold text-brand-700 hover:underline"
          >
            {t("onboarding.signIn")}
          </button>
        </p>
      </div>
    </Screen>
  );
}
