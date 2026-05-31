import { motion } from "motion/react";

interface Props { onNext: () => void }

export function SplashScreen({ onNext }: Props) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-between pb-12 pt-20"
      style={{ background: 'linear-gradient(160deg, #0A3D21 0%, #145F35 40%, #1E8449 70%, #22C55E 100%)' }}
    >
      {/* Decorative circles */}
      <div className="absolute top-10 right-8 w-32 h-32 rounded-full opacity-10"
        style={{ background: '#22C55E', filter: 'blur(24px)' }} />
      <div className="absolute bottom-32 left-6 w-24 h-24 rounded-full opacity-10"
        style={{ background: '#16A34A', filter: 'blur(20px)' }} />

      {/* Logo area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 z-10">
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 180, damping: 14 }}
          className="w-28 h-28 rounded-[2rem] flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)' }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="10" y="24" width="44" height="28" rx="6" fill="white" fillOpacity="0.95" />
            <path d="M10 28h44" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
            <path d="M20 24L24 14h16l4 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="22" cy="50" r="3" fill="#16A34A" />
            <circle cx="42" cy="50" r="3" fill="#16A34A" />
            <path d="M28 34 Q32 30 36 34 Q40 38 44 34" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" fill="none" />
            {/* AI sparkle */}
            <path d="M50 12l1.5 4 4 1.5-4 1.5L50 23l-1.5-4-4-1.5 4-1.5L50 12z" fill="#FCD34D" />
            <path d="M12 8l1 2.5 2.5 1-2.5 1L12 15l-1-2.5-2.5-1 2.5-1L12 8z" fill="#FCD34D" fillOpacity="0.7" />
          </svg>
        </motion.div>

        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="text-center px-6"
        >
          <h1
            className="text-white tracking-tight"
            style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1.1 }}
          >
            FitMarket<span style={{ color: '#86EFAC' }}> AI</span>
          </h1>
          <p className="mt-4 px-4 text-center" style={{ color: 'rgba(255,255,255,0.72)', fontSize: '1rem', lineHeight: 1.65, fontWeight: 400 }}>
            Tu mercado inteligente<br />impulsado por inteligencia artificial.
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="flex gap-2 flex-wrap justify-center px-6"
        >
          {['🛒 Compra inteligente', '🥗 Come mejor', '💰 Ahorra más'].map((tag) => (
            <span
              key={tag}
              className="px-3 py-1.5 rounded-full text-xs"
              style={{ background: 'rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 600 }}
            >
              {tag}
            </span>
          ))}
        </motion.div>
      </div>

      {/* CTA */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="w-full px-8 space-y-3 z-10"
      >
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl text-base active:scale-95 transition-transform"
          style={{ background: 'white', color: '#16A34A', fontWeight: 800, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          Comenzar gratis
        </button>
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.42)', fontWeight: 500 }}>
          Sin tarjeta de crédito · Sin compromisos
        </p>
      </motion.div>
    </div>
  );
}
