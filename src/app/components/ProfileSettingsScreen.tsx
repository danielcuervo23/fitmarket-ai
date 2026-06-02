import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, LogOut, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { saveWeeklyBudget } from "@/lib/budget";
import { fetchDashboardData } from "@/lib/dashboard";
import {
  buildStoredDietaryRestrictions,
  DIETARY_RESTRICTION_OPTIONS,
  parseStoredDietaryRestrictions,
  saveDietaryRestrictions,
} from "@/lib/dietaryRestrictions";
import { saveUserGoals } from "@/lib/goals";
import { saveUserSupermarkets } from "@/lib/supermarkets";
import { BottomNav, type NavTab } from "./BottomNav";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onSignedOut: () => void;
  onOpenPlanHistory?: () => void;
}

const GOAL_OPTIONS = [
  { id: "muscle", emoji: "💪", label: "Ganar masa muscular", color: "#7C3AED", bg: "#F3F0FF" },
  { id: "fat", emoji: "🔥", label: "Perder grasa", color: "#DC2626", bg: "#FEF2F2" },
  { id: "healthy", emoji: "🥗", label: "Comer saludable", color: "#16A34A", bg: "#F0FDF4" },
  { id: "save", emoji: "💰", label: "Ahorrar dinero", color: "#D97706", bg: "#FFFBEB" },
  { id: "family", emoji: "👨‍👩‍👧", label: "Alimentación familiar", color: "#2563EB", bg: "#EFF6FF" },
  { id: "energy", emoji: "⚡", label: "Mejorar mi energía", color: "#0891B2", bg: "#F0F9FF" },
] as const;

const STORE_OPTIONS = [
  { id: "D1", name: "D1", tagline: "Precios bajos siempre", color: "#FCD34D", bg: "#FFFBEB", textColor: "#92400E", logo: "🟡" },
  { id: "Ara", name: "Ara", tagline: "Precios que te sorprenden", color: "#EF4444", bg: "#FEF2F2", textColor: "#991B1B", logo: "🔴" },
  { id: "Exito", name: "Éxito", tagline: "Todo lo que necesitas", color: "#FBBF24", bg: "#FFFBEB", textColor: "#78350F", logo: "⭐" },
  { id: "Jumbo", name: "Jumbo", tagline: "Lo mejor en un solo lugar", color: "#3B82F6", bg: "#EFF6FF", textColor: "#1E40AF", logo: "🔵" },
  { id: "Carulla", name: "Carulla", tagline: "Calidad y frescura", color: "#16A34A", bg: "#F0FDF4", textColor: "#166534", logo: "🟢" },
] as const;

interface SavedPreferences {
  budgetCop: number;
  goals: string[];
  supermarkets: string[];
  dietaryRestrictions: string[];
}

function sortedKey(values: string[]): string {
  return [...values].sort().join("|");
}

