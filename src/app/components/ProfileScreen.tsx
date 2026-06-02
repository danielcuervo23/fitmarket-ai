import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { isActivityLevel, upsertProfile, type ActivityLevel } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

interface Props {
  name: string;
  onNext: () => void;
  onBack: () => void;
}

const activityLevels: {
  id: ActivityLevel;
  label: string;
  desc: string;
  emoji: string;
}[] = [
  { id: 'sedentary', label: 'Sedentario', desc: 'Poco o nada de ejercicio', emoji: '🪑' },
  { id: 'light', label: 'Ligero', desc: '1-3 días/semana', emoji: '🚶' },
  { id: 'moderate', label: 'Moderado', desc: '3-5 días/semana', emoji: '🏃' },
  { id: 'active', label: 'Activo', desc: '6-7 días/semana', emoji: '💪' },
  { id: 'very_active', label: 'Muy activo', desc: 'Atleta / trabajo físico', emoji: '🏆' },
];

export function ProfileScreen({ name, onNext, onBack }: Props) {
  const [age, setAge] = useState(28);
  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [weight, setWeight] = useState(65);
  const [height, setHeight] = useState(165);
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!isActivityLevel(activity)) {
      setErrorMessage("Selecciona un nivel de actividad válido.");
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setErrorMessage(
          "Debes iniciar sesión para guardar tu perfil. Si acabas de registrarte, confirma tu correo e inicia sesión.",
        );
        return;
      }

      const { error } = await upsertProfile({
        age,
        weight,
        height,
        activity_level: activity,
    });

      if (error) {
        setErrorMessage(error);
        return;
      }

      onNext();
    } catch {
      setErrorMessage("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      {/* Header */}
      <div className="pt-14 px-6 pb-4 border-b border-gray-50">
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
            Paso 1 de 5
          </span>
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0D1F16', lineHeight: 1.2 }}>
          Cuéntanos sobre ti, {name.split(' ')[0]}
        </h1>
        <p style={{ color: '#6B8072', fontSize: '0.875rem', marginTop: '4px', fontWeight: 400 }}>
          Para personalizar tu plan de alimentación
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Sex */}
        <div>
          <p className="text-xs mb-2.5" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sexo biológico</p>
          <div className="grid grid-cols-2 gap-3">
            {(['female', 'male'] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={isLoading}
                onClick={() => setSex(s)}
                className="py-4 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
                style={{
                  border: `2px solid ${sex === s ? '#16A34A' : 'rgba(0,0,0,0.08)'}`,
                  background: sex === s ? '#F0FDF4' : 'white',
                }}
              >
                <span style={{ fontSize: '2rem' }}>{s === 'female' ? '👩' : '👨'}</span>
                <span style={{ fontWeight: 700, color: sex === s ? '#16A34A' : '#374151', fontSize: '0.875rem' }}>
                  {s === 'female' ? 'Mujer' : 'Hombre'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Age */}
        <div>
          <div className="flex justify-between items-center mb-2.5">
            <p className="text-xs" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edad</p>
            <span style={{ color: '#16A34A', fontWeight: 800, fontSize: '1.1rem' }}>{age} años</span>
          </div>
          <input
            type="range" min={14} max={80} value={age}
            disabled={isLoading}
            onChange={(e) => setAge(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: '#16A34A', background: `linear-gradient(to right, #16A34A ${((age - 14) / 66) * 100}%, #E5E7EB ${((age - 14) / 66) * 100}%)` }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: '#9CA3AF' }}>14</span>
            <span className="text-xs" style={{ color: '#9CA3AF' }}>80</span>
          </div>
        </div>

        {/* Weight & Height */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Peso', unit: 'kg', value: weight, setter: setWeight, min: 40, max: 150 },
            { label: 'Altura', unit: 'cm', value: height, setter: setHeight, min: 140, max: 220 },
          ].map(({ label, unit, value, setter, min, max }) => (
            <div key={label}>
              <p className="text-xs mb-2" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
              <div
                className="rounded-2xl p-4 flex flex-col items-center gap-3"
                style={{ border: '1.5px solid rgba(22,163,74,0.15)', background: '#F7FAF8' }}
              >
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0D1F16' }}>
                  {value}
                  <span style={{ fontSize: '0.8rem', color: '#6B8072', fontWeight: 600 }}> {unit}</span>
                </span>
                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setter((v) => Math.max(min, v - 1))}
                    className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: '#DCFCE7', color: '#16A34A', fontWeight: 800, fontSize: '1.2rem' }}
                  >−</button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setter((v) => Math.min(max, v + 1))}
                    className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: '#16A34A', color: 'white', fontWeight: 800, fontSize: '1.2rem' }}
                  >+</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Activity */}
        <div>
          <p className="text-xs mb-2.5" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Nivel de actividad</p>
          <div className="space-y-2">
            {activityLevels.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                disabled={isLoading}
                onClick={() => setActivity(lvl.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98]"
                style={{
                  border: `1.5px solid ${activity === lvl.id ? '#16A34A' : 'rgba(0,0,0,0.08)'}`,
                  background: activity === lvl.id ? '#F0FDF4' : 'white',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{lvl.emoji}</span>
                <div className="flex-1 text-left">
                  <p style={{ fontWeight: 700, color: '#0D1F16', fontSize: '0.875rem' }}>{lvl.label}</p>
                  <p style={{ color: '#9CA3AF', fontSize: '0.75rem', fontWeight: 400 }}>{lvl.desc}</p>
                </div>
                {activity === lvl.id && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#16A34A' }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            ))}
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
          disabled={isLoading}
          className="w-full py-4 rounded-2xl text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70 disabled:cursor-not-allowed"
          style={{ background: '#16A34A', fontWeight: 800, fontSize: '1rem', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Guardando perfil...
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
