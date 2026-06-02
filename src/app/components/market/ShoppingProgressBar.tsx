interface Props {
  label: string;
  checked: number;
  total: number;
  percent: number;
  variant?: "header" | "card";
}

export function ShoppingProgressBar({
  label,
  checked,
  total,
  percent,
  variant = "card",
}: Props) {
  const isHeader = variant === "header";

  return (
    <div className={isHeader ? "" : "mt-3"}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p
          style={{
            color: isHeader ? "rgba(255,255,255,0.85)" : "#374151",
            fontSize: isHeader ? "0.78rem" : "0.75rem",
            fontWeight: 700,
          }}
        >
          {label}
        </p>
        <p
          style={{
            color: isHeader ? "white" : "#16A34A",
            fontSize: isHeader ? "0.78rem" : "0.75rem",
            fontWeight: 800,
          }}
        >
          {percent}%
        </p>
      </div>
      <p
        style={{
          color: isHeader ? "rgba(255,255,255,0.65)" : "#6B8072",
          fontSize: "0.72rem",
          fontWeight: 600,
          marginBottom: "8px",
        }}
      >
        {checked} de {total} {total === 1 ? "producto" : "productos"} comprados
      </p>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{
          background: isHeader
            ? "rgba(255,255,255,0.2)"
            : "rgba(22,163,74,0.12)",
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: isHeader ? "#86EFAC" : "#16A34A",
          }}
        />
      </div>
    </div>
  );
}
