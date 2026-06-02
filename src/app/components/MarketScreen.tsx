import { Loader2, RefreshCw, ShoppingCart } from "lucide-react";
import { usePlan } from "@/contexts/PlanContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { formatCOP } from "@/lib/formatCop";
import { BottomNav, type NavTab } from "./BottomNav";
import { BudgetRecommendationsSection } from "./market/BudgetRecommendationsSection";
import { StoreShoppingPlanSection } from "./market/StoreShoppingPlanSection";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onGeneratePlan?: () => void;
}

export function MarketScreen({ onTabChange, onGeneratePlan }: Props) {
  const { plan } = usePlan();
  const { data, isLoading, errorMessage, reload } = useDashboardData();

  const handleGeneratePlan = () => {
    if (onGeneratePlan) {
      onGeneratePlan();
      return;
    }

    onTabChange("dashboard");
  };

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
          Cargando tu mercado...
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
          onClick={() => void reload()}
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
        <BottomNav active="market" onChange={onTabChange} />
      </div>
    );
  }

  const supermarkets = data?.supermarkets ?? [];
  const itemCount = plan?.shopping_list.length ?? 0;

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
            Compras semanales
          </p>
          <h1
            style={{
              color: "white",
              fontSize: "1.4rem",
              fontWeight: 900,
            }}
          >
            Mercado 🛒
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
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <ShoppingCart size={20} style={{ color: "white" }} />
            </div>
            <div>
              <p
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Total estimado
              </p>
              <p
                style={{
                  color: "white",
                  fontSize: "1.5rem",
                  fontWeight: 900,
                  marginTop: "2px",
                }}
              >
                {plan && itemCount > 0
                  ? formatCOP(plan.summary.estimated_total_cop)
                  : "—"}
              </p>
              {itemCount > 0 && (
                <p
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: "0.72rem",
                    fontWeight: 500,
                    marginTop: "4px",
                  }}
                >
                  {itemCount} {itemCount === 1 ? "producto" : "productos"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 space-y-5 pt-5">
        {!plan && (
          <div className="px-6">
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
                  marginBottom: "16px",
                }}
              >
                Aún no tienes un plan activo. Genera uno para ver tu plan de
                compras por supermercado.
              </p>
              <button
                type="button"
                onClick={handleGeneratePlan}
                className="px-6 py-3 rounded-2xl active:scale-95 transition-transform"
                style={{
                  background: "#16A34A",
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                }}
              >
                Generar plan
              </button>
            </div>
          </div>
        )}

        <StoreShoppingPlanSection plan={plan} supermarkets={supermarkets} />

        <BudgetRecommendationsSection
          plan={plan}
          weeklyBudgetCop={data?.weeklyBudgetCop}
        />
      </div>

      <BottomNav active="market" onChange={onTabChange} />
    </div>
  );
}
