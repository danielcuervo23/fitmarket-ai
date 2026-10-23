import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { User } from "@supabase/supabase-js";
import { resolvePostAuthRoute } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PlanProvider, usePlan } from "@/contexts/PlanContext";
import { fetchLatestWeeklyPlan } from "@/lib/weeklyPlans";
import { SplashScreen } from "./components/SplashScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { LoginScreen } from "./components/LoginScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { GoalsScreen } from "./components/GoalsScreen";
import { BudgetScreen } from "./components/BudgetScreen";
import { SupermarketsScreen } from "./components/SupermarketsScreen";
import { DietaryRestrictionsScreen } from "./components/DietaryRestrictionsScreen";
import { AIGenerationScreen } from "./components/AIGenerationScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { WeeklyMenuScreen } from "./components/WeeklyMenuScreen";
import { MarketScreen } from "./components/MarketScreen";
import { ChatScreen } from "./components/ChatScreen";
import type { NavTab } from "./components/BottomNav";
import { ProfileSettingsScreen } from "./components/ProfileSettingsScreen";
import { PlanHistoryScreen } from "./components/PlanHistoryScreen";
import { AuthLoadingScreen } from "./components/AuthLoadingScreen";

type AppScreen =
  | "splash"
  | "onboarding"
  | "register"
  | "login"
  | "profile"
  | "goals"
  | "budget"
  | "supermarkets"
  | "dietary"
  | "generating"
  | "dashboard"
  | "menu"
  | "market"
  | "chat"
  | "settings"
  | "planHistory";

type MainTab = NavTab;

const slideVariants = {
  enter: { x: "100%", opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: "-40%", opacity: 0 },
};

