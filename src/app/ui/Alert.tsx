import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

type AlertTone = "error" | "warning" | "info" | "success";

const tones: Record<
  AlertTone,
  { box: string; icon: typeof Info; role: "alert" | "status" }
> = {
  error: {
    box: "border-danger-100 bg-danger-50 text-danger-700",
    icon: AlertCircle,
    role: "alert",
  },
  warning: {
    box: "border-warning-100 bg-warning-50 text-warning-700",
    icon: TriangleAlert,
    role: "status",
  },
  info: {
    box: "border-brand-100 bg-brand-50 text-brand-800",
    icon: Info,
    role: "status",
  },
  success: {
    box: "border-brand-200 bg-brand-50 text-brand-800",
    icon: CheckCircle2,
    role: "status",
  },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon, role } = tones[tone];

  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-[13px] font-medium leading-snug",
        box,
        className,
      )}
    >
      <Icon size={17} className="mt-px shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
