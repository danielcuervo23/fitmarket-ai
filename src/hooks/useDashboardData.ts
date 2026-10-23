import { useCallback, useEffect, useState } from "react";
import { fetchDashboardData, type DashboardData } from "@/lib/dashboard";
import type { ErrorKey } from "@/lib/errors";

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);

    try {
      const { data: dashboardData, error } = await fetchDashboardData();

      if (error) {
        setData(null);
        setErrorKey(error);
        return;
      }

      setData(dashboardData);
    } catch {
      setData(null);
      setErrorKey(
        "errors.network",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, isLoading, errorKey, reload };
}
