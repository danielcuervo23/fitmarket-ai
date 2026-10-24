import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  /** "checkbox" for multi-select, "radio" for single choice. */
  role?: "checkbox" | "radio";
  /** "stack" lays icon beside text (list rows); "tile" centres it (grids). */
  layout?: "row" | "tile";
  icon?: ReactNode;
  title: string;
  description?: string;
  disabled?: boolean;
}

/** A selectable card used by goals, supermarkets, restrictions and activity. */
export function ChoiceCard({
  selected,
  onSelect,
  role = "checkbox",
  layout = "row",
  icon,
  title,
  description,
  disabled,
}: ChoiceCardProps) {
  const isTile = layout === "tile";

  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-center gap-3.5 rounded-card border bg-white p-4 text-left transition-all active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        isTile && "flex-col justify-center gap-3 py-5 text-center",
        selected
          ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
          : "border-ink-200 hover:border-ink-300",
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl transition-colors",
            isTile ? "size-12" : "size-11",
            selected ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600",
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}

      <span className={cn("flex min-w-0 flex-1 flex-col", isTile && "flex-none")}>
        <span
          className={cn(
            "text-[15px] font-semibold leading-snug",
            selected ? "text-brand-900" : "text-ink-900",
          )}
        >
          {title}
        </span>
        {description && (
          <span className="mt-0.5 text-[13px] leading-snug text-ink-500">
            {description}
          </span>
        )}
      </span>

      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          isTile && "absolute right-3 top-3",
          selected
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-ink-300 bg-white text-transparent",
        )}
      >
        <Check size={12} strokeWidth={3.5} />
      </span>
    </button>
  );
}
