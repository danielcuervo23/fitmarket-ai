import { ShoppingBasket, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/** The FitMarket AI logo: a basket with an AI spark. Sizes scale with `size`. */
export function BrandMark({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center bg-linear-to-br from-brand-400 to-brand-700 text-white shadow-brand",
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      aria-hidden
    >
      <ShoppingBasket size={size * 0.5} strokeWidth={2} />
      <Sparkles
        size={size * 0.28}
        strokeWidth={2.4}
        className="absolute right-[14%] top-[12%] text-brand-100"
      />
    </div>
  );
}
