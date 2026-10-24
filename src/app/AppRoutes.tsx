import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { resolvePostAuthRoute } from "@/lib/auth";
import { displayNameFromUser } from "@/lib/displayName";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTES, tabToPath } from "./routes";
import type { NavTab } from "./components/shared/BottomNav";
import { SplashScreen } from "./components/auth/SplashScreen";
import { OnboardingScreen } from "./components/auth/OnboardingScreen";
import { RegisterScreen } from "./components/auth/RegisterScreen";
import { LoginScreen } from "./components/auth/LoginScreen";
import { AuthLoadingScreen } from "./components/auth/AuthLoadingScreen";
import { PrivacyScreen } from "./components/account/PrivacyScreen";

// Post-login screens are loaded on demand so the first paint only downloads
// the code needed for the splash, onboarding and sign-in screens.
const ProfileScreen = lazy(() =>
  import("./components/setup/ProfileScreen").then((module) => ({
    default: module.ProfileScreen,
  })),
);
const GoalsScreen = lazy(() =>
  import("./components/setup/GoalsScreen").then((module) => ({
    default: module.GoalsScreen,
  })),
);
const BudgetScreen = lazy(() =>
  import("./components/setup/BudgetScreen").then((module) => ({
    default: module.BudgetScreen,
  })),
);
const SupermarketsScreen = lazy(() =>
  import("./components/setup/SupermarketsScreen").then((module) => ({
    default: module.SupermarketsScreen,
  })),
);
const DietaryRestrictionsScreen = lazy(() =>
  import("./components/setup/DietaryRestrictionsScreen").then((module) => ({
    default: module.DietaryRestrictionsScreen,
  })),
);
const AIGenerationScreen = lazy(() =>
  import("./components/generation/AIGenerationScreen").then((module) => ({
    default: module.AIGenerationScreen,
  })),
);
const DashboardScreen = lazy(() =>
  import("./components/plan/DashboardScreen").then((module) => ({
    default: module.DashboardScreen,
  })),
);
const WeeklyMenuScreen = lazy(() =>
  import("./components/plan/WeeklyMenuScreen").then((module) => ({
    default: module.WeeklyMenuScreen,
  })),
);
const MarketScreen = lazy(() =>
  import("./components/plan/MarketScreen").then((module) => ({
    default: module.MarketScreen,
  })),
);
const ChatScreen = lazy(() =>
  import("./components/plan/ChatScreen").then((module) => ({
    default: module.ChatScreen,
  })),
);
const ProfileSettingsScreen = lazy(() =>
  import("./components/account/ProfileSettingsScreen").then((module) => ({
    default: module.ProfileSettingsScreen,
  })),
);
const PlanHistoryScreen = lazy(() =>
  import("./components/plan/PlanHistoryScreen").then((module) => ({
    default: module.PlanHistoryScreen,
  })),
);

// Development-only screen gallery (see DevPreview.tsx). The condition is a
// build-time constant, so production bundles contain none of it.
const DevPreview = import.meta.env.DEV
  ? lazy(() => import("./DevPreview"))
  : null;

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

