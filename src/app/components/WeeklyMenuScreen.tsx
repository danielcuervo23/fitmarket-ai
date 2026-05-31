import { useState } from "react";
import { BottomNav } from "./BottomNav";

type NavTab = 'dashboard' | 'menu' | 'chat' | 'profile';

interface Props { onTabChange: (tab: NavTab) => void }

const days = [
  { id: 'lun', label: 'L', full: 'Lunes' },
  { id: 'mar', label: 'M', full: 'Martes' },
  { id: 'mie', label: 'X', full: 'Miércoles' },
  { id: 'jue', label: 'J', full: 'Jueves' },
  { id: 'vie', label: 'V', full: 'Viernes' },
  { id: 'sab', label: 'S', full: 'Sábado' },
  { id: 'dom', label: 'D', full: 'Domingo' },
];

const menu: Record<string, { desayuno: string[]; almuerzo: string[]; cena: string[]; snacks: string[] }> = {
  lun: {
    desayuno: ['Avena con frutas y miel', 'Huevo revuelto (2)', 'Té verde'],
    almuerzo: ['Pechuga de pollo asada 150g', 'Arroz integral 1 taza', 'Ensalada verde + tomate', 'Jugo de naranja'],
    cena: ['Sopa de verduras', 'Pan integral (2 rebanadas)', 'Infusión de manzanilla'],
    snacks: ['Manzana', 'Mix de nueces 30g'],
  },
  mar: {
    desayuno: ['Yogur griego con granola', 'Plátano', 'Café negro'],
    almuerzo: ['Atún en agua 1 lata', 'Pasta integral 1 taza', 'Brócoli al vapor', 'Agua'],
    cena: ['Omelette de espinacas (2 huevos)', 'Ensalada mixta', 'Té de hierbas'],
    snacks: ['Zanahoria + hummus', 'Pera'],
  },
  mie: {
    desayuno: ['Tostadas integrales + aguacate', 'Huevo pasado 2', 'Jugo verde'],
    almuerzo: ['Lentejas estofadas', 'Arroz blanco ½ taza', 'Plátano maduro', 'Limonada'],
    cena: ['Pechuga de pollo a la plancha', 'Ensalada de pepino', 'Infusión'],
    snacks: ['Naranja', 'Galletas de arroz'],
  },
  jue: {
    desayuno: ['Avena + proteína en polvo', 'Fresas 1 taza', 'Leche descremada'],
    almuerzo: ['Carne de res magra 120g', 'Papa cocida mediana', 'Espinacas salteadas', 'Agua con limón'],
    cena: ['Crema de auyama', 'Quesillo bajo en grasa', 'Té verde'],
    snacks: ['Mango 1 porción', 'Almendras 15 und'],
  },
  vie: {
    desayuno: ['Pancakes de avena (3)', 'Frutas frescas', 'Café con leche'],
    almuerzo: ['Salmón al horno 150g', 'Quinoa ½ taza', 'Espárragos', 'Agua mineral'],
    cena: ['Pizza integral casera', 'Ensalada césar light', 'Limonada'],
    snacks: ['Banano', 'Yogur bajo en grasa'],
  },
  sab: {
    desayuno: ['Calentado especial', 'Jugo de guayaba', 'Arepa pequeña'],
    almuerzo: ['Sancocho de pollo', 'Arroz blanco', 'Aguacate ¼', 'Jugo natural'],
    cena: ['Ensalada de atún completa', 'Galletas integrales', 'Té de jengibre'],
    snacks: ['Papaya 1 taza', 'Palomitas de maíz naturales'],
  },
  dom: {
    desayuno: ['Huevos pericos + tomate', 'Arepas de choclo (2)', 'Chocolate caliente light'],
    almuerzo: ['Pollo asado familiar 150g', 'Puré de papa light', 'Habichuelas', 'Jugo de maracuyá'],
    cena: ['Sopa de pasta', 'Queso fresco pequeño', 'Infusión de manzanilla'],
    snacks: ['Gelatina light', 'Manzana verde'],
  },
};

const mealSections = [
  { key: 'desayuno' as const, emoji: '🌅', label: 'Desayuno', color: '#D97706', bg: '#FFFBEB', kcal: '380' },
  { key: 'almuerzo' as const, emoji: '☀️', label: 'Almuerzo', color: '#16A34A', bg: '#F0FDF4', kcal: '620' },
  { key: 'cena' as const, emoji: '🌙', label: 'Cena', color: '#7C3AED', bg: '#F3F0FF', kcal: '420' },
  { key: 'snacks' as const, emoji: '🍎', label: 'Snacks', color: '#0891B2', bg: '#F0F9FF', kcal: '200' },
];

export function WeeklyMenuScreen({ onTabChange }: Props) {
  const [activeDay, setActiveDay] = useState('lun');
  const dayMenu = menu[activeDay];
  const dayFull = days.find((d) => d.id === activeDay)?.full ?? '';

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: '#F7FAF8' }}>
      {/* Header */}
      <div className="pt-14 px-6 pb-4" style={{ background: 'white', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0D1F16' }}>Menú semanal</h1>
        <p style={{ color: '#6B8072', fontSize: '0.8rem', fontWeight: 400 }}>1.620 kcal/día · Generado por IA</p>
      </div>

      {/* Day tabs */}
      <div className="px-4 py-3" style={{ background: 'white', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {days.map((day) => {
            const isActive = activeDay === day.id;
            return (
              <button
                key={day.id}
                onClick={() => setActiveDay(day.id)}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all active:scale-90"
                style={{
                  background: isActive ? '#16A34A' : '#F0F5F1',
                  minWidth: '44px',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isActive ? 'white' : '#6B8072' }}>
                  {day.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day title */}
      <div className="px-6 py-3 flex items-center justify-between">
        <div>
          <p style={{ fontWeight: 800, color: '#0D1F16', fontSize: '1.05rem' }}>{dayFull}</p>
          <p style={{ color: '#9CA3AF', fontSize: '0.75rem', fontWeight: 500 }}>4 comidas · 1.620 kcal</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: '#DCFCE7' }}>
          <span style={{ fontSize: '0.8rem' }}>✅</span>
          <span style={{ color: '#16A34A', fontSize: '0.72rem', fontWeight: 700 }}>Plan activo</span>
        </div>
      </div>

      {/* Meals */}
      <div className="flex-1 overflow-y-auto pb-24 px-6 space-y-4">
        {mealSections.map(({ key, emoji, label, color, bg, kcal }) => (
          <div key={key} className="rounded-3xl overflow-hidden" style={{ background: 'white', border: `1.5px solid ${color}15`, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            {/* Meal header */}
            <div className="flex items-center justify-between px-5 py-3.5" style={{ background: bg, borderBottom: `1px solid ${color}15` }}>
              <div className="flex items-center gap-2.5">
                <span style={{ fontSize: '1.3rem' }}>{emoji}</span>
                <span style={{ fontWeight: 800, color, fontSize: '0.9rem' }}>{label}</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs"
                style={{ background: `${color}20`, color, fontWeight: 700 }}
              >
                {kcal} kcal
              </span>
            </div>

            {/* Items */}
            <div className="px-5 py-3 space-y-2">
              {dayMenu[key].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <p style={{ color: '#374151', fontSize: '0.85rem', fontWeight: 500 }}>{item}</p>
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
