import type { ReactNode } from "react";

/**
 * Phone-sized frame used on desktop screens (kept on purpose for demos).
 * Routes render inside it; every screen is positioned `absolute inset-0`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, #E8F5E9 0%, #E3F2FD 50%, #E8F5E9 100%)",
      }}
    >
      <div
        className="relative flex-shrink-0"
        style={{
          width: "390px",
          height: "844px",
          borderRadius: "52px",
          background: "#1A1A1A",
          boxShadow:
            "0 40px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 2px rgba(255,255,255,0.04)",
          padding: "10px",
        }}
      >
        <div
          className="relative w-full h-full overflow-hidden"
          style={{ borderRadius: "44px", background: "#F7FAF8" }}
        >
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-50"
            style={{
              width: "120px",
              height: "34px",
              borderRadius: "20px",
              background: "#0A0A0A",
            }}
          />
          {children}
        </div>

        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-28 h-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.3)" }}
        />
      </div>
    </div>
  );
}