const transition = {
  type: "tween" as const,
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

function displayNameFromUser(user: User): string {
  const metaName = user.user_metadata?.full_name;

  if (typeof metaName === "string" && metaName.trim()) {
    return metaName.trim();
  }

  const emailPrefix = user.email?.split("@")[0];

  if (emailPrefix) {
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }

  return "Usuario";
}

function PlanPersistenceBootstrap() {
  const { session, isLoading } = useAuth();
  const { plan, setPlan } = usePlan();
  const restoreAttemptedRef = useRef(false);
  const planRef = useRef(plan);

  planRef.current = plan;

  useEffect(() => {
    if (isLoading || !session || restoreAttemptedRef.current) {
      return;
    }

    restoreAttemptedRef.current = true;

    if (planRef.current !== null) {
      return;
    }

    void (async () => {
      const { data, error } = await fetchLatestWeeklyPlan();

      if (error) {
        console.error("[FitMarket] fetchLatestWeeklyPlan:", error);
        return;
      }

      if (data && planRef.current === null) {
        setPlan(data);
      }
    })();
  }, [isLoading, session, setPlan]);

  return null;
}

export default function App() {
  const { session, user, isLoading } = useAuth();
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [userName, setUserName] = useState("María García");
  const [budget, setBudget] = useState(150000);
  const [bootstrapped, setBootstrapped] = useState(false);

  const go = (s: AppScreen) => setScreen(s);

  const handleAuthSuccess = async () => {
    const route = await resolvePostAuthRoute();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (currentUser) {
      setUserName(displayNameFromUser(currentUser));
    }

    go(route);
  };

  const handleSignedOut = () => {
    setUserName("María García");
    setBudget(150000);
    go("login");
  };

  const handleTabChange = (tab: MainTab) => {
    if (tab === "profile") {
      go("settings");
      return;
    }
    go(tab as AppScreen);
  };

  useEffect(() => {
    if (isLoading || bootstrapped) {
      return;
    }

    const bootstrap = async () => {
      if (session && user) {
        setUserName(displayNameFromUser(user));
        const route = await resolvePostAuthRoute();
        setScreen(route);
      } else {
        setScreen("splash");
      }
      setBootstrapped(true);
    };

    void bootstrap();
  }, [isLoading, session, user, bootstrapped]);

  const showAuthLoading = isLoading || !bootstrapped;

  return (
    <PlanProvider>
      <PlanPersistenceBootstrap />
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, #E8F5E9 0%, #E3F2FD 50%, #E8F5E9 100%)",
      }}
    >
      <div
        className="relative flex-shrink-0"
        style={{
          width: "390px",
          height: "844px",
          borderRadius: "52px",
          background: "#1A1A1A",
          boxShadow:
            "0 40px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 2px rgba(255,255,255,0.04)",
          padding: "10px",
        }}
      >
        <div
          className="relative w-full h-full overflow-hidden"
          style={{ borderRadius: "44px", background: "#F7FAF8" }}
        >
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-50"
            style={{
              width: "120px",
              height: "34px",
              borderRadius: "20px",
              background: "#0A0A0A",
            }}
          />

          <AnimatePresence mode="wait">
            {showAuthLoading ? (
              <motion.div
                key="auth-loading"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={transition}
                className="absolute inset-0"
              >
                <AuthLoadingScreen />
              </motion.div>
            ) : (
              <>
                {screen === "splash" && (
                  <motion.div
                    key="splash"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <SplashScreen onNext={() => go("onboarding")} />
                  </motion.div>
                )}

                {screen === "onboarding" && (
                  <motion.div
                    key="onboarding"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <OnboardingScreen
                      onNext={() => go("register")}
                      onGoToLogin={() => go("login")}
                    />
                  </motion.div>
                )}

                {screen === "register" && (
                  <motion.div
                    key="register"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <RegisterScreen
                      onNext={(name) => {
                        setUserName(name || "Usuario");
                        go("profile");
                      }}
                      onAuthenticated={(name) => {
                        setUserName(name || "Usuario");
                        void handleAuthSuccess();
                      }}
                      onGoToLogin={() => go("login")}
                      onBack={() => go("onboarding")}
                    />
                  </motion.div>
                )}

                {screen === "login" && (
                  <motion.div
                    key="login"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <LoginScreen
                      onSuccess={() => void handleAuthSuccess()}
                      onGoToRegister={() => go("register")}
                      onBack={() => go("splash")}
                    />
                  </motion.div>
                )}

                {screen === "profile" && (
                  <motion.div
                    key="profile"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <ProfileScreen
                      name={userName}
                      onNext={() => go("goals")}
                      onBack={() => go(session ? "settings" : "register")}
                    />
                  </motion.div>
                )}

                {screen === "goals" && (
                  <motion.div
                    key="goals"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <GoalsScreen
                      onNext={() => go("budget")}
                      onBack={() => go("profile")}
                    />
                  </motion.div>
                )}

                {screen === "budget" && (
                  <motion.div
                    key="budget"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <BudgetScreen
                      onNext={(b) => {
                        setBudget(b || 150000);
                        go("supermarkets");
                      }}
                      onBack={() => go("goals")}
                    />
                  </motion.div>
                )}

                {screen === "supermarkets" && (
                  <motion.div
                    key="supermarkets"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <SupermarketsScreen
                      onNext={() => go("dietary")}
                      onBack={() => go("budget")}
                    />
                  </motion.div>
                )}

                {screen === "dietary" && (
                  <motion.div
                    key="dietary"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <DietaryRestrictionsScreen
                      onNext={() => go("generating")}
                      onBack={() => go("supermarkets")}
                    />
                  </motion.div>
                )}

                {screen === "generating" && (
                  <motion.div
                    key="generating"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <AIGenerationScreen
                      onDone={() => go("menu")}
                      onAdjustSettings={() => go("settings")}
                    />
                  </motion.div>
                )}

                {screen === "dashboard" && (
                  <motion.div
                    key="dashboard"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <DashboardScreen
                      onTabChange={handleTabChange}
                      onGeneratePlan={() => go("generating")}
                    />
                  </motion.div>
                )}

                {screen === "menu" && (
                  <motion.div
                    key="menu"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <WeeklyMenuScreen
                      onTabChange={handleTabChange}
                      onGeneratePlan={() => go("generating")}
                    />
                  </motion.div>
                )}

                {screen === "market" && (
                  <motion.div
                    key="market"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <MarketScreen
                      onTabChange={handleTabChange}
                      onGeneratePlan={() => go("generating")}
                    />
                  </motion.div>
                )}

                {screen === "chat" && (
                  <motion.div
                    key="chat"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <ChatScreen onTabChange={handleTabChange} />
                  </motion.div>
                )}

                {screen === "settings" && (
                  <motion.div
                    key="settings"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <ProfileSettingsScreen
                      onTabChange={handleTabChange}
                      onSignedOut={handleSignedOut}
                      onOpenPlanHistory={() => go("planHistory")}
                    />
                  </motion.div>
                )}

                {screen === "planHistory" && (
                  <motion.div
                    key="planHistory"
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="absolute inset-0"
                  >
                    <PlanHistoryScreen
                      onBack={() => go("settings")}
                      onViewCurrentPlan={() => go("menu")}
                    />
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>
        </div>

        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-28 h-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.3)" }}
        />
      </div>

      <div className="ml-12 hidden lg:flex flex-col gap-6 max-w-xs">
        <div>
          <h2
            style={{
              fontSize: "1.8rem",
              fontWeight: 900,
              color: "#0D5C2E",
              lineHeight: 1.2,
            }}
          >
            FitMarket<span style={{ color: "#16A34A" }}> AI</span>
          </h2>
          <p
            className="mt-2"
            style={{
              color: "#4B6557",
              fontSize: "0.95rem",
              lineHeight: 1.65,
              fontWeight: 400,
            }}
          >
            Tu mercado inteligente impulsado por inteligencia artificial.
            Planifica, compra y come mejor.
          </p>
        </div>

        <div className="space-y-3">
          {[
            {
              emoji: "🛒",
              title: "Mercado inteligente",
              desc: "Listas optimizadas según tu presupuesto",
            },
            {
              emoji: "🥗",
              title: "Menú personalizado",
              desc: "Plan semanal adaptado a tus objetivos",
            },
            {
              emoji: "🤖",
              title: "Reajuste con IA",
              desc: "La IA se adapta si no sigues el plan",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 p-4 rounded-2xl"
              style={{
                background: "white",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                border: "1px solid rgba(22,163,74,0.1)",
              }}
            >
              <span style={{ fontSize: "1.4rem" }}>{f.emoji}</span>
              <div>
                <p
                  style={{
                    fontWeight: 700,
                    color: "#0D1F16",
                    fontSize: "0.875rem",
                  }}
                >
                  {f.title}
                </p>
                <p
                  style={{
                    color: "#6B8072",
                    fontSize: "0.78rem",
                    fontWeight: 400,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div
          className="px-4 py-3 rounded-2xl flex items-center gap-2"
          style={{
            background: "#DCFCE7",
            border: "1.5px solid rgba(22,163,74,0.2)",
          }}
        >
          <span>💡</span>
          <p
            style={{ color: "#166534", fontSize: "0.78rem", fontWeight: 600 }}
          >
            Navega por todas las pantallas haciendo clic en el teléfono
          </p>
        </div>
      </div>
    </div>
    </PlanProvider>
  );
}
