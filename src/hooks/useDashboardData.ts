import { useCallback, useEffect, useState } from "react";
import { fetchDashboardData, type DashboardData } from "@/lib/dashboard";

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data: dashboardData, error } = await fetchDashboardData();

      if (error) {
        setData(null);
        setErrorMessage(error);
        return;
      }

      setData(dashboardData);
    } catch {
      setData(null);
      setErrorMessage(
        "No pudimos conectar. Revisa tu internet e intenta de nuevo.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, isLoading, errorMessage, reload };
}