/** Only signed-in users can see these routes; everyone else goes to login. */
function Protected({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  if (!session) {
    return <Redirect to={ROUTES.login} replace />;
  }

  return <>{children}</>;
}

/** The entry route: returning users skip straight to where they left off. */
function SplashRoute() {
  const { session } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    void resolvePostAuthRoute().then((route) => {
      if (cancelled) return;
      navigate(
        route === "dashboard" ? ROUTES.app.dashboard : ROUTES.setup.profile,
        { replace: true },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  if (session) {
    return <AuthLoadingScreen />;
  }

  return (
    <SplashScreen
      onNext={() => navigate(ROUTES.welcome)}
      onGoToLogin={() => navigate(ROUTES.login)}
    />
  );
}

export function AppRoutes() {
  const { isLoading, user } = useAuth();
  const [location, navigate] = useLocation();

  const displayName = user ? displayNameFromUser(user) : "Usuario";
  const goToTab = (tab: NavTab) => navigate(tabToPath(tab));
  const goToGenerating = () => navigate(ROUTES.setup.generating);

  const afterAuth = async () => {
    const route = await resolvePostAuthRoute();
    navigate(
      route === "dashboard" ? ROUTES.app.dashboard : ROUTES.setup.profile,
    );
  };

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={transition}
        className="absolute inset-0"
      >
        {/* `location` is passed explicitly so a screen that is animating out
            keeps rendering its own route instead of the new one. */}
        <Suspense fallback={<AuthLoadingScreen />}>
          <Switch location={location}>
          <Route path={ROUTES.splash}>
            <SplashRoute />
          </Route>

          <Route path={ROUTES.welcome}>
            <OnboardingScreen
              onNext={() => navigate(ROUTES.register)}
              onGoToLogin={() => navigate(ROUTES.login)}
            />
          </Route>

          <Route path={ROUTES.register}>
            <RegisterScreen
              onNext={() => navigate(ROUTES.setup.profile)}
              onAuthenticated={() => void afterAuth()}
              onGoToLogin={() => navigate(ROUTES.login)}
              onBack={() => navigate(ROUTES.welcome)}
              onOpenPrivacy={() => navigate(ROUTES.privacy)}
            />
          </Route>

          <Route path={ROUTES.privacy}>
            <PrivacyScreen
              onBack={() =>
                window.history.length > 1
                  ? window.history.back()
                  : navigate(ROUTES.splash)
              }
            />
          </Route>

          <Route path={ROUTES.login}>
            <LoginScreen
              onSuccess={() => void afterAuth()}
              onGoToRegister={() => navigate(ROUTES.register)}
              onBack={() => navigate(ROUTES.splash)}
            />
          </Route>

          <Route path={ROUTES.setup.profile}>
            <Protected>
              <ProfileScreen
                name={displayName}
                onNext={() => navigate(ROUTES.setup.goals)}
                onBack={() => navigate(ROUTES.app.settings)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.setup.goals}>
            <Protected>
              <GoalsScreen
                onNext={() => navigate(ROUTES.setup.budget)}
                onBack={() => navigate(ROUTES.setup.profile)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.setup.budget}>
            <Protected>
              <BudgetScreen
                onNext={() => navigate(ROUTES.setup.supermarkets)}
                onBack={() => navigate(ROUTES.setup.goals)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.setup.supermarkets}>
            <Protected>
              <SupermarketsScreen
                onNext={() => navigate(ROUTES.setup.dietary)}
                onBack={() => navigate(ROUTES.setup.budget)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.setup.dietary}>
            <Protected>
              <DietaryRestrictionsScreen
                onNext={goToGenerating}
                onBack={() => navigate(ROUTES.setup.supermarkets)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.setup.generating}>
            <Protected>
              <AIGenerationScreen
                onDone={() => navigate(ROUTES.app.menu)}
                onAdjustSettings={() => navigate(ROUTES.app.settings)}
                onEditProfile={() => navigate(ROUTES.setup.profile)}
                onViewCurrentPlan={() => navigate(ROUTES.app.menu)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.app.dashboard}>
            <Protected>
              <DashboardScreen
                onTabChange={goToTab}
                onGeneratePlan={goToGenerating}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.app.menu}>
            <Protected>
              <WeeklyMenuScreen
                onTabChange={goToTab}
                onGeneratePlan={goToGenerating}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.app.market}>
            <Protected>
              <MarketScreen
                onTabChange={goToTab}
                onGeneratePlan={goToGenerating}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.app.chat}>
            <Protected>
              <ChatScreen onTabChange={goToTab} />
            </Protected>
          </Route>

          <Route path={ROUTES.app.settings}>
            <Protected>
              <ProfileSettingsScreen
                onTabChange={goToTab}
                onSignedOut={() => navigate(ROUTES.login, { replace: true })}
                onOpenPlanHistory={() => navigate(ROUTES.app.history)}
                onOpenPrivacy={() => navigate(ROUTES.privacy)}
                onGeneratePlan={() => navigate(ROUTES.setup.generating)}
              />
            </Protected>
          </Route>

          <Route path={ROUTES.app.history}>
            <Protected>
              <PlanHistoryScreen
                onBack={() => navigate(ROUTES.app.settings)}
                onViewCurrentPlan={() => navigate(ROUTES.app.menu)}
              />
            </Protected>
          </Route>

          {DevPreview && (
            <Route path="/__preview/:screen">
              <Suspense fallback={null}>
                <DevPreview />
              </Suspense>
            </Route>
          )}

          <Route>
            <Redirect to={ROUTES.splash} replace />
          </Route>
          </Switch>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}
