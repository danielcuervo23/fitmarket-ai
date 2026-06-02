import { TrendingUp } from "lucide-react";
import type { WeeklyPlan } from "@/lib/ai/types";
import {
  buildBudgetIncreaseRecommendations,
  formatBudgetIncreaseLabel,
} from "@/lib/budgetRecommendations";

interface Props {
  plan: WeeklyPlan | null;
  weeklyBudgetCop: number | null | undefined;
}

export function BudgetRecommendationsSection({
  plan,
  weeklyBudgetCop,
}: Props) {
  const budgetRecommendations =
    buildBudgetIncreaseRecommendations(weeklyBudgetCop);

  return (
    <div className="px-6">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} style={{ color: "#16A34A" }} />
        <p
          className="text-xs"
          style={{
            color: "#6B8072",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          ¿Qué pasaría si aumentas tu presupuesto?
        </p>
      </div>

      {!plan || plan.shopping_list.length === 0 ? (
        <div
          className="rounded-3xl px-4 py-5"
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
            Genera tu plan semanal para ver recomendaciones según tu presupuesto.
          </p>
        </div>
      ) : !budgetRecommendations ? (
        <div
          className="rounded-3xl px-4 py-5"
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
            Configura un presupuesto semanal para ver escenarios de mejora.
          </p>
        </div>
      ) : (
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "white",
            border: "1.5px solid rgba(22,163,74,0.1)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          {budgetRecommendations.map((scenario, index) => {
            const isLast = index === budgetRecommendations.length - 1;

            return (
              <div
                key={scenario.increaseCop}
                className="px-4 py-3.5"
                style={{
                  borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <p
                  style={{
                    fontWeight: 800,
                    color: "#16A34A",
                    fontSize: "0.88rem",
                  }}
                >
                  {formatBudgetIncreaseLabel(scenario.increaseCop)}
                </p>
                <p
                  style={{
                    color: "#374151",
                    fontSize: "0.82rem",
                    fontWeight: 500,
                    marginTop: "4px",
                    lineHeight: 1.45,
                  }}
                >
                  {scenario.benefit}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
