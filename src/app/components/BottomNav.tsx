import { Home, CalendarDays, MessageCircle, User } from "lucide-react";

type NavTab = 'dashboard' | 'menu' | 'chat' | 'profile';

interface Props {
  active: NavTab;
  onChange: (tab: NavTab) => void;
}

const tabs: { id: NavTab; label: string; Icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Inicio', Icon: Home },
  { id: 'menu', label: 'Menú', Icon: CalendarDays },
  { id: 'chat', label: 'Reajuste', Icon: MessageCircle },
  { id: 'profile', label: 'Perfil', Icon: User },
];

export function BottomNav({ active, onChange }: Props) {
  return (
    <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 flex items-center justify-around px-2 pb-4 pt-2"
      style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex flex-col items-center gap-0.5 flex-1 py-1 transition-all"
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all"
              style={{ background: isActive ? '#DCFCE7' : 'transparent' }}
            >
              <Icon
                size={20}
                style={{ color: isActive ? '#16A34A' : '#9CA3AF' }}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
            </div>
            <span
              className="text-[10px] transition-all"
              style={{
                color: isActive ? '#16A34A' : '#9CA3AF',
                fontWeight: isActive ? 700 : 500,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
