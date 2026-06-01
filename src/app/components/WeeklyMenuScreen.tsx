import { useState } from "react";
import { usePlan } from "@/contexts/PlanContext";
import type { DayId, DayMenu, MealSlot } from "@/lib/ai/types";
import { BottomNav } from "./BottomNav";

type NavTab = "dashboard" | "menu" | "chat" | "profile";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onGeneratePlan?: () => void;
}

const days: { id: DayId; label: string; full: string }[] = [
  { id: "lun", label: "L", full: "Lunes" },
  { id: "mar", label: "M", full: "Martes" },
  { id: "mie", label: "X", full: "Miércoles" },
  { id: "jue", label: "J", full: "Jueves" },
  { id: "vie", label: "V", full: "Viernes" },
  { id: "sab", label: "S", full: "Sábado" },
  { id: "dom", label: "D", full: "Domingo" },
];

const mealSections: {
  key: MealSlot;
  emoji: string;
  label: string;
  color: string;
  bg: string;
  kcal: string;
}[] = [
  {
    key: "desayuno",
    emoji: "🌅",
    label: "Desayuno",
    color: "#D97706",
    bg: "#FFFBEB",
    kcal: "380",
  },
  {
    key: "almuerzo",
    emoji: "☀️",
    label: "Almuerzo",
    color: "#16A34A",
    bg: "#F0FDF4",
    kcal: "620",
  },
  {
    key: "cena",
    emoji: "🌙",
    label: "Cena",
    color: "#7C3AED",
    bg: "#F3F0FF",
    kcal: "420",
  },
  {
    key: "snacks",
    emoji: "🍎",
    label: "Snacks",
    color: "#0891B2",
    bg: "#F0F9FF",
    kcal: "200",
  },
];

function formatDailyKcal(kcal: number): string {
  return kcal.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

export function WeeklyMenuScreen({ onTabChange, onGeneratePlan }: Props) {
  const { plan } = usePlan();
  const [activeDay, setActiveDay] = useState<DayId>("lun");

  const handleGeneratePlan = () => {
    if (onGeneratePlan) {
      onGeneratePlan();
      return;
    }

    onTabChange("dashboard");
  };

  if (!plan) {
    return (
      <div
        className="absolute inset-0 flex flex-col"
        style={{ background: "#F7FAF8" }}
      >
        <div
          className="pt-14 px-6 pb-4"
          style={{
            background: "white",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <h1
            style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0D1F16" }}
          >
            Menú semanal
          </h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}
          >
            <span style={{ fontSize: "2.2rem" }}>🥗</span>
          </div>
          <h2
            style={{
              fontSize: "1.15rem",
              fontWeight: 800,
              color: "#0D1F16",
              lineHeight: 1.35,
            }}
          >
            Aún no has generado un plan
          </h2>
          <p
            className="mt-3"
            style={{
              color: "#6B8072",
              fontSize: "0.88rem",
              fontWeight: 500,
              lineHeight: 1.55,
              maxWidth: "280px",
            }}
          >
            Genera tu menú semanal con IA según tu presupuesto, objetivos y
            supermercados.
          </p>
          <button
            type="button"
            onClick={handleGeneratePlan}
            className="mt-8 px-8 py-3.5 rounded-2xl active:scale-95 transition-transform"
            style={{
              background: "#16A34A",
              color: "white",
              fontWeight: 800,
              fontSize: "0.95rem",
              boxShadow: "0 4px 16px rgba(22,163,74,0.35)",
            }}
          >
            Generar plan
          </button>
        </div>

        <BottomNav active="menu" onChange={onTabChange} />
      </div>
    );
  }

  const dayMenu: DayMenu = plan.weekly_menu[activeDay];
  const dayFull = days.find((d) => d.id === activeDay)?.full ?? "";
  const dailyKcalLabel = formatDailyKcal(plan.summary.estimated_daily_kcal);

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "#F7FAF8" }}
    >
      <div
        className="pt-14 px-6 pb-4"
        style={{
          background: "white",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0D1F16" }}>
          Menú semanal
        </h1>
        <p style={{ color: "#6B8072", fontSize: "0.8rem", fontWeight: 400 }}>
          {dailyKcalLabel} kcal/día · Generado por IA
        </p>
      </div>

      <div
        className="px-4 py-3"
        style={{
          background: "white",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {days.map((day) => {
            const isActive = activeDay === day.id;

            return (
              <button
                key={day.id}
                type="button"
                onClick={() => setActiveDay(day.id)}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all active:scale-90"
                style={{
                  background: isActive ? "#16A34A" : "#F0F5F1",
                  minWidth: "44px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: isActive ? "white" : "#6B8072",
                  }}
                >
                  {day.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-3 flex items-center justify-between">
        <div>
          <p
            style={{ fontWeight: 800, color: "#0D1F16", fontSize: "1.05rem" }}
          >
            {dayFull}
          </p>
          <p
            style={{ color: "#9CA3AF", fontSize: "0.75rem", fontWeight: 500 }}
          >
            4 comidas · {dailyKcalLabel} kcal
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: "#DCFCE7" }}
        >
          <span style={{ fontSize: "0.8rem" }}>✅</span>
          <span
            style={{ color: "#16A34A", fontSize: "0.72rem", fontWeight: 700 }}
          >
            Plan activo
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 px-6 space-y-4">
        {mealSections.map(({ key, emoji, label, color, bg, kcal }) => (
          <div
            key={key}
            className="rounded-3xl overflow-hidden"
            style={{
              background: "white",
              border: `1.5px solid ${color}15`,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: bg, borderBottom: `1px solid ${color}15` }}
            >
              <div className="flex items-center gap-2.5">
                <span style={{ fontSize: "1.3rem" }}>{emoji}</span>
                <span style={{ fontWeight: 800, color, fontSize: "0.9rem" }}>
                  {label}
                </span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs"
                style={{ background: `${color}20`, color, fontWeight: 700 }}
              >
                {kcal} kcal
              </span>
            </div>

            <div className="px-5 py-3 space-y-2">
              {dayMenu[key].map((item, index) => (
                <div key={`${key}-${index}`} className="flex items-center gap-3">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <p
                    style={{
                      color: "#374151",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                    }}
                  >
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <BottomNav active="menu" onChange={onTabChange} />
    </div>
  );
}
