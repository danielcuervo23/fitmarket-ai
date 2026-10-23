import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PlanProvider, usePlan } from "@/contexts/PlanContext";
import { fetchLatestWeeklyPlan } from "@/lib/weeklyPlans";
import { AppShell } from "./AppShell";
import { AppRoutes } from "./AppRoutes";

/** Restores the user's latest saved plan once, right after the session loads. */
function PlanPersistenceBootstrap() {
  const { session, isLoading } = useAuth();
  const { plan, setPlan } = usePlan();
  const restoreAttemptedRef = useRef(false);
  const planRef = useRef(plan);

  planRef.current = plan;

  useEffect(() => {
    if (isLoading || !session || restoreAttemptedRef.current) {
      return;
    }

    restoreAttemptedRef.current = true;

    if (planRef.current !== null) {
      return;
    }

    void (async () => {
      const { data, error } = await fetchLatestWeeklyPlan();

      if (error) {
        console.error("[FitMarket] fetchLatestWeeklyPlan:", error);
        return;
      }

      if (data && planRef.current === null) {
        setPlan(data);
      }
    })();
  }, [isLoading, session, setPlan]);

  return null;
}

export default function App() {
  return (
    <PlanProvider>
      <PlanPersistenceBootstrap />
      <AppShell>
        <AppRoutes />
      </AppShell>
    </PlanProvider>
  );
}
