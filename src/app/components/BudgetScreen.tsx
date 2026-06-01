import { useState } from "react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { saveWeeklyBudget } from "@/lib/budget";

interface Props { onNext: (budget: number) => void; onBack: () => void }

const presets = [
  { label: '$50.000', value: 50000 },
  { label: '$100.000', value: 100000 },
  { label: '$150.000', value: 150000 },
  { label: '$200.000+', value: 200000 },
];

function formatCOP(val: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
}

export function BudgetScreen({ onNext, onBack }: Props) {
  const [selected, setSelected] = useState<number | null>(150000);
  const [custom, setCustom] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveBudget = useCustom ? (parseInt(custom.replace(/\D/g, '')) || 0) : (selected ?? 0);

  const clearError = () => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleContinue = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { error } = await saveWeeklyBudget(effectiveBudget);

      if (error) {
        setErrorMessage(error);
        return;
      }

      onNext(effectiveBudget);
    } catch {
      setErrorMessage("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="pt-14 px-6 pb-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="w-10 h-10 rounded-full flex items-center justify-center mb-4 disabled:opacity-50"
          style={{ background: '#F0F5F1' }}
        >
          <ArrowLeft size={20} style={{ color: '#374151' }} />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm px-3 py-1 rounded-full" style={{ background: '#DCFCE7', color: '#16A34A', fontWeight: 700 }}>
            Paso 3 de 4
          </span>
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0D1F16', lineHeight: 1.2 }}>
          ¿Cuál es tu presupuesto semanal?
        </h1>
        <p style={{ color: '#6B8072', fontSize: '0.875rem', marginTop: '4px', fontWeight: 400 }}>
          La IA optimizará tu mercado dentro de este rango
        </p>
      </div>

      <div className="flex-1 px-6 py-4 flex flex-col gap-6">
        <div
          className="rounded-3xl p-6 flex flex-col items-center gap-2"
          style={{ background: 'linear-gradient(135deg, #0D5C2E, #16A34A)', boxShadow: '0 12px 40px rgba(22,163,74,0.35)' }}
        >
          <p className="text-white/70 text-sm font-semibold">Presupuesto seleccionado</p>
          <p className="text-white" style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
            {effectiveBudget > 0 ? formatCOP(effectiveBudget) : '—'}
          </p>
          {effectiveBudget > 0 && (
            <p className="text-white/60 text-xs font-medium">
              ≈ {formatCOP(Math.round(effectiveBudget / 7))} por día · {formatCOP(Math.round(effectiveBudget / 21))} por comida
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {presets.map((p) => {
            const isSelected = !useCustom && selected === p.value;
            return (
              <button
                key={p.value}
                type="button"
                disabled={isLoading}
                onClick={() => { setSelected(p.value); setUseCustom(false); clearError(); }}
                className="py-5 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60"
                style={{
                  border: `2px solid ${isSelected ? '#16A34A' : 'rgba(0,0,0,0.08)'}`,
                  background: isSelected ? '#F0FDF4' : 'white',
                  boxShadow: isSelected ? '0 4px 16px rgba(22,163,74,0.18)' : 'none',
                }}
              >
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: isSelected ? '#16A34A' : '#0D1F16' }}>
                  {p.label}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500 }}>por semana</span>
              </button>
            );
          })}
        </div>

        <div>
          <p className="text-xs mb-2.5" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            O ingresa un monto personalizado
          </p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold" style={{ color: useCustom ? '#16A34A' : '#9CA3AF' }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 180.000"
              value={custom}
              disabled={isLoading}
              onFocus={() => setUseCustom(true)}
              onChange={(e) => { setCustom(e.target.value); setUseCustom(true); clearError(); }}
              className="w-full pl-8 pr-4 py-4 rounded-2xl"
              style={{
                border: `2px solid ${useCustom ? '#16A34A' : 'rgba(0,0,0,0.08)'}`,
                background: useCustom ? '#F0FDF4' : '#F7FAF8',
                outline: 'none',
                fontWeight: 700,
                fontSize: '1rem',
                color: '#0D1F16',
              }}
            />
          </div>
        </div>
      </div>

      <div className="px-6 pb-10 space-y-3">
        {errorMessage && (
          <div
            role="alert"
            className="px-4 py-3 rounded-2xl text-sm"
            style={{
              background: '#FEF2F2',
              border: '1.5px solid rgba(220,38,38,0.2)',
              color: '#991B1B',
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={effectiveBudget === 0 || isLoading}
          className="w-full py-4 rounded-2xl text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#16A34A', fontWeight: 800, fontSize: '1rem', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Guardando presupuesto...
            </>
          ) : (
            <>
              Continuar <ChevronRight size={20} strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
