import { Loader2 } from "lucide-react";

export function AuthLoadingScreen() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background: "#F7FAF8" }}
    >
      <Loader2
        size={36}
        className="animate-spin"
        style={{ color: "#16A34A" }}
      />
      <p style={{ color: "#6B8072", fontSize: "0.875rem", fontWeight: 600 }}>
        Cargando sesión...
      </p>
    </div>
  );
}
