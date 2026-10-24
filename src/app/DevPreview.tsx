import { useEffect, type ReactNode } from "react";
import { useParams } from "wouter";
import { usePlan } from "@/contexts/PlanContext";
import { AIGenerationScreen } from "./components/AIGenerationScreen";
import { BudgetScreen } from "./components/BudgetScreen";
import { BudgetShortfallPanel } from "./components/BudgetShortfallPanel";
import { ChatScreen } from "./components/ChatScreen";
import { GenerationProblemPanel } from "./components/GenerationProblemPanel";
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

const PREVIEW_MESSAGES = {
  budget_missing: "gen.error.budgetMissing",
  goals_missing: "gen.error.goalsMissing",
  stores_missing: "gen.error.storesMissing",
  restrictions_too_strict: "gen.error.restrictionsTooStrict",
  profile_incomplete: "gen.error.profileIncomplete",
  quota_exceeded: "gen.error.quotaExceeded",
  invalid_format: "gen.error.invalidFormat",
} as const;

function ProblemPreview({ code }: { code: keyof typeof PREVIEW_MESSAGES }) {
  return (
    <GenerationProblemPanel
      error={{
        kind: "message",
        messageKey: PREVIEW_MESSAGES[code],
        code,
        diagnostics: {
          availableFoods: 38,
          totalFoods: 70,
          reasons: ["item_count", "not_json", "wrong_days"],
        },
      }}
      onFix={async () => null}
      onRetry={noop}
      onAdjustSettings={noop}
      onEditProfile={noop}
      onViewCurrentPlan={noop}
    />
  );
}

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
  generating: () => <AIGenerationScreen
      onDone={noop}
      onAdjustSettings={noop}
      onEditProfile={noop}
      onViewCurrentPlan={noop}
    />,
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
  problem: () => <ProblemPreview code="invalid_format" />,
  "problem-goals": () => <ProblemPreview code="goals_missing" />,
  "problem-stores": () => <ProblemPreview code="stores_missing" />,
  "problem-budget": () => <ProblemPreview code="budget_missing" />,
  "problem-restrictions": () => <ProblemPreview code="restrictions_too_strict" />,
  "problem-profile": () => <ProblemPreview code="profile_incomplete" />,
  "problem-quota": () => <ProblemPreview code="quota_exceeded" />,
  shortfall: () => (
    <BudgetShortfallPanel
      error={{
        kind: "budget_too_low",
        currentBudget: 200_000,
        requiredBudget: 212_100,
        recommendedIncrease: 12_100,
      }}
      onSaveAndRegenerate={async () => null}
      onRetry={noop}
      onAdjustSettings={noop}
    />
  ),
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
