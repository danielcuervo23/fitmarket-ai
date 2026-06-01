import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WeeklyPlan } from "@/lib/ai/types";

interface PlanContextValue {
  plan: WeeklyPlan | null;
  isGenerating: boolean;
  error: string | null;
  setPlan: (plan: WeeklyPlan | null) => void;
  setGenerating: (isGenerating: boolean) => void;
  setError: (error: string | null) => void;
}

export const PlanContext = createContext<PlanContextValue | undefined>(
  undefined,
);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlanState] = useState<WeeklyPlan | null>(null);
  const [isGenerating, setIsGeneratingState] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);

  const setPlan = useCallback((nextPlan: WeeklyPlan | null) => {
    setPlanState(nextPlan);
  }, []);

  const setGenerating = useCallback((nextIsGenerating: boolean) => {
    setIsGeneratingState(nextIsGenerating);
  }, []);

  const setError = useCallback((nextError: string | null) => {
    setErrorState(nextError);
  }, []);

  const value = useMemo(
    () => ({
      plan,
      isGenerating,
      error,
      setPlan,
      setGenerating,
      setError,
    }),
    [plan, isGenerating, error, setPlan, setGenerating, setError],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const context = useContext(PlanContext);

  if (context === undefined) {
    throw new Error("usePlan debe usarse dentro de PlanProvider");
  }

  return context;
}
