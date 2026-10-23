import { useEffect, type ReactNode } from "react";
import { useParams } from "wouter";
import { usePlan } from "@/contexts/PlanContext";
import { AIGenerationScreen } from "./components/AIGenerationScreen";
import { BudgetScreen } from "./components/BudgetScreen";
import { ChatScreen } from "./components/ChatScreen";
import { DashboardView } from "./components/DashboardScreen";
import { DietaryRestrictionsScreen } from "./components/DietaryRestrictionsScreen";
import { GoalsScreen } from "./components/GoalsScreen";
import { MarketView } from "./components/MarketScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { ProfileSettingsScreen } from "./components/ProfileSettingsScreen";
import { SupermarketsScreen } from "./components/SupermarketsScreen";
import { WeeklyMenuScreen } from "./components/WeeklyMenuScreen";
import { MOCK_DASHBOARD, MOCK_PLAN } from "./devMockData";

/**
 * Development-only gallery: /__preview/<name> renders a screen without
 * needing an account, so the UI can be reviewed (and screenshotted) offline.
 * It is only reachable when `import.meta.env.DEV` is true and is excluded from
 * production builds.
 */
const noop = () => undefined;

/** Seeds the plan context with sample data so plan screens have content. */
function WithPlan({ children }: { children: ReactNode }) {
  const { setPlan } = usePlan();

  useEffect(() => {
    setPlan(MOCK_PLAN);
  }, [setPlan]);

  return <>{children}</>;
}

const SCREENS: Record<string, () => ReactNode> = {
  profile: () => <ProfileScreen name="Juan Daniel" onNext={noop} onBack={noop} />,
  goals: () => <GoalsScreen onNext={noop} onBack={noop} />,
  budget: () => <BudgetScreen onNext={noop} onBack={noop} />,
  supermarkets: () => <SupermarketsScreen onNext={noop} onBack={noop} />,
  dietary: () => <DietaryRestrictionsScreen onNext={noop} onBack={noop} />,
  generating: () => <AIGenerationScreen onDone={noop} onAdjustSettings={noop} />,
  dashboard: () => (
    <DashboardView
      data={MOCK_DASHBOARD}
      plan={MOCK_PLAN}
      onTabChange={noop}
      onGeneratePlan={noop}
    />
  ),
  "dashboard-empty": () => (
    <DashboardView
      data={MOCK_DASHBOARD}
      plan={null}
      onTabChange={noop}
      onGeneratePlan={noop}
    />
  ),
  menu: () => (
    <WithPlan>
      <WeeklyMenuScreen onTabChange={noop} onGeneratePlan={noop} />
    </WithPlan>
  ),
  market: () => (
    <MarketView
      data={MOCK_DASHBOARD}
      plan={MOCK_PLAN}
      userId="preview-user"
      onTabChange={noop}
      onGeneratePlan={noop}
    />
  ),
  chat: () => <ChatScreen onTabChange={noop} />,
  settings: () => (
    <ProfileSettingsScreen
      onTabChange={noop}
      onSignedOut={noop}
      onOpenPlanHistory={noop}
    />
  ),
};

export default function DevPreview() {
  const { screen } = useParams<{ screen: string }>();
  const render = SCREENS[screen ?? ""];

  return render ? <>{render()}</> : <p className="p-8">Unknown preview: {screen}</p>;
}
