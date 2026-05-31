import { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BottomNav } from "./BottomNav";

type NavTab = 'dashboard' | 'menu' | 'chat' | 'profile';

interface Props { onTabChange: (tab: NavTab) => void }

interface Message {
  id: number;
  role: 'user' | 'ai';
  text: string;
  time: string;
}

const initialMessages: Message[] = [
  {
    id: 1, role: 'ai',
    text: '¡Hola! 👋 Soy tu asistente FitMarket AI. Puedo reajustar tu plan si algo no salió como esperabas. ¿Qué pasó hoy?',
    time: '9:00',
  },
  {
    id: 2, role: 'user',
    text: 'No seguí el plan hoy 😔 Comí pizza y helado en la tarde.',
    time: '9:05',
  },
  {
    id: 3, role: 'ai',
    text: '¡No te preocupes! Un día fuera del plan no arruina nada. He ajustado el resto de la semana para compensar de manera saludable y sin que te sientas con hambre. 💪',
    time: '9:05',
  },
  {
    id: 4, role: 'ai',
    text: '📋 **Cambios realizados:**\n• Martes: Cena más ligera (ensalada + proteína)\n• Miércoles: Desayuno sin carbohidratos simples\n• Snacks: Reemplazados por frutas de bajo índice glucémico\n\n¿Quieres ver el plan actualizado?',
    time: '9:05',
  },
];

const quickReplies = [
  '¿Qué como en el almuerzo?',
  'No tengo ese ingrediente',
  'Ajusta el presupuesto',
  'Ver plan actualizado',
];

const aiResponses: Record<string, string> = {
  '¿Qué como en el almuerzo?': '🍽️ Para hoy te recomiendo: Pechuga de pollo a la plancha (150g) + arroz integral (½ taza) + ensalada verde. Esto te dará ~520 kcal con alta proteína para recuperarte bien.',
  'No tengo ese ingrediente': '¡Sin problema! Dime cuál ingrediente no tienes y busco la mejor sustitución que mantenga el mismo valor nutricional y no supere tu presupuesto. 🔄',
  'Ajusta el presupuesto': '💰 Claro. ¿Cuánto tienes disponible esta semana? Puedo reorganizar toda la lista de mercado para ajustarse al nuevo monto sin sacrificar nutrición.',
  'Ver plan actualizado': '📅 Tu plan actualizado ya está listo en la sección "Menú". El martes y miércoles tienen ajustes para compensar el día de hoy. ¿Quieres que también ajuste la lista de mercado? 🛒',
};

export function ChatScreen({ onTabChange }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    const userMsg: Message = { id: Date.now(), role: 'user', text, time: timeStr };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const reply = aiResponses[text] ?? '✨ Entendido. Estoy analizando tu situación y ajustando el plan. Dame un momento para optimizar todo según tu progreso actual.';
      const aiMsg: Message = { id: Date.now() + 1, role: 'ai', text: reply, time: timeStr };
      setMessages((m) => [...m, aiMsg]);
      setIsTyping(false);
    }, 1400);
  };

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: '#F7FAF8' }}>
      {/* Header */}
      <div
        className="pt-14 px-6 pb-4 flex items-center gap-3"
        style={{ background: 'white', borderBottom: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #16A34A, #22C55E)' }}
        >
          <Sparkles size={18} style={{ color: 'white' }} />
        </div>
        <div>
          <p style={{ fontWeight: 800, color: '#0D1F16', fontSize: '1rem' }}>FitMarket AI</p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
            <p style={{ color: '#16A34A', fontSize: '0.72rem', fontWeight: 600 }}>En línea · Reajuste inteligente</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-4">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
          >
            {msg.role === 'ai' && (
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5"
                style={{ background: 'linear-gradient(135deg, #16A34A, #22C55E)' }}
              >
                <span style={{ fontSize: '0.8rem' }}>🤖</span>
              </div>
            )}
            <div style={{ maxWidth: '78%' }}>
              <div
                className="px-4 py-3 rounded-2xl"
                style={{
                  background: msg.role === 'user' ? '#16A34A' : 'white',
                  borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  border: msg.role === 'ai' ? '1px solid rgba(0,0,0,0.05)' : 'none',
                }}
              >
                <p
                  style={{
                    color: msg.role === 'user' ? 'white' : '#0D1F16',
                    fontSize: '0.875rem',
                    lineHeight: 1.55,
                    fontWeight: 400,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {msg.text}
                </p>
              </div>
              <p className="mt-1 px-1" style={{ color: '#9CA3AF', fontSize: '0.65rem', textAlign: msg.role === 'user' ? 'right' : 'left', fontWeight: 500 }}>
                {msg.time}
              </p>
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex items-end gap-2"
            >
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #16A34A, #22C55E)' }}
              >
                <span style={{ fontSize: '0.8rem' }}>🤖</span>
              </div>
              <div
                className="px-4 py-3.5 rounded-2xl flex gap-1"
                style={{ background: 'white', borderRadius: '20px 20px 20px 4px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#9CA3AF' }}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.16 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {/* Quick replies */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {quickReplies.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="flex-shrink-0 px-3.5 py-2 rounded-full text-xs active:scale-95 transition-transform"
              style={{ background: '#F0FDF4', border: '1.5px solid rgba(22,163,74,0.2)', color: '#16A34A', fontWeight: 700 }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ background: 'white', borderTop: '1px solid rgba(0,0,0,0.05)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
          placeholder="Escríbele a tu IA..."
          className="flex-1 px-4 py-3 rounded-2xl text-sm"
          style={{ background: '#F0F5F1', border: 'none', outline: 'none', color: '#0D1F16', fontWeight: 400 }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim()}
          className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
          style={{ background: '#16A34A', boxShadow: '0 4px 12px rgba(22,163,74,0.4)' }}
        >
          <Send size={18} style={{ color: 'white' }} strokeWidth={2.5} />
        </button>
      </div>

      <BottomNav active="chat" onChange={onTabChange} />
    </div>
  );
}
