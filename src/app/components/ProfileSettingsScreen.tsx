import { useState } from "react";
import { Loader2, LogOut, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "./BottomNav";

type NavTab = "dashboard" | "menu" | "chat" | "profile";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onSignedOut: () => void;
}

export function ProfileSettingsScreen({ onTabChange, onSignedOut }: Props) {
  const { user, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayEmail = user?.email ?? "Sin correo";

  const handleSignOut = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { error } = await signOut();

      if (error) {
        setErrorMessage(error);
        return;
      }

      onSignedOut();
    } catch {
      setErrorMessage("No pudimos cerrar sesión. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "#F7FAF8" }}
    >
      <div
        className="pt-14 px-6 pb-6"
        style={{
          background: "linear-gradient(160deg, #0A3D21, #16A34A)",
          borderBottomLeftRadius: "2rem",
          borderBottomRightRadius: "2rem",
        }}
      >
        <h1 style={{ color: "white", fontSize: "1.4rem", fontWeight: 900 }}>
          Mi cuenta
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.8rem",
            fontWeight: 500,
            marginTop: "4px",
          }}
        >
          Sesión activa
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 pb-24 space-y-4">
        <div
          className="rounded-3xl p-5 flex items-center gap-4"
          style={{
            background: "white",
            border: "1.5px solid rgba(22,163,74,0.1)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "#DCFCE7" }}
          >
            <Mail size={22} style={{ color: "#16A34A" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-xs"
              style={{
                color: "#6B8072",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Correo
            </p>
            <p
              className="truncate"
              style={{ fontWeight: 700, color: "#0D1F16", fontSize: "0.9rem" }}
            >
              {displayEmail}
            </p>
          </div>
        </div>

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
          onClick={handleSignOut}
          disabled={isLoading}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70"
          style={{
            background: "white",
            border: "1.5px solid rgba(220,38,38,0.25)",
            color: "#DC2626",
            fontWeight: 800,
            fontSize: "0.95rem",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Cerrando sesión...
            </>
          ) : (
            <>
              <LogOut size={20} />
              Cerrar sesión
            </>
          )}
        </button>
      </div>

      <BottomNav active="profile" onChange={onTabChange} />
    </div>
  );
}
