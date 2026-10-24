import { Check } from "lucide-react";
import type { GroupedShoppingItem } from "@/lib/shoppingListGroups";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

interface Props {
  item: GroupedShoppingItem;
  checked: boolean;
  onToggle: () => void;
}

export function ShoppingChecklistItem({ item, checked, onToggle }: Props) {
  const { formatCurrency, language } = useI18n();
  const name = language === "en" && item.name_en ? item.name_en : item.name;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-start gap-3 border-t border-ink-100 px-4 py-3.5 text-left transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
          checked
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-ink-300 bg-white text-transparent",
        )}
      >
        <Check size={13} strokeWidth={3.5} />
      </span>

      <span
        className={cn(
          "min-w-0 flex-1 text-[14px] font-medium leading-snug",
          checked ? "text-ink-400 line-through" : "text-ink-900",
        )}
      >
        {name}
        {item.quantity && (
          <span className="text-ink-500"> · {item.quantity}</span>
        )}
      </span>

      <span
        className={cn(
          "shrink-0 text-[13px] font-bold tabular-nums",
          checked ? "text-ink-400 line-through" : "text-ink-700",
        )}
      >
        {formatCurrency(item.estimated_price_cop)}
      </span>
    </button>
  );
}
