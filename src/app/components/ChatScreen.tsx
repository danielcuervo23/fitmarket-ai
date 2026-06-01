import { Sparkles } from "lucide-react";
import { BottomNav } from "./BottomNav";

type NavTab = "dashboard" | "menu" | "chat" | "profile";

interface Props {
  onTabChange: (tab: NavTab) => void;
}

const upcomingFeatures = [
  "Cambiar comidas",
  "Ajustar presupuesto",
  "Sustituir ingredientes",
  "Regenerar días específicos",
];

export function ChatScreen({ onTabChange }: Props) {
  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "#F7FAF8" }}
    >
      <div
        className="pt-14 px-6 pb-4 flex items-center gap-3"
        style={{
          background: "white",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)" }}
        >
          <Sparkles size={18} style={{ color: "white" }} />
        </div>
        <div>
          <p style={{ fontWeight: 800, color: "#0D1F16", fontSize: "1rem" }}>
            Chat IA
          </p>
          <p style={{ color: "#6B8072", fontSize: "0.72rem", fontWeight: 500 }}>
            Próximamente
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-32 text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
          style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}
        >
          <span style={{ fontSize: "2.2rem" }}>💬</span>
        </div>
        <h2
          style={{
            fontSize: "1.2rem",
            fontWeight: 800,
            color: "#0D1F16",
            lineHeight: 1.35,
          }}
        >
          Chat IA
        </h2>
        <p
          className="mt-3"
          style={{
            color: "#6B8072",
            fontSize: "0.9rem",
            fontWeight: 500,
            lineHeight: 1.55,
            maxWidth: "300px",
          }}
        >
          Próximamente podrás reajustar tu plan usando IA.
        </p>
        <ul className="mt-6 space-y-2.5 text-left w-full max-w-xs">
          {upcomingFeatures.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-2.5"
              style={{
                color: "#374151",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#16A34A", fontWeight: 800 }}>✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ background: "white", borderTop: "1px solid rgba(0,0,0,0.05)" }}
      >
        <input
          disabled
          placeholder="Disponible próximamente"
          className="flex-1 px-4 py-3 rounded-2xl text-sm cursor-not-allowed"
          style={{
            background: "#F0F5F1",
            border: "none",
            outline: "none",
            color: "#9CA3AF",
            fontWeight: 400,
            opacity: 0.7,
          }}
        />
      </div>

      <BottomNav active="chat" onChange={onTabChange} />
    </div>
  );
}
