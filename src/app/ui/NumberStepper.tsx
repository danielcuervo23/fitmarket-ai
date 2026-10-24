import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

interface NumberStepperProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  disabled?: boolean;
}

const stepButton =
  "flex h-10 flex-1 items-center justify-center rounded-lg border transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/** Big readable number with − / + buttons (weight, height, ...). */
export function NumberStepper({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
  decreaseLabel,
  increaseLabel,
  disabled,
}: NumberStepperProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-3 rounded-card border border-ink-200 bg-white p-4"
    >
      <span className="text-[13px] font-semibold text-ink-500">{label}</span>

      <p
        className="text-center text-3xl font-extrabold tabular-nums tracking-tight text-ink-900"
        aria-live="polite"
      >
        {value}
        <span className="ml-1 text-sm font-semibold text-ink-400">{unit}</span>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className={cn(
            stepButton,
            "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
          )}
        >
          <Minus size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className={cn(
            stepButton,
            "border-brand-600 bg-brand-600 text-white hover:bg-brand-700",
          )}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
