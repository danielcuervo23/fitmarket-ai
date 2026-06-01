import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { WeeklyPlan } from "@/lib/ai/types";
import { generateWeeklyPlan } from "@/lib/ai/generateWeeklyPlan";
import { usePlan } from "@/contexts/PlanContext";
import { saveWeeklyPlan } from "@/lib/weeklyPlans";

interface Props {
  onDone: () => void;
}

const steps = [
  "Analizando tus objetivos...",
  "Revisando tu presupuesto...",
  "Consultando supermercados cercanos...",
  "Calculando nutrición óptima...",
  "Generando tu plan personalizado...",
];

export function AIGenerationScreen({ onDone }: Props) {
  const { setPlan, setGenerating, setError } = usePlan();
  const onDoneRef = useRef(onDone);
  const [step, setStep] = useState(0);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    setDisplayError(null);
    setIsLoading(true);
    setStep(0);
    setGenerating(true);

    const { data, error } = await generateWeeklyPlan();

    if (error) {
      setError(error);
      setDisplayError(error);
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
      setDisplayError(null);
      setIsLoading(true);
      setStep(0);
      setGenerating(true);

      const { data, error } = await generateWeeklyPlan();

      if (!active) {
        return;
      }

      if (error) {
        setError(error);
        setDisplayError(error);
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
    if (!isLoading || displayError) {
      return;
    }

    const interval = setInterval(() => {
      setStep((current) =>
        current >= steps.length - 1 ? current : current + 1,
      );
    }, 700);

    return () => clearInterval(interval);
  }, [isLoading, displayError]);

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
          <span style={{ fontSize: "2.8rem" }}>{displayError ? "⚠️" : "🧠"}</span>
        </motion.div>
      </div>

      <motion.p
        className="text-white text-center px-8"
        style={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1.3 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {displayError ? (
          <>
            No pudimos generar
            <br />
            tu plan
          </>
        ) : (
          <>
            IA trabajando
            <br />
            para ti
          </>
        )}
      </motion.p>

      <div className="h-10 mt-4 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {displayError ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-center px-8"
              style={{
                color: "rgba(255,255,255,0.85)",
                fontSize: "0.9rem",
                fontWeight: 500,
                lineHeight: 1.45,
              }}
            >
              {displayError}
            </motion.p>
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

      {!displayError && (
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

      {displayError && (
        <button
          type="button"
          onClick={() => void runGeneration()}
          className="mt-8 px-6 py-3 rounded-2xl"
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "white",
            fontWeight: 700,
            fontSize: "0.9rem",
          }}
        >
          Reintentar
        </button>
      )}

      {!displayError && (
        <div className="absolute bottom-16 inset-x-8">
          <div
            className="rounded-3xl p-5 flex gap-6 justify-center"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
            }}
          >
            {[
              { emoji: "🥩", label: "Proteínas", val: "48g" },
              { emoji: "🌾", label: "Carbos", val: "180g" },
              { emoji: "🥑", label: "Grasas", val: "55g" },
            ].map(({ emoji, label, val }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span style={{ fontSize: "1.4rem" }}>{emoji}</span>
                <motion.span
                  className="text-white"
                  style={{ fontWeight: 800, fontSize: "0.95rem" }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  {val}
                </motion.span>
                <span
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.7rem",
                    fontWeight: 500,
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
