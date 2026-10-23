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
  /** True when the current plan was generated but could not be saved. */
  hasUnsavedPlan: boolean;
  setPlan: (plan: WeeklyPlan | null) => void;
  setHasUnsavedPlan: (hasUnsavedPlan: boolean) => void;
}

export const PlanContext = createContext<PlanContextValue | undefined>(
  undefined,
);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlanState] = useState<WeeklyPlan | null>(null);
  const [hasUnsavedPlan, setHasUnsavedPlanState] = useState(false);

  const setPlan = useCallback((nextPlan: WeeklyPlan | null) => {
    setPlanState(nextPlan);
  }, []);

  const setHasUnsavedPlan = useCallback((nextValue: boolean) => {
    setHasUnsavedPlanState(nextValue);
  }, []);

  const value = useMemo(
    () => ({ plan, hasUnsavedPlan, setPlan, setHasUnsavedPlan }),
    [plan, hasUnsavedPlan, setPlan, setHasUnsavedPlan],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const context = useContext(PlanContext);

  if (context === undefined) {
    throw new Error("usePlan must be used inside PlanProvider");
  }

  return context;
}
