import { useParams } from "wouter";
import { AIGenerationScreen } from "./components/AIGenerationScreen";
import { BudgetScreen } from "./components/BudgetScreen";
import { DietaryRestrictionsScreen } from "./components/DietaryRestrictionsScreen";
import { GoalsScreen } from "./components/GoalsScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { SupermarketsScreen } from "./components/SupermarketsScreen";

/**
 * Development-only gallery: /__preview/<name> renders a screen without
 * needing an account, so the UI can be reviewed (and screenshotted) offline.
 * It is only reachable when `import.meta.env.DEV` is true and is excluded from
 * production builds.
 */
const noop = () => undefined;

const SCREENS: Record<string, () => JSX.Element> = {
  profile: () => <ProfileScreen name="Juan Daniel" onNext={noop} onBack={noop} />,
  goals: () => <GoalsScreen onNext={noop} onBack={noop} />,
  budget: () => <BudgetScreen onNext={noop} onBack={noop} />,
  supermarkets: () => <SupermarketsScreen onNext={noop} onBack={noop} />,
  dietary: () => <DietaryRestrictionsScreen onNext={noop} onBack={noop} />,
  generating: () => <AIGenerationScreen onDone={noop} onAdjustSettings={noop} />,
};

export default function DevPreview() {
  const { screen } = useParams<{ screen: string }>();
  const render = SCREENS[screen ?? ""];

  return render ? render() : <p className="p-8">Unknown preview: {screen}</p>;
}
