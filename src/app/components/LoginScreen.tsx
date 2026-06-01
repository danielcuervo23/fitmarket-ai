import { useState } from "react";
import { motion } from "motion/react";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { signInWithEmail, validateAuthForm } from "@/lib/auth";

interface Props {
  onSuccess: () => void;
  onGoToRegister: () => void;
  onBack: () => void;
}

export function LoginScreen({ onSuccess, onGoToRegister, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [focused, setFocused] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = () => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const fieldStyle = (id: string) => ({
    border: `1.5px solid ${focused === id ? "#16A34A" : "rgba(22,163,74,0.15)"}`,
    background: focused === id ? "#F0FDF4" : "#F7FAF8",
    borderRadius: "14px",
    outline: "none",
    transition: "all 0.2s",
  });

  const handleSignIn = async () => {
    const validationError = validateAuthForm(email, password);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { error } = await signInWithEmail(email, password);

      if (error) {
        setErrorMessage(error);
        return;
      }

      onSuccess();
    } catch {
      setErrorMessage("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="pt-14 px-6 pb-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="w-10 h-10 rounded-full flex items-center justify-center mb-6 disabled:opacity-50"
          style={{ background: "#F0F5F1" }}
        >
          <ArrowLeft size={20} style={{ color: "#374151" }} />
        </button>
        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1
            className="text-[#0D1F16]"
            style={{ fontSize: "1.8rem", fontWeight: 900, lineHeight: 1.2 }}
          >
            Inicia sesión
          </h1>
          <p
            className="mt-1.5"
            style={{ color: "#6B8072", fontSize: "0.9rem", fontWeight: 400 }}
          >
            Bienvenido de vuelta a FitMarket AI.
          </p>
        </motion.div>
      </div>

      <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
        <div>
          <label
            className="block text-xs mb-1.5"
            style={{
              color: "#6B8072",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Correo electrónico
          </label>
          <div className="relative">
            <Mail
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: focused === "email" ? "#16A34A" : "#9CA3AF" }}
            />
            <input
              type="email"
              placeholder="tu@correo.com"
              value={email}
              disabled={isLoading}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused("")}
              className="w-full pl-11 pr-4 py-3.5"
              style={fieldStyle("email")}
            />
          </div>
        </div>

        <div>
          <label
            className="block text-xs mb-1.5"
            style={{
              color: "#6B8072",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Contraseña
          </label>
          <div className="relative">
            <Lock
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: focused === "pw" ? "#16A34A" : "#9CA3AF" }}
            />
            <input
              type={showPw ? "text" : "password"}
              placeholder="Tu contraseña"
              value={password}
              disabled={isLoading}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              onFocus={() => setFocused("pw")}
              onBlur={() => setFocused("")}
              className="w-full pl-11 pr-12 py-3.5"
              style={fieldStyle("pw")}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              {showPw ? (
                <EyeOff size={17} style={{ color: "#9CA3AF" }} />
              ) : (
                <Eye size={17} style={{ color: "#9CA3AF" }} />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-10 space-y-3">
        {errorMessage && (
          <div
            role="alert"
            className="px-4 py-3 rounded-2xl text-sm"
            style={{
              background: "#FEF2F2",
              border: "1.5px solid rgba(220,38,38,0.2)",
              color: "#991B1B",
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={isLoading}
          className="w-full py-4 rounded-2xl text-white active:scale-95 transition-transform disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: "#16A34A",
            fontWeight: 800,
            fontSize: "1rem",
            boxShadow: "0 8px 24px rgba(22,163,74,0.35)",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Iniciando sesión...
            </>
          ) : (
            "Iniciar sesión"
          )}
        </button>

        <p
          className="text-center text-sm"
          style={{ color: "#9CA3AF", fontWeight: 500 }}
        >
          ¿No tienes cuenta?{" "}
          <button
            type="button"
            onClick={onGoToRegister}
            disabled={isLoading}
            style={{
              color: "#16A34A",
              fontWeight: 700,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            Crear cuenta
          </button>
        </p>
      </div>
    </div>
  );
}
