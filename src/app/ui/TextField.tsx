import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  /** Content on the right edge, e.g. a show/hide password button. */
  trailing?: ReactNode;
  hint?: string;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, icon, trailing, hint, error, className, id, ...props },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const messageId = `${inputId}-message`;
    const message = error ?? hint;

    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={inputId}
          className="text-[13px] font-semibold text-ink-700"
        >
          {label}
        </label>

        <div
          className={cn(
            "flex h-12 items-center gap-2.5 rounded-control border bg-white px-3.5 transition-colors focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/10",
            error ? "border-danger-600" : "border-ink-200",
          )}
        >
          {icon && (
            <span className="text-ink-400" aria-hidden>
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={message ? messageId : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-300"
            {...props}
          />
          {trailing}
        </div>

        {message && (
          <p
            id={messageId}
            className={cn(
              "text-xs",
              error ? "font-medium text-danger-600" : "text-ink-500",
            )}
          >
            {message}
          </p>
        )}
      </div>
    );
  },
);
