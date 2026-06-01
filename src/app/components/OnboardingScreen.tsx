import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";

interface Props {
  onNext: () => void;
  onGoToLogin: () => void;
}

const slides = [
  {
    emoji: '🛒',
    bg: '#DCFCE7',
    iconBg: '#16A34A',
    title: 'Compra mejor',
    subtitle: 'La IA crea listas de mercado adaptadas a tu presupuesto y al supermercado que prefieras.',
    accent: '#16A34A',
  },
  {
    emoji: '🥗',
    bg: '#EFF6FF',
    iconBg: '#2563EB',
    title: 'Come mejor',
    subtitle: 'Recibe menús personalizados según tus objetivos, ya sea ganar músculo, perder grasa o simplemente comer bien.',
    accent: '#2563EB',
  },
  {
    emoji: '✨',
    bg: '#FFF7ED',
    iconBg: '#EA580C',
    title: 'Adáptate sin culpa',
    subtitle: 'Si no sigues el plan, la IA reajusta automáticamente el resto de la semana. Sin juzgarte.',
    accent: '#EA580C',
  },
];

export function OnboardingScreen({ onNext, onGoToLogin }: Props) {
  const [current, setCurrent] = useState(0);
  const slide = slides[current];
  const isLast = current === slides.length - 1;

  const handleNext = () => {
    if (isLast) onNext();
    else setCurrent((c) => c + 1);
  };

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: slide.bg, transition: 'background 0.5s' }}>
      {/* Skip */}
      <div className="flex justify-end px-6 pt-16">
        {!isLast && (
          <button onClick={onNext} className="text-sm px-4 py-2 rounded-full" style={{ color: '#6B7280', background: 'rgba(0,0,0,0.06)', fontWeight: 600 }}>
            Saltar
          </button>
        )}
      </div>

      {/* Illustration */}
      <div className="flex-1 flex items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ scale: 0.7, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.7, opacity: 0, rotate: 6 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="flex flex-col items-center gap-8"
          >
            {/* Big emoji circle */}
            <div
              className="w-44 h-44 rounded-[3rem] flex items-center justify-center"
              style={{ background: slide.iconBg, boxShadow: `0 20px 60px ${slide.iconBg}55` }}
            >
              <span style={{ fontSize: '5rem' }}>{slide.emoji}</span>
            </div>

            <div className="text-center">
              <h2 className="text-[#0D1F16]" style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.2 }}>
                {slide.title}
              </h2>
              <p className="mt-3 text-[#4B6557]" style={{ fontSize: '0.95rem', lineHeight: 1.7, fontWeight: 400 }}>
                {slide.subtitle}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom */}
      <div className="px-8 pb-12 space-y-6">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}>
              <motion.div
                animate={{ width: i === current ? 24 : 8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="h-2 rounded-full"
                style={{ background: i === current ? slide.accent : '#CBD5C0' }}
              />
            </button>
          ))}
        </div>

        {/* Next button */}
        <button
          type="button"
          onClick={handleNext}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          style={{ background: slide.accent, color: 'white', fontWeight: 800, fontSize: '1rem' }}
        >
          {isLast ? 'Crear mi cuenta' : 'Siguiente'}
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>

        <p className="text-center text-sm" style={{ color: '#6B8072', fontWeight: 500 }}>
          ¿Ya tienes cuenta?{' '}
          <button
            type="button"
            onClick={onGoToLogin}
            style={{
              color: slide.accent,
              fontWeight: 700,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            Inicia sesión
          </button>
        </p>
      </div>
    </div>
  );
}
