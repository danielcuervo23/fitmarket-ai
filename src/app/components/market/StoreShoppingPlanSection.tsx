import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Store } from "lucide-react";
import type { WeeklyPlan } from "@/lib/ai/types";
import type { DashboardSupermarket } from "@/lib/dashboard";
import { formatCOP, storeDisplayName } from "@/lib/formatCop";
import { groupShoppingListByStore } from "@/lib/shoppingListGroups";

interface Props {
  plan: WeeklyPlan | null;
  supermarkets: DashboardSupermarket[];
}

export function StoreShoppingPlanSection({ plan, supermarkets }: Props) {
  const [expandedStoreIds, setExpandedStoreIds] = useState<Set<string>>(
    () => new Set(),
  );

  const storeOrder = supermarkets.map((store) => store.id);
  const storeGroups =
    plan && plan.shopping_list.length > 0
      ? groupShoppingListByStore(plan.shopping_list, storeOrder)
      : [];

  const toggleGroup = (storeId: string) => {
    setExpandedStoreIds((current) => {
      const next = new Set(current);

      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        next.add(storeId);
      }

      return next;
    });
  };

  return (
    <div className="px-6">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={16} style={{ color: "#16A34A" }} />
        <p
          className="text-xs"
          style={{
            color: "#6B8072",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Plan de compras por supermercado
        </p>
      </div>
      <p
        className="mb-3 pl-6"
        style={{
          color: "#6B8072",
          fontSize: "0.78rem",
          fontWeight: 500,
          lineHeight: 1.45,
        }}
      >
        Aquí tienes organizado qué comprar en cada supermercado.
      </p>

      {storeGroups.length > 0 ? (
        <div className="space-y-3">
          {storeGroups.map((group) => {
            const isExpanded = expandedStoreIds.has(group.storeId);
            const storeName = storeDisplayName(group.storeId, supermarkets);
            const productLabel =
              group.itemCount === 1 ? "producto" : "productos";

            return (
              <div
                key={group.storeId}
                className="rounded-3xl overflow-hidden"
                style={{
                  background: "white",
                  border: "1.5px solid rgba(22,163,74,0.1)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.storeId)}
                  className="w-full px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                  aria-expanded={isExpanded}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "#DCFCE7" }}
                  >
                    <Store size={18} style={{ color: "#16A34A" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontWeight: 800,
                        color: "#0D1F16",
                        fontSize: "0.95rem",
                      }}
                    >
                      {storeName}
                    </p>
                    <p
                      style={{
                        color: "#6B8072",
                        fontSize: "0.78rem",
                        fontWeight: 500,
                        marginTop: "2px",
                      }}
                    >
                      {group.itemCount} {productLabel}
                    </p>
                    <p
                      style={{
                        color: "#374151",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        marginTop: "4px",
                      }}
                    >
                      Costo estimado:{" "}
                      <span style={{ color: "#16A34A", fontWeight: 900 }}>
                        {formatCOP(group.subtotalCop)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    {isExpanded ? (
                      <ChevronUp size={18} style={{ color: "#16A34A" }} />
                    ) : (
                      <ChevronDown size={18} style={{ color: "#9CA3AF" }} />
                    )}
                    <span
                      style={{
                        color: isExpanded ? "#16A34A" : "#9CA3AF",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                      }}
                    >
                      {isExpanded ? "Ocultar" : "Expandir"}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <>
                    {group.items.map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="flex items-start gap-3 px-4 py-3.5"
                        style={{
                          borderTop: "1px solid rgba(0,0,0,0.05)",
                        }}
                      >
                        <div className="flex-1 min-w-0 pl-[52px]">
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
                            {item.quantity}
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
                        Subtotal estimado
                      </p>
                      <p
                        style={{
                          color: "#166534",
                          fontSize: "0.9rem",
                          fontWeight: 900,
                        }}
                      >
                        {formatCOP(group.subtotalCop)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <div
            className="rounded-3xl flex items-center justify-between px-4 py-3"
            style={{
              background: "#F0FDF4",
              border: "1.5px solid rgba(22,163,74,0.12)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}
          >
            <p
              style={{
                color: "#166534",
                fontSize: "0.78rem",
                fontWeight: 700,
              }}
            >
              Total estimado del plan
            </p>
            <p
              style={{
                color: "#166534",
                fontSize: "0.95rem",
                fontWeight: 900,
              }}
            >
              {formatCOP(plan!.summary.estimated_total_cop)}
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
            Genera tu plan semanal para organizar tus compras por supermercado.
          </p>
        </div>
      )}
    </div>
  );
}
