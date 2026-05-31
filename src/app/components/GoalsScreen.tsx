import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

interface Props { onNext: (goals: string[]) => void; onBack: () => void }

const goals = [
  { id: 'muscle', emoji: '💪', label: 'Ganar masa muscular', color: '#7C3AED', bg: '#F3F0FF' },
  { id: 'fat', emoji: '🔥', label: 'Perder grasa', color: '#DC2626', bg: '#FEF2F2' },
  { id: 'healthy', emoji: '🥗', label: 'Comer saludable', color: '#16A34A', bg: '#F0FDF4' },
  { id: 'save', emoji: '💰', label: 'Ahorrar dinero', color: '#D97706', bg: '#FFFBEB' },
  { id: 'family', emoji: '👨‍👩‍👧', label: 'Alimentación familiar', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'energy', emoji: '⚡', label: 'Mejorar mi energía', color: '#0891B2', bg: '#F0F9FF' },
];

export function GoalsScreen({ onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>(['healthy']);

  const toggle = (id: string) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="pt-14 px-6 pb-4 border-b border-gray-50">
        <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ background: '#F0F5F1' }}>
          <ArrowLeft size={20} style={{ color: '#374151' }} />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm px-3 py-1 rounded-full" style={{ background: '#DCFCE7', color: '#16A34A', fontWeight: 700 }}>
            Paso 2 de 4
          </span>
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0D1F16', lineHeight: 1.2 }}>
          ¿Cuál es tu objetivo?
        </h1>
        <p style={{ color: '#6B8072', fontSize: '0.875rem', marginTop: '4px', fontWeight: 400 }}>
          Puedes elegir más de uno
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          {goals.map((goal) => {
            const isSelected = selected.includes(goal.id);
            return (
              <button
                key={goal.id}
                onClick={() => toggle(goal.id)}
                className="relative flex flex-col items-center gap-3 p-5 rounded-3xl transition-all active:scale-95"
                style={{
                  border: `2px solid ${isSelected ? goal.color : 'rgba(0,0,0,0.07)'}`,
                  background: isSelected ? goal.bg : 'white',
                  boxShadow: isSelected ? `0 4px 20px ${goal.color}22` : '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                {isSelected && (
                  <div
                    className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: goal.color }}
                  >
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <span style={{ fontSize: '2.2rem' }}>{goal.emoji}</span>
                <p style={{ fontWeight: 700, color: isSelected ? goal.color : '#374151', fontSize: '0.8rem', textAlign: 'center', lineHeight: 1.3 }}>
                  {goal.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 pb-10">
        <button
          onClick={() => onNext(selected)}
          disabled={selected.length === 0}
          className="w-full py-4 rounded-2xl text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          style={{ background: '#16A34A', fontWeight: 800, fontSize: '1rem', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
        >
          Continuar ({selected.length} elegido{selected.length !== 1 ? 's' : ''})
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