function formatBudgetInput(value: number): string {
  if (value <= 0) {
    return "";
  }

  return value.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function parseBudgetInput(raw: string): number {
  return parseInt(raw.replace(/\D/g, ""), 10) || 0;
}

export function ProfileSettingsScreen({
  onTabChange,
  onSignedOut,
  onOpenPlanHistory,
}: Props) {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedPrefs, setSavedPrefs] = useState<SavedPreferences | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [otherFoodsInput, setOtherFoodsInput] = useState("");

  const displayEmail = user?.email ?? "Sin correo";
  const budgetCop = parseBudgetInput(budgetInput);

  const loadPreferences = useCallback(async () => {
    setIsLoadingPrefs(true);
    setErrorMessage(null);

    try {
      const { data, error } = await fetchDashboardData();

      if (error) {
        setErrorMessage(error);
        return;
      }

      const budget = data?.weeklyBudgetCop ?? 0;
      const goals = data?.goals.map((goal) => goal.id) ?? [];
      const supermarkets = data?.supermarkets.map((store) => store.id) ?? [];
      const dietaryRestrictions = data?.dietaryRestrictions ?? [];
      const { selectedIds, otherText } =
        parseStoredDietaryRestrictions(dietaryRestrictions);

      const snapshot: SavedPreferences = {
        budgetCop: budget,
        goals,
        supermarkets,
        dietaryRestrictions,
      };

      setSavedPrefs(snapshot);
      setBudgetInput(formatBudgetInput(budget));
      setSelectedGoals(goals);
      setSelectedStores(supermarkets);
      setSelectedDietary(selectedIds);
      setOtherFoodsInput(otherText);
    } catch {
      setErrorMessage(
        "No pudimos conectar. Revisa tu internet e intenta de nuevo.",
      );
    } finally {
      setIsLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const hasChanges = useMemo(() => {
    if (!savedPrefs) {
      return false;
    }

    const currentDietary = buildStoredDietaryRestrictions(
      selectedDietary,
      otherFoodsInput,
    );

    return (
      budgetCop !== savedPrefs.budgetCop ||
      sortedKey(selectedGoals) !== sortedKey(savedPrefs.goals) ||
      sortedKey(selectedStores) !== sortedKey(savedPrefs.supermarkets) ||
      sortedKey(currentDietary) !==
        sortedKey(savedPrefs.dietaryRestrictions)
    );
  }, [
    savedPrefs,
    budgetCop,
    selectedGoals,
    selectedStores,
    selectedDietary,
    otherFoodsInput,
  ]);

  const canSave =
    !isLoadingPrefs &&
    !isSaving &&
    hasChanges &&
    budgetCop > 0 &&
    selectedGoals.length > 0 &&
    selectedStores.length > 0;

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const toggleGoal = (id: string) => {
    if (isSaving || isLoadingPrefs) {
      return;
    }

    setSelectedGoals((current) =>
      current.includes(id) ? current.filter((goal) => goal !== id) : [...current, id],
    );
    clearMessages();
  };

  const toggleStore = (id: string) => {
    if (isSaving || isLoadingPrefs) {
      return;
    }

    setSelectedStores((current) =>
      current.includes(id) ? current.filter((store) => store !== id) : [...current, id],
    );
    clearMessages();
  };

  const toggleDietary = (id: string) => {
    if (isSaving || isLoadingPrefs) {
      return;
    }

    setSelectedDietary((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    clearMessages();
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const budgetResult = await saveWeeklyBudget(budgetCop);

      if (budgetResult.error) {
        setErrorMessage(budgetResult.error);
        return;
      }

      const goalsResult = await saveUserGoals(selectedGoals);

      if (goalsResult.error) {
        setErrorMessage(goalsResult.error);
        return;
      }

      const storesResult = await saveUserSupermarkets(selectedStores);

      if (storesResult.error) {
        setErrorMessage(storesResult.error);
        return;
      }

      const dietaryStored = buildStoredDietaryRestrictions(
        selectedDietary,
        otherFoodsInput,
      );
      const dietaryResult = await saveDietaryRestrictions(dietaryStored);

      if (dietaryResult.error) {
        setErrorMessage(dietaryResult.error);
        return;
      }

      const snapshot: SavedPreferences = {
        budgetCop,
        goals: [...selectedGoals],
        supermarkets: [...selectedStores],
        dietaryRestrictions: dietaryStored,
      };

      setSavedPrefs(snapshot);
      setSuccessMessage("Configuración actualizada");
    } catch {
      setErrorMessage("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSigningOut(true);

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
      setIsSigningOut(false);
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
        {onOpenPlanHistory && (
          <button
            type="button"
            onClick={onOpenPlanHistory}
            disabled={isSaving}
            className="w-full rounded-3xl p-5 flex items-center gap-4 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{
              background: "white",
              border: "1.5px solid rgba(22,163,74,0.1)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "#EFF6FF" }}
            >
              <History size={22} style={{ color: "#2563EB" }} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p
                style={{
                  fontWeight: 800,
                  color: "#0D1F16",
                  fontSize: "0.95rem",
                }}
              >
                Historial de planes
              </p>
              <p
                style={{
                  color: "#6B8072",
                  fontSize: "0.78rem",
                  fontWeight: 500,
                }}
              >
                Ver planes anteriores en modo lectura
              </p>
            </div>
            <span style={{ color: "#9CA3AF", fontSize: "1.1rem" }}>›</span>
          </button>
        )}

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

        <div
          className="rounded-3xl p-5 space-y-5"
          style={{
            background: "white",
            border: "1.5px solid rgba(22,163,74,0.1)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          <p
            className="text-xs"
            style={{
              color: "#6B8072",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Configuración nutricional
          </p>

          {isLoadingPrefs ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 size={22} className="animate-spin" style={{ color: "#16A34A" }} />
              <span style={{ color: "#6B8072", fontSize: "0.85rem", fontWeight: 600 }}>
                Cargando configuración...
              </span>
            </div>
          ) : (
            <>
              <div>
                <p
                  className="text-xs mb-2"
                  style={{ color: "#6B8072", fontWeight: 700 }}
                >
                  Presupuesto semanal (COP)
                </p>
                <div className="relative">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 font-bold"
                    style={{ color: "#16A34A" }}
                  >
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej: 150.000"
                    value={budgetInput}
                    disabled={isSaving}
                    onChange={(event) => {
                      setBudgetInput(event.target.value);
                      clearMessages();
                    }}
                    className="w-full pl-8 pr-4 py-3.5 rounded-2xl"
                    style={{
                      border: "2px solid rgba(22,163,74,0.2)",
                      background: "#F7FAF8",
                      outline: "none",
                      fontWeight: 700,
                      fontSize: "1rem",
                      color: "#0D1F16",
                    }}
                  />
                </div>
              </div>

              <div>
                <p
                  className="text-xs mb-2"
                  style={{ color: "#6B8072", fontWeight: 700 }}
                >
                  Objetivos
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {GOAL_OPTIONS.map((goal) => {
                    const isSelected = selectedGoals.includes(goal.id);

                    return (
                      <button
                        key={goal.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleGoal(goal.id)}
                        className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-60"
                        style={{
                          border: `2px solid ${isSelected ? goal.color : "rgba(0,0,0,0.07)"}`,
                          background: isSelected ? goal.bg : "white",
                        }}
                      >
                        <span style={{ fontSize: "1.5rem" }}>{goal.emoji}</span>
                        <p
                          style={{
                            fontWeight: 700,
                            color: isSelected ? goal.color : "#374151",
                            fontSize: "0.72rem",
                            textAlign: "center",
                            lineHeight: 1.3,
                          }}
                        >
                          {goal.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p
                  className="text-xs mb-2"
                  style={{ color: "#6B8072", fontWeight: 700 }}
                >
                  Supermercados
                </p>
                <div className="space-y-2">
                  {STORE_OPTIONS.map((store) => {
                    const isSelected = selectedStores.includes(store.id);

                    return (
                      <button
                        key={store.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleStore(store.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60"
                        style={{
                          border: `2px solid ${isSelected ? store.color : "rgba(0,0,0,0.07)"}`,
                          background: isSelected ? store.bg : "white",
                        }}
                      >
                        <span style={{ fontSize: "1.3rem" }}>{store.logo}</span>
                        <div className="flex-1 text-left min-w-0">
                          <p
                            style={{
                              fontWeight: 800,
                              color: isSelected ? store.textColor : "#0D1F16",
                              fontSize: "0.9rem",
                            }}
                          >
                            {store.name}
                          </p>
                          <p
                            style={{
                              color: "#9CA3AF",
                              fontSize: "0.72rem",
                              fontWeight: 400,
                            }}
                          >
                            {store.tagline}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p
                  className="text-xs mb-2"
                  style={{ color: "#6B8072", fontWeight: 700 }}
                >
                  Restricciones alimentarias
                </p>
                <p
                  className="text-xs mb-3"
                  style={{ color: "#9CA3AF", fontWeight: 500 }}
                >
                  Opcional — la IA evitará estos alimentos al generar tu plan
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {DIETARY_RESTRICTION_OPTIONS.map((option) => {
                    const isSelected = selectedDietary.includes(option.id);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleDietary(option.id)}
                        className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-60"
                        style={{
                          border: `2px solid ${isSelected ? option.color : "rgba(0,0,0,0.07)"}`,
                          background: isSelected ? option.bg : "white",
                        }}
                      >
                        <span style={{ fontSize: "1.5rem" }}>{option.emoji}</span>
                        <p
                          style={{
                            fontWeight: 700,
                            color: isSelected ? option.color : "#374151",
                            fontSize: "0.72rem",
                            textAlign: "center",
                            lineHeight: 1.3,
                          }}
                        >
                          {option.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p
                  className="text-xs mb-2"
                  style={{ color: "#6B8072", fontWeight: 700 }}
                >
                  Otros alimentos a evitar
                </p>
                <input
                  type="text"
                  placeholder="Ej: cilantro, huevo, soya..."
                  value={otherFoodsInput}
                  disabled={isSaving}
                  onChange={(event) => {
                    setOtherFoodsInput(event.target.value);
                    clearMessages();
                  }}
                  className="w-full px-4 py-3.5 rounded-2xl"
                  style={{
                    border: "2px solid rgba(22,163,74,0.2)",
                    background: "#F7FAF8",
                    outline: "none",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: "#0D1F16",
                  }}
                />
              </div>
            </>
          )}
        </div>

        {successMessage && (
          <div
            role="status"
            className="px-4 py-3 rounded-2xl text-sm"
            style={{
              background: "#F0FDF4",
              border: "1.5px solid rgba(22,163,74,0.2)",
              color: "#166534",
              fontWeight: 600,
            }}
          >
            {successMessage}
          </div>
        )}

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
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "#16A34A",
            color: "white",
            fontWeight: 800,
            fontSize: "0.95rem",
            boxShadow: "0 8px 24px rgba(22,163,74,0.35)",
          }}
        >
          {isSaving ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Guardando cambios...
            </>
          ) : (
            "Guardar cambios"
          )}
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut || isSaving}
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
          {isSigningOut ? (
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
