import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { WeeklyPlan } from "@/lib/ai/types";
import {
  generateWeeklyPlan,
  generationErrorToMessage,
  type BudgetTooLowGenerationError,
  type GenerateWeeklyPlanError,
} from "@/lib/ai/generateWeeklyPlan";
import { usePlan } from "@/contexts/PlanContext";
import { saveWeeklyPlan } from "@/lib/weeklyPlans";

interface Props {
  onDone: () => void;
  onAdjustSettings: () => void;
}

const steps = [
  "Analizando tus objetivos...",
  "Revisando tu presupuesto...",
  "Consultando supermercados cercanos...",
  "Calculando nutrición óptima...",
  "Generando tu plan personalizado...",
];

function formatCOP(val: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(val);
}

function isBudgetTooLowError(
  error: GenerateWeeklyPlanError,
): error is BudgetTooLowGenerationError {
  return error.kind === "budget_too_low";
}

export function AIGenerationScreen({ onDone, onAdjustSettings }: Props) {
  const { setPlan, setGenerating, setError } = usePlan();
  const onDoneRef = useRef(onDone);
  const [step, setStep] = useState(0);
  const [generationError, setGenerationError] =
    useState<GenerateWeeklyPlanError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const budgetError = generationError && isBudgetTooLowError(generationError)
    ? generationError
    : null;
  const displayError = generationError
    ? generationErrorToMessage(generationError)
    : null;

  onDoneRef.current = onDone;

  const completeSuccessfulGeneration = useCallback(
    async (data: WeeklyPlan) => {
      const { error: saveError } = await saveWeeklyPlan(data);

      if (saveError) {
        console.error("[FitMarket] saveWeeklyPlan:", saveError);
      }

      setPlan(data);
      setGenerating(false);
      setIsLoading(false);
      onDoneRef.current();
    },
    [setPlan, setGenerating],
  );

  const runGeneration = useCallback(async () => {
    setError(null);
    setGenerationError(null);
    setIsLoading(true);
    setStep(0);
    setGenerating(true);

    const { data, error } = await generateWeeklyPlan();

    if (error) {
      setError(generationErrorToMessage(error));
      setGenerationError(error);
      setGenerating(false);
      setIsLoading(false);
      return;
    }

    if (data) {
      await completeSuccessfulGeneration(data);
    }
  }, [setError, setGenerating, completeSuccessfulGeneration]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setError(null);
      setGenerationError(null);
      setIsLoading(true);
      setStep(0);
      setGenerating(true);

      const { data, error } = await generateWeeklyPlan();

      if (!active) {
        return;
      }

      if (error) {
        setError(generationErrorToMessage(error));
        setGenerationError(error);
        setGenerating(false);
        setIsLoading(false);
        return;
      }

      if (data) {
        await completeSuccessfulGeneration(data);
      }
    })();

    return () => {
      active = false;
    };
  }, [setError, setGenerating, completeSuccessfulGeneration]);

  useEffect(() => {
    if (!isLoading || generationError) {
      return;
    }

    const interval = setInterval(() => {
      setStep((current) =>
        current >= steps.length - 1 ? current : current + 1,
      );
    }, 700);

    return () => clearInterval(interval);
  }, [isLoading, generationError]);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background:
          "linear-gradient(160deg, #0A3D21 0%, #145F35 50%, #1E8449 100%)",
      }}
    >
      <div className="relative flex items-center justify-center mb-12">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2"
            style={{
              borderColor: "rgba(255,255,255,0.15)",
              width: 80 + i * 60,
              height: 80 + i * 60,
            }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.15, 0.4] }}
            transition={{
              repeat: Infinity,
              duration: 2.2,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          />
        ))}

        <motion.div
          className="w-24 h-24 rounded-full flex items-center justify-center z-10"
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            backdropFilter: "blur(8px)",
          }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <span style={{ fontSize: "2.8rem" }}>{generationError ? "⚠️" : "🧠"}</span>
        </motion.div>
      </div>

      <motion.p
        className="text-white text-center px-8"
        style={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1.3 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {generationError ? (
          <>
            {budgetError ? (
              <>
                Presupuesto
                <br />
                insuficiente
              </>
            ) : (
              <>
                No pudimos generar
                <br />
                tu plan
              </>
            )}
          </>
        ) : (
          <>
            IA trabajando
            <br />
            para ti
          </>
        )}
      </motion.p>

      <div className="mt-4 flex items-center justify-center w-full max-w-sm px-6">
        <AnimatePresence mode="wait">
          {generationError ? (
            <motion.div
              key={budgetError ? "budget-error" : "error"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-center flex flex-col gap-2.5 w-full"
              style={{
                color: "rgba(255,255,255,0.9)",
                fontSize: "0.88rem",
                fontWeight: 500,
                lineHeight: 1.5,
              }}
            >
              <p style={{ fontWeight: 600 }}>{displayError}</p>
              {budgetError ? (
                <>
                  <p>
                    Presupuesto actual:{" "}
                    <strong style={{ color: "white" }}>
                      {formatCOP(budgetError.currentBudget)}
                    </strong>
                  </p>
                  <p>
                    Presupuesto estimado necesario:{" "}
                    <strong style={{ color: "white" }}>
                      {formatCOP(budgetError.requiredBudget)}
                    </strong>
                  </p>
                  <p>
                    Te recomendamos aumentar tu presupuesto en aproximadamente{" "}
                    <strong style={{ color: "white" }}>
                      {formatCOP(budgetError.recommendedIncrease)}
                    </strong>
                    .
                  </p>
                </>
              ) : null}
            </motion.div>
          ) : (
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-center px-8"
              style={{
                color: "rgba(255,255,255,0.65)",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              {steps[step]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {!generationError && (
        <div className="flex gap-2 mt-8">
          {steps.map((_, i) => (
            <motion.div
              key={i}
              className="h-1.5 rounded-full"
              animate={{
                width: i <= step ? 24 : 8,
                background:
                  i <= step ? "#86EFAC" : "rgba(255,255,255,0.25)",
              }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
            />
          ))}
        </div>
      )}

      {generationError && (
        <div className="mt-8 flex flex-col gap-3 w-full max-w-[280px] px-6">
          <button
            type="button"
            onClick={() => void runGeneration()}
            className="w-full py-3.5 rounded-2xl active:scale-95 transition-transform"
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.35)",
              color: "white",
              fontWeight: 800,
              fontSize: "0.9rem",
            }}
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={onAdjustSettings}
            className="w-full py-3.5 rounded-2xl active:scale-95 transition-transform"
            style={{
              background: "white",
              color: "#145F35",
              fontWeight: 800,
              fontSize: "0.9rem",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            }}
          >
            Ajustar configuración
          </button>
        </div>
      )}

    </div>
  );
}
