import { useState } from "react";
import { motion } from "motion/react";
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface Props {
  onNext: (name: string) => void;
  onAuthenticated: (name: string) => void;
  onGoToLogin: () => void;
  onBack: () => void;
}

function validateForm(email: string, password: string): string | null {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "Ingresa tu correo electrónico.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return "Ingresa un correo electrónico válido.";
  }

  if (!password) {
    return "Ingresa una contraseña.";
  }

  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  return null;
}

function getSignUpErrorMessage(error: AuthError): string {
  const message = error.message.toLowerCase();

  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Este correo ya está registrado. Inicia sesión.";
  }

  if (message.includes("invalid") && message.includes("email")) {
    return "Ingresa un correo electrónico válido.";
  }

  if (message.includes("password") && message.includes("least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  if (message.includes("valid password")) {
    return "Ingresa una contraseña válida.";
  }

  if (message.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e intenta de nuevo.";
  }

  return "No pudimos crear tu cuenta. Revisa tus datos e intenta de nuevo.";
}

export function RegisterScreen({
  onNext,
  onAuthenticated,
  onGoToLogin,
  onBack,
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [focused, setFocused] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = () => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleSignUp = async () => {
    const validationError = validateForm(email, password);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() } },
      });

      if (error) {
        setErrorMessage(getSignUpErrorMessage(error));
        return;
      }

      const displayName = name.trim() || "Usuario";

      if (data.session) {
        onAuthenticated(displayName);
        return;
      }

      setErrorMessage(
        "Revisa tu correo y confirma tu cuenta. Luego inicia sesión para continuar con tu perfil.",
      );
    } catch {
      setErrorMessage("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const fieldStyle = (id: string) => ({
    border: `1.5px solid ${focused === id ? '#16A34A' : 'rgba(22,163,74,0.15)'}`,
    background: focused === id ? '#F0FDF4' : '#F7FAF8',
    borderRadius: '14px',
    outline: 'none',
    transition: 'all 0.2s',
  });

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      {/* Header */}
      <div className="pt-14 px-6 pb-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="w-10 h-10 rounded-full flex items-center justify-center mb-6 disabled:opacity-50"
          style={{ background: '#F0F5F1' }}
        >
          <ArrowLeft size={20} style={{ color: '#374151' }} />
        </button>
        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1 className="text-[#0D1F16]" style={{ fontSize: '1.8rem', fontWeight: 900, lineHeight: 1.2 }}>
            Crea tu cuenta
          </h1>
          <p className="mt-1.5" style={{ color: '#6B8072', fontSize: '0.9rem', fontWeight: 400 }}>
            Comienza gratis, sin tarjeta de crédito.
          </p>
        </motion.div>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
        {/* Name */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Nombre completo
          </label>
          <div className="relative">
            <User size={17} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: focused === 'name' ? '#16A34A' : '#9CA3AF' }} />
            <input
              type="text"
              placeholder="María García"
              value={name}
              disabled={isLoading}
              onChange={(e) => { setName(e.target.value); clearError(); }}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused('')}
              className="w-full pl-11 pr-4 py-3.5"
              style={fieldStyle('name')}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Correo electrónico
          </label>
          <div className="relative">
            <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: focused === 'email' ? '#16A34A' : '#9CA3AF' }} />
            <input
              type="email"
              placeholder="tu@correo.com"
              value={email}
              disabled={isLoading}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused('')}
              className="w-full pl-11 pr-4 py-3.5"
              style={fieldStyle('email')}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#6B8072', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Contraseña
          </label>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: focused === 'pw' ? '#16A34A' : '#9CA3AF' }} />
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Mín. 8 caracteres"
              value={password}
              disabled={isLoading}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              onFocus={() => setFocused('pw')}
              onBlur={() => setFocused('')}
              className="w-full pl-11 pr-12 py-3.5"
              style={fieldStyle('pw')}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              {showPw ? <EyeOff size={17} style={{ color: '#9CA3AF' }} /> : <Eye size={17} style={{ color: '#9CA3AF' }} />}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
          <span className="text-xs" style={{ color: '#9CA3AF', fontWeight: 600 }}>o continúa con</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
        </div>

        {/* Google */}
        <button
          className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
          style={{ border: '1.5px solid rgba(0,0,0,0.1)', background: 'white', fontWeight: 700, color: '#374151' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>
      </div>

      {/* Bottom CTA */}
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
          onClick={handleSignUp}
          disabled={isLoading}
          className="w-full py-4 rounded-2xl text-white active:scale-95 transition-transform disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: '#16A34A', fontWeight: 800, fontSize: '1rem', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Creando cuenta...
            </>
          ) : (
            "Crear cuenta"
          )}
        </button>
        <p className="text-center text-sm" style={{ color: '#9CA3AF', fontWeight: 500 }}>
          ¿Ya tienes cuenta?{' '}
          <button
            type="button"
            onClick={onGoToLogin}
            disabled={isLoading}
            style={{
              color: '#16A34A',
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
