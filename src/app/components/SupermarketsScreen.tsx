import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { saveUserSupermarkets } from "@/lib/supermarkets";

interface Props { onNext: (stores: string[]) => void; onBack: () => void }

const stores = [
  { id: 'D1', name: 'D1', tagline: 'Precios bajos siempre', color: '#FCD34D', bg: '#FFFBEB', textColor: '#92400E', logo: '🟡' },
  { id: 'Ara', name: 'Ara', tagline: 'Precios que te sorprenden', color: '#EF4444', bg: '#FEF2F2', textColor: '#991B1B', logo: '🔴' },
  { id: 'Exito', name: 'Éxito', tagline: 'Todo lo que necesitas', color: '#FBBF24', bg: '#FFFBEB', textColor: '#78350F', logo: '⭐' },
  { id: 'Jumbo', name: 'Jumbo', tagline: 'Lo mejor en un solo lugar', color: '#3B82F6', bg: '#EFF6FF', textColor: '#1E40AF', logo: '🔵' },
  { id: 'Carulla', name: 'Carulla', tagline: 'Calidad y frescura', color: '#16A34A', bg: '#F0FDF4', textColor: '#166534', logo: '🟢' },
];

export function SupermarketsScreen({ onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>(['D1', 'Ara']);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = () => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const toggle = (id: string) => {
    if (isLoading) return;
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
    clearError();
  };

  const handleContinue = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { error } = await saveUserSupermarkets(selected);

      if (error) {
        setErrorMessage(error);
        return;
      }

      onNext(selected);
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
            Paso 4 de 5
          </span>
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0D1F16', lineHeight: 1.2 }}>
          ¿Dónde haces el mercado?
        </h1>
        <p style={{ color: '#6B8072', fontSize: '0.875rem', marginTop: '4px', fontWeight: 400 }}>
          Selecciona los supermercados disponibles en tu zona
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {stores.map((store, i) => {
          const isSelected = selected.includes(store.id);
          return (
            <motion.button
              key={store.id}
              type="button"
              disabled={isLoading}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => toggle(store.id)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-3xl transition-all active:scale-[0.98] disabled:opacity-60"
              style={{
                border: `2px solid ${isSelected ? store.color : 'rgba(0,0,0,0.07)'}`,
                background: isSelected ? store.bg : 'white',
                boxShadow: isSelected ? `0 4px 20px ${store.color}30` : '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: store.bg, border: `1.5px solid ${store.color}40` }}
              >
                <span style={{ fontSize: '1.6rem' }}>{store.logo}</span>
              </div>

              <div className="flex-1 text-left">
                <p style={{ fontWeight: 800, color: isSelected ? store.textColor : '#0D1F16', fontSize: '1.05rem' }}>
                  {store.name}
                </p>
                <p style={{ color: '#9CA3AF', fontSize: '0.78rem', fontWeight: 400 }}>{store.tagline}</p>
              </div>

              <div
                className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: isSelected ? store.color : 'transparent',
                  border: `2px solid ${isSelected ? store.color : '#D1D5DB'}`,
                }}
              >
                {isSelected && (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1.5 4.5l3 3 5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </motion.button>
          );
        })}
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
          disabled={selected.length === 0 || isLoading}
          className="w-full py-4 rounded-2xl text-white active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: '#16A34A', fontWeight: 800, fontSize: '1rem', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Guardando supermercados...
            </>
          ) : (
            "Continuar"
          )}
        </button>
      </div>
    </div>
  );
}
