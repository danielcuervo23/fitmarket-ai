import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, History, Loader2 } from "lucide-react";
import type { WeeklyPlan } from "@/lib/ai/types";
import { formatCOP } from "@/lib/formatCop";
import {
  fetchWeeklyPlanById,
  fetchWeeklyPlansHistory,
  formatPlanHistoryDate,
  type WeeklyPlanHistoryItem,
} from "@/lib/weeklyPlans";
import { WeeklyMenuScreen } from "./WeeklyMenuScreen";

interface Props {
  onBack: () => void;
  onViewCurrentPlan: () => void;
}

export function PlanHistoryScreen({ onBack, onViewCurrentPlan }: Props) {
  const [items, setItems] = useState<WeeklyPlanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null);
  const [selectedDateLabel, setSelectedDateLabel] = useState<string | null>(
    null,
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await fetchWeeklyPlansHistory();

    if (error) {
      setErrorMessage(error);
      setItems([]);
    } else {
      setItems(data ?? []);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleOpenPlan = async (item: WeeklyPlanHistoryItem) => {
    if (item.is_current) {
      onViewCurrentPlan();
      return;
    }

    setSelectedId(item.id);
    setSelectedDateLabel(formatPlanHistoryDate(item.created_at));
    setIsLoadingDetail(true);
    setSelectedPlan(null);

    const { data, error } = await fetchWeeklyPlanById(item.id);

    if (error || !data) {
      setErrorMessage(error ?? "No pudimos cargar este plan.");
      setSelectedId(null);
      setIsLoadingDetail(false);
      return;
    }

    setSelectedPlan(data);
    setIsLoadingDetail(false);
  };

  const handleCloseDetail = () => {
    setSelectedId(null);
    setSelectedPlan(null);
    setSelectedDateLabel(null);
  };

  if (isLoadingDetail) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-4"
        style={{ background: "#F7FAF8" }}
      >
        <Loader2
          size={36}
          className="animate-spin"
          style={{ color: "#16A34A" }}
        />
        <p style={{ color: "#6B8072", fontSize: "0.875rem", fontWeight: 600 }}>
          Cargando plan...
        </p>
      </div>
    );
  }

  if (selectedId && selectedPlan) {
    return (
      <WeeklyMenuScreen
        viewPlan={selectedPlan}
        readOnly
        onBack={handleCloseDetail}
        onReturnToCurrent={onViewCurrentPlan}
        headerTitle="Plan anterior"
        headerDateLabel={selectedDateLabel ?? undefined}
      />
    );
  }

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "#F7FAF8" }}
    >
      <div
        className="pt-14 px-6 pb-5"
        style={{
          background: "white",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 mb-3 -ml-1 px-1 py-1 rounded-lg active:scale-95 transition-transform"
          style={{ color: "#16A34A", fontWeight: 700, fontSize: "0.82rem" }}
        >
          <ArrowLeft size={18} />
          Mi cuenta
        </button>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0D1F16" }}>
          Historial de planes
        </h1>
        <p style={{ color: "#6B8072", fontSize: "0.8rem", fontWeight: 400 }}>
          Tus planes generados, del más reciente al más antiguo
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 pb-10 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2
              size={24}
              className="animate-spin"
              style={{ color: "#16A34A" }}
            />
            <span
              style={{ color: "#6B8072", fontSize: "0.85rem", fontWeight: 600 }}
            >
              Cargando historial...
            </span>
          </div>
        ) : errorMessage ? (
          <div
            role="alert"
            className="px-4 py-3 rounded-2xl text-sm"
            style={{
              background: "#FEF2F2",
              border: "1.5px solid rgba(220,38,38,0.2)",
              color: "#991B1B",
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 px-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}
            >
              <History size={28} style={{ color: "#16A34A" }} />
            </div>
            <p
              style={{
                fontWeight: 800,
                color: "#0D1F16",
                fontSize: "1rem",
              }}
            >
              Aún no hay planes guardados
            </p>
            <p
              className="mt-2"
              style={{
                color: "#6B8072",
                fontSize: "0.85rem",
                fontWeight: 500,
                lineHeight: 1.5,
                maxWidth: "260px",
              }}
            >
              Cuando generes un plan semanal, aparecerá aquí con su fecha y
              resumen.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void handleOpenPlan(item)}
              className="w-full text-left rounded-3xl p-5 flex items-center gap-4 active:scale-[0.98] transition-transform"
              style={{
                background: "white",
                border: item.is_current
                  ? "1.5px solid rgba(22,163,74,0.35)"
                  : "1.5px solid rgba(0,0,0,0.06)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: item.is_current ? "#DCFCE7" : "#F3F4F6",
                }}
              >
                <span style={{ fontSize: "1.4rem" }}>
                  {item.is_current ? "✅" : "📋"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p
                    style={{
                      fontWeight: 800,
                      color: "#0D1F16",
                      fontSize: "0.95rem",
                    }}
                  >
                    {item.is_current ? "Plan actual" : "Plan anterior"}
                  </p>
                  {item.is_current && (
                    <span
                      className="px-2 py-0.5 rounded-full"
                      style={{
                        background: "#DCFCE7",
                        color: "#16A34A",
                        fontSize: "0.65rem",
                        fontWeight: 800,
                      }}
                    >
                      Activo
                    </span>
                  )}
                </div>
                <p
                  style={{
                    color: "#6B8072",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                  }}
                >
                  {formatPlanHistoryDate(item.created_at)}
                </p>
                <p
                  className="mt-1"
                  style={{
                    color: "#374151",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  {formatCOP(item.estimated_total_cop)} · {item.product_count}{" "}
                  {item.product_count === 1 ? "producto" : "productos"} ·{" "}
                  {item.estimated_daily_kcal.toLocaleString("es-CO", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  kcal/día
                </p>
              </div>
              <ChevronRight
                size={20}
                className="flex-shrink-0"
                style={{ color: "#9CA3AF" }}
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
