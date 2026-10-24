import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Screen } from "./Screen";

/**
 * Layout for "something stopped you" screens: say what happened in plain
 * words, let the user fix it right here, and keep the actions at the bottom.
 */
export function ProblemScreen({
  title,
  body,
  children,
  actions,
  tone = "warning",
}: {
  title: string;
  body: string;
  /** The fix itself (inputs, pickers). */
  children?: ReactNode;
  actions: ReactNode;
  tone?: "warning" | "danger";
}) {
  return (
    <Screen className="gap-5 overflow-y-auto px-6 pb-8 pt-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full",
            tone === "danger"
              ? "bg-danger-50 text-danger-600"
              : "bg-warning-50 text-warning-600",
          )}
        >
          <AlertTriangle size={26} aria-hidden />
        </span>
        <h1 role="alert" className="text-2xl font-extrabold tracking-tight">
          {title}
        </h1>
        <p className="text-[15px] leading-snug text-ink-500">{body}</p>
      </div>

      {children && <div className="flex flex-col gap-4">{children}</div>}

      <div className="mt-auto flex flex-col gap-3">{actions}</div>
    </Screen>
  );
}
