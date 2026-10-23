import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Sparkles } from "lucide-react";
import {
  generateWeeklyPlan,
  type GenerateWeeklyPlanError,
} from "@/lib/ai/generateWeeklyPlan";
import { saveWeeklyBudget } from "@/lib/budget";
import type { ErrorKey } from "@/lib/errors";
import { usePlan } from "@/contexts/PlanContext";
import { saveWeeklyPlan } from "@/lib/weeklyPlans";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Button, Screen } from "@/app/ui";
import { BudgetShortfallPanel } from "./BudgetShortfallPanel";

interface Props {
  onDone: () => void;
  onAdjustSettings: () => void;
}

const STEPS: MessageKey[] = [
  "gen.step1",
  "gen.step2",
  "gen.step3",
  "gen.step4",
  "gen.step5",
];

export function AIGenerationScreen({ onDone, onAdjustSettings }: Props) {
  const { t } = useI18n();
  const { setPlan, setHasUnsavedPlan } = usePlan();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<GenerateWeeklyPlanError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mountedRef = useRef(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const runGeneration = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    setStep(0);

    const { data, error: generationError } = await generateWeeklyPlan();

    if (!mountedRef.current) {
      return;
    }

    if (generationError || !data) {
      setError(
        generationError ?? { kind: "message", messageKey: "gen.error.failed" },
      );
      setIsLoading(false);
      return;
    }

    // The plan is shown even if saving fails; the menu screen then warns the
    // user and offers to retry so they never lose it silently.
    const { error: saveError } = await saveWeeklyPlan(data);

    if (!mountedRef.current) {
      return;
    }

    setHasUnsavedPlan(saveError !== null);
    setPlan(data);
    setIsLoading(false);
    onDoneRef.current();
  }, [setPlan, setHasUnsavedPlan]);

  /** Saves a higher budget and, if that worked, generates again right away. */
  const handleSaveBudgetAndRegenerate = useCallback(
    async (budgetCop: number): Promise<ErrorKey | null> => {
      const { error: saveError } = await saveWeeklyBudget(budgetCop);

      if (saveError) {
        return saveError;
      }

      void runGeneration();
      return null;
    },
    [runGeneration],
  );

  useEffect(() => {
    mountedRef.current = true;
    void runGeneration();

    return () => {
      mountedRef.current = false;
    };
  }, [runGeneration]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const interval = setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, 1400);

    return () => clearInterval(interval);
  }, [isLoading]);

  if (error?.kind === "budget_too_low") {
    return (
      <BudgetShortfallPanel
        error={error}
        onSaveAndRegenerate={handleSaveBudgetAndRegenerate}
        onRetry={() => void runGeneration()}
        onAdjustSettings={onAdjustSettings}
      />
    );
  }

  if (error) {
    return (
      <Screen className="items-center justify-center gap-6 px-8 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-danger-50 text-danger-600">
          <AlertTriangle size={28} aria-hidden />
        </span>

        <div role="alert" className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            {t("gen.errorTitle")}
          </h1>
          <p className="text-[15px] leading-snug text-ink-500">
            {t(error.messageKey)}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button size="lg" full onClick={() => void runGeneration()}>
            {t("gen.retry")}
          </Button>
          <Button variant="secondary" size="lg" full onClick={onAdjustSettings}>
            {t("gen.adjust")}
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen className="items-center justify-center gap-10 px-8 text-center">
      <div className="relative flex size-44 items-center justify-center">
        {[0, 1].map((ring) => (
          <motion.span
            key={ring}
            className="absolute rounded-full border border-brand-300"
            style={{ width: 112 + ring * 56, height: 112 + ring * 56 }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0.25, 0.7] }}
            transition={{
              repeat: Infinity,
              duration: 2.4,
              delay: ring * 0.5,
              ease: "easeInOut",
            }}
          />
        ))}
        <span className="relative flex size-24 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand">
          <Sparkles size={38} aria-hidden />
        </span>
      </div>

      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          {t("gen.title")}
        </h1>
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="text-[15px] text-ink-500"
          >
            {t(STEPS[step])}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((_, index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              index <= step ? "w-6 bg-brand-600" : "w-2 bg-ink-200"
            }`}
          />
        ))}
      </div>
    </Screen>
  );
}
