import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 font-semibold select-none transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white shadow-brand hover:bg-brand-700 active:bg-brand-800",
        secondary:
          "border border-ink-200 bg-white text-ink-900 hover:bg-ink-50",
        soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
        ghost: "text-ink-600 hover:bg-ink-100",
        danger: "bg-danger-600 text-white hover:bg-danger-700",
      },
      size: {
        sm: "h-9 rounded-lg px-3.5 text-sm",
        md: "h-12 rounded-control px-5 text-[15px]",
        lg: "h-14 rounded-2xl px-6 text-base",
      },
      full: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, full, loading, disabled, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(buttonStyles({ variant, size, full }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 size={18} className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
