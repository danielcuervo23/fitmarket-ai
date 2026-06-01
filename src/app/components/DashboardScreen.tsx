import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  Store,
} from "lucide-react";
import { usePlan } from "@/contexts/PlanContext";
import { BottomNav } from "./BottomNav";
import {
  fetchDashboardData,
  type DashboardData,
  type DashboardSupermarket,
} from "@/lib/dashboard";

type NavTab = "dashboard" | "menu" | "chat" | "profile";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onGeneratePlan?: () => void;
}

function formatCOP(val: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(val);
}

function storeDisplayName(
  storeId: string,
  supermarkets: DashboardSupermarket[] | undefined,
): string {
  return supermarkets?.find((store) => store.id === storeId)?.name ?? storeId;
}

export function DashboardScreen({ onTabChange, onGeneratePlan }: Props) {
  const { plan } = usePlan();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
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
    void loadDashboard();
  }, [loadDashboard]);

  const firstName = data?.displayName.split(" ")[0] ?? "Usuario";
  const budgetLabel =
    data?.weeklyBudgetCop != null && data.weeklyBudgetCop > 0
      ? formatCOP(data.weeklyBudgetCop)
      : "—";

  if (isLoading) {
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
          Cargando tu panel...
        </p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8"
        style={{ background: "#F7FAF8" }}
      >
        <div
          role="alert"
          className="px-4 py-3 rounded-2xl text-sm text-center w-full"
          style={{
            background: "#FEF2F2",
            border: "1.5px solid rgba(220,38,38,0.2)",
            color: "#991B1B",
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl active:scale-95 transition-transform"
          style={{
            background: "#16A34A",
            color: "white",
            fontWeight: 700,
            fontSize: "0.9rem",
          }}
        >
          <RefreshCw size={18} />
          Reintentar
        </button>
        <BottomNav active="dashboard" onChange={onTabChange} />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "#F7FAF8" }}
    >
      <div
        className="px-6 pt-14 pb-6"
        style={{
          background: "linear-gradient(160deg, #0A3D21, #16A34A)",
          borderBottomLeftRadius: "2rem",
          borderBottomRightRadius: "2rem",
        }}
      >
        <div className="mb-5">
          <p
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            Hola de nuevo
          </p>
          <h1
            style={{
              color: "white",
              fontSize: "1.4rem",
              fontWeight: 900,
            }}
          >
            Hola, {firstName} 👋
          </h1>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(8px)",
          }}
        >
          <p
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            Presupuesto semanal
          </p>
          <p
            style={{
              color: "white",
              fontSize: "1.8rem",
              fontWeight: 900,
              marginTop: "4px",
            }}
          >
            {budgetLabel}
          </p>
          {data?.weeklyBudgetCop == null && (
            <p
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: "0.72rem",
                fontWeight: 500,
                marginTop: "8px",
              }}
            >
              Completa el paso de presupuesto en tu onboarding
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 space-y-5 pt-5">
        <div className="px-6">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} style={{ color: "#16A34A" }} />
            <p
              className="text-xs"
              style={{
                color: "#6B8072",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Tus objetivos
            </p>
          </div>
          {data && data.goals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.goals.map((goal) => (
                <span
                  key={goal.id}
                  className="px-3 py-2 rounded-full text-xs"
                  style={{
                    background: "#F0FDF4",
                    border: "1.5px solid rgba(22,163,74,0.2)",
                    color: "#166534",
                    fontWeight: 700,
                  }}
                >
                  {goal.label}
                </span>
              ))}
            </div>
          ) : (
            <p
              style={{
                color: "#9CA3AF",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Aún no has guardado objetivos.
            </p>
          )}
        </div>

        <div className="px-6">
          <div className="flex items-center gap-2 mb-3">
            <Store size={16} style={{ color: "#16A34A" }} />
            <p
              className="text-xs"
              style={{
                color: "#6B8072",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Tus supermercados
            </p>
          </div>
          {data && data.supermarkets.length > 0 ? (
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: "white",
                border: "1.5px solid rgba(22,163,74,0.1)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              {data.supermarkets.map((store, i) => (
                <div
                  key={store.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{
                    borderBottom:
                      i < data.supermarkets.length - 1
                        ? "1px solid rgba(0,0,0,0.05)"
                        : "none",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "#DCFCE7" }}
                  >
                    <Store size={16} style={{ color: "#16A34A" }} />
                  </div>
                  <p
                    style={{
                      fontWeight: 700,
                      color: "#0D1F16",
                      fontSize: "0.85rem",
                    }}
                  >
                    {store.name}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p
              style={{
                color: "#9CA3AF",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Aún no has guardado supermercados.
            </p>
          )}
        </div>

        <div className="px-6 space-y-3">
          <button
            type="button"
            onClick={() => onTabChange("menu")}
            className="w-full p-4 rounded-2xl flex items-center gap-3 active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
              boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <Sparkles size={20} style={{ color: "white" }} />
            </div>
            <div className="flex-1 text-left">
              <p
                style={{
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                }}
              >
                Ver menú semanal
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "0.75rem",
                  fontWeight: 400,
                }}
              >
                7 días · 4 comidas/día
              </p>
            </div>
            <ChevronRight
              size={18}
              style={{ color: "rgba(255,255,255,0.7)" }}
            />
          </button>

          {plan && onGeneratePlan && (
            <button
              type="button"
              onClick={onGeneratePlan}
              className="w-full p-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{
                background: "white",
                border: "1.5px solid rgba(22,163,74,0.35)",
                color: "#16A34A",
                fontWeight: 800,
                fontSize: "0.9rem",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              <Sparkles size={18} />
              Generar nuevo plan
            </button>
          )}
        </div>

        <div className="px-6">
          <p
            className="text-xs mb-3"
            style={{
              color: "#6B8072",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Lista de mercado
          </p>
          {plan && plan.shopping_list.length > 0 ? (
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: "white",
                border: "1.5px solid rgba(22,163,74,0.1)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              {plan.shopping_list.map((item, index) => (
                <div
                  key={`${item.name}-${item.store_id}-${index}`}
                  className="flex items-start gap-3 px-4 py-3.5"
                  style={{
                    borderBottom:
                      index < plan.shopping_list.length - 1
                        ? "1px solid rgba(0,0,0,0.05)"
                        : "none",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "#DCFCE7" }}
                  >
                    <Store size={16} style={{ color: "#16A34A" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontWeight: 700,
                        color: "#0D1F16",
                        fontSize: "0.85rem",
                      }}
                    >
                      {item.name}
                    </p>
                    <p
                      style={{
                        color: "#6B8072",
                        fontSize: "0.78rem",
                        fontWeight: 500,
                        marginTop: "2px",
                      }}
                    >
                      {item.quantity} ·{" "}
                      {storeDisplayName(item.store_id, data?.supermarkets)}
                    </p>
                  </div>
                  <p
                    className="flex-shrink-0"
                    style={{
                      fontWeight: 800,
                      color: "#16A34A",
                      fontSize: "0.82rem",
                    }}
                  >
                    {formatCOP(item.estimated_price_cop)}
                  </p>
                </div>
              ))}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: "#F0FDF4",
                  borderTop: "1px solid rgba(22,163,74,0.12)",
                }}
              >
                <p
                  style={{
                    color: "#166534",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                  }}
                >
                  Total estimado
                </p>
                <p
                  style={{
                    color: "#166534",
                    fontSize: "0.9rem",
                    fontWeight: 900,
                  }}
                >
                  {formatCOP(plan.summary.estimated_total_cop)}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="rounded-3xl px-4 py-6 text-center"
              style={{
                background: "white",
                border: "1.5px solid rgba(22,163,74,0.1)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              <p
                style={{
                  color: "#6B8072",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                Genera tu plan semanal para ver aquí tu lista de compras.
              </p>
            </div>
          )}
        </div>
      </div>

      <BottomNav active="dashboard" onChange={onTabChange} />
    </div>
  );
}
