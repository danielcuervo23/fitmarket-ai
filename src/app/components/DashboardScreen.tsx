import { ShoppingCart, TrendingDown, Bell, ChevronRight, Sparkles } from "lucide-react";
import { BottomNav } from "./BottomNav";

type NavTab = 'dashboard' | 'menu' | 'chat' | 'profile';

interface Props {
  name: string;
  budget: number;
  onTabChange: (tab: NavTab) => void;
}

const categories = [
  { emoji: '🥩', label: 'Proteínas', items: 8, color: '#DC2626', bg: '#FEF2F2', kg: '2.4 kg' },
  { emoji: '🌾', label: 'Carbohidratos', items: 6, color: '#D97706', bg: '#FFFBEB', kg: '3.1 kg' },
  { emoji: '🍎', label: 'Frutas', items: 7, color: '#16A34A', bg: '#F0FDF4', kg: '2.0 kg' },
  { emoji: '🥦', label: 'Verduras', items: 9, color: '#2563EB', bg: '#EFF6FF', kg: '1.8 kg' },
];

const groceryItems = [
  { name: 'Pechuga de pollo', qty: '1 kg', price: '$12.900', cat: '🥩', store: 'D1' },
  { name: 'Arroz integral', qty: '2 kg', price: '$8.500', cat: '🌾', store: 'Ara' },
  { name: 'Huevos', qty: '30 und', price: '$14.000', cat: '🥩', store: 'D1' },
  { name: 'Avena', qty: '1 kg', price: '$5.200', cat: '🌾', store: 'D1' },
  { name: 'Plátanos', qty: '6 und', price: '$3.800', cat: '🍎', store: 'Ara' },
  { name: 'Brócoli', qty: '500 g', price: '$4.500', cat: '🥦', store: 'Ara' },
];

function formatCOP(val: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
}

export function DashboardScreen({ name, budget, onTabChange }: Props) {
  const spent = Math.round(budget * 0.78);
  const firstName = name.split(' ')[0];

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: '#F7FAF8' }}>
      {/* Header */}
      <div
        className="px-6 pt-14 pb-6"
        style={{ background: 'linear-gradient(160deg, #0A3D21, #16A34A)', borderBottomLeftRadius: '2rem', borderBottomRightRadius: '2rem' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem', fontWeight: 600 }}>Bienvenida de vuelta</p>
            <h1 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 900 }}>Hola, {firstName} 👋</h1>
          </div>
          <button className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Bell size={18} style={{ color: 'white' }} />
          </button>
        </div>

        {/* Budget card */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
          <div className="flex justify-between items-start mb-3">
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 600 }}>Presupuesto semanal</p>
              <p style={{ color: 'white', fontSize: '1.8rem', fontWeight: 900 }}>{formatCOP(budget)}</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(134,239,172,0.25)', border: '1px solid rgba(134,239,172,0.4)' }}>
              <TrendingDown size={13} style={{ color: '#86EFAC' }} strokeWidth={2.5} />
              <span style={{ color: '#86EFAC', fontSize: '0.72rem', fontWeight: 700 }}>−22% vs antes</span>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', fontWeight: 500 }}>Utilizado: {formatCOP(spent)}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', fontWeight: 500 }}>{Math.round((spent / budget) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${(spent / budget) * 100}%`, background: 'linear-gradient(90deg, #86EFAC, #4ADE80)' }}
              />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 500 }}>
              Disponible: {formatCOP(budget - spent)}
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-24 space-y-5 pt-5">
        {/* Category cards */}
        <div className="px-6">
          <p className="text-xs mb-3" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Por categoría
          </p>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => (
              <div
                key={cat.label}
                className="p-4 rounded-2xl"
                style={{ background: cat.bg, border: `1.5px solid ${cat.color}20` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: '1.5rem' }}>{cat.emoji}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cat.color, background: `${cat.color}15`, padding: '2px 8px', borderRadius: '99px' }}>
                    {cat.items} items
                  </span>
                </div>
                <p style={{ fontWeight: 800, color: '#0D1F16', fontSize: '0.875rem' }}>{cat.label}</p>
                <p style={{ color: '#9CA3AF', fontSize: '0.75rem', fontWeight: 500 }}>{cat.kg} total</p>
              </div>
            ))}
          </div>
        </div>

        {/* Generate menu CTA */}
        <div className="px-6">
          <button
            onClick={() => onTabChange('menu')}
            className="w-full p-4 rounded-2xl flex items-center gap-3 active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Sparkles size={20} style={{ color: 'white' }} />
            </div>
            <div className="flex-1 text-left">
              <p style={{ color: 'white', fontWeight: 800, fontSize: '0.9rem' }}>Generar menú semanal</p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem', fontWeight: 400 }}>7 días · 4 comidas/día</p>
            </div>
            <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
          </button>
        </div>

        {/* Grocery list */}
        <div className="px-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Lista de mercado
            </p>
            <button style={{ color: '#16A34A', fontSize: '0.8rem', fontWeight: 700 }}>Ver todo</button>
          </div>

          <div className="rounded-3xl overflow-hidden" style={{ background: 'white', border: '1.5px solid rgba(22,163,74,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            {groceryItems.map((item, i) => (
              <div
                key={item.name}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: i < groceryItems.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}
              >
                <span style={{ fontSize: '1.2rem', width: '28px', textAlign: 'center' }}>{item.cat}</span>
                <div className="flex-1 min-w-0">
                  <p style={{ fontWeight: 700, color: '#0D1F16', fontSize: '0.85rem' }}>{item.name}</p>
                  <p style={{ color: '#9CA3AF', fontSize: '0.72rem', fontWeight: 500 }}>{item.qty} · {item.store}</p>
                </div>
                <span style={{ fontWeight: 800, color: '#16A34A', fontSize: '0.85rem' }}>{item.price}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-2xl mt-3"
            style={{ background: '#F0FDF4', border: '1.5px solid rgba(22,163,74,0.15)' }}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: '#16A34A' }} strokeWidth={2.5} />
              <span style={{ fontWeight: 700, color: '#374151', fontSize: '0.875rem' }}>Total estimado</span>
            </div>
            <span style={{ fontWeight: 900, color: '#16A34A', fontSize: '1rem' }}>{formatCOP(spent)}</span>
          </div>
        </div>
      </div>

      <BottomNav active="dashboard" onChange={onTabChange} />
    </div>
  );
}
