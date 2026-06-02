import { Check } from "lucide-react";
import { formatCOP } from "@/lib/formatCop";
import type { GroupedShoppingItem } from "@/lib/shoppingListGroups";

interface Props {
  item: GroupedShoppingItem;
  checked: boolean;
  onToggle: () => void;
}

export function ShoppingChecklistItem({ item, checked, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
      style={{
        borderTop: "1px solid rgba(0,0,0,0.05)",
        opacity: checked ? 0.55 : 1,
      }}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: checked ? "#16A34A" : "white",
          border: checked
            ? "2px solid #16A34A"
            : "2px solid rgba(0,0,0,0.15)",
        }}
        aria-hidden
      >
        {checked && <Check size={14} style={{ color: "white" }} strokeWidth={3} />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          style={{
            fontWeight: 700,
            color: "#0D1F16",
            fontSize: "0.85rem",
            textDecoration: checked ? "line-through" : "none",
          }}
        >
          {item.name}
          {item.quantity ? ` · ${item.quantity}` : ""}
        </p>
      </div>
      <p
        className="flex-shrink-0"
        style={{
          fontWeight: 800,
          color: "#16A34A",
          fontSize: "0.82rem",
          textDecoration: checked ? "line-through" : "none",
        }}
      >
        {formatCOP(item.estimated_price_cop)}
      </p>
    </button>
  );
}
