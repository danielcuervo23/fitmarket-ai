import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { MessageGenerationError } from "@/lib/ai/generateWeeklyPlan";
import { saveWeeklyBudget } from "@/lib/budget";
import {
  budgetIssue,
  parseBudgetInput,
} from "@/lib/budgetSuggestion";
import { fetchDashboardData } from "@/lib/dashboard";
import {
  buildStoredDietaryRestrictions,
  parseStoredDietaryRestrictions,
  saveDietaryRestrictions,
  type DietaryRestrictionId,
} from "@/lib/dietaryRestrictions";
import type { ErrorKey } from "@/lib/errors";
import { saveUserGoals, type GoalType } from "@/lib/goals";
import { saveUserSupermarkets, type SupermarketId } from "@/lib/supermarkets";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Alert, Button, ProblemScreen } from "@/app/ui";
import { BudgetEditor } from "./BudgetEditor";
import { PlanTroublePanel } from "./PlanTroublePanel";
import { DietaryPicker } from "./pickers/DietaryPicker";
import { GoalPicker } from "./pickers/GoalPicker";
import { StorePicker } from "./pickers/StorePicker";

/** Saves a change, and the parent then generates again. */
export type FixAction = () => Promise<{ error: ErrorKey | null }>;

interface Props {
  error: MessageGenerationError;
  /** Runs `save`; if it succeeds a new generation starts. Returns an error key. */
  onFix: (save: FixAction) => Promise<ErrorKey | null>;
  onRetry: () => void;
  onAdjustSettings: () => void;
  onEditProfile: () => void;
  onViewCurrentPlan: () => void;
}

const TROUBLE_CODES = new Set([
  "invalid_format",
  "goal_incoherent",
  "generation_failed",
  "ai_unavailable",
  "ai_timeout",
  "ai_empty",
]);

const TITLES: Partial<Record<string, MessageKey>> = {
  budget_missing: "gen.problem.budgetMissing",
  goals_missing: "gen.problem.goalsMissing",
  stores_missing: "gen.problem.storesMissing",
  restrictions_too_strict: "gen.problem.restrictions",
  profile_incomplete: "gen.problem.profile",
  quota_exceeded: "gen.problem.quota",
};

/**
 * Explains why a plan could not be made and, whenever the cause is something
 * the user can change, lets them change it here and generate again.
 */
export function GenerationProblemPanel({
  error,
  onFix,
  onRetry,
  onAdjustSettings,
  onEditProfile,
  onViewCurrentPlan,
}: Props) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const code = error.code ?? "";

  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  // Budget fix
  const [budgetInput, setBudgetInput] = useState(formatNumber(150_000));
  // Goals / stores / restrictions fixes
  const [goals, setGoals] = useState<GoalType[]>(["healthy"]);
  const [stores, setStores] = useState<SupermarketId[]>(["D1"]);
  const [restrictions, setRestrictions] = useState<DietaryRestrictionId[]>([]);
  const [otherFoods, setOtherFoods] = useState("");

  // Start from what the user already saved, so they only remove what hurts.
  useEffect(() => {
    if (code !== "restrictions_too_strict") {
      return;
    }

    let active = true;

    void fetchDashboardData().then(({ data }) => {
      if (!active || !data) {
        return;
      }

      const parsed = parseStoredDietaryRestrictions(data.dietaryRestrictions);
      setRestrictions(parsed.selectedIds);
      setOtherFoods(parsed.otherText);
    });

    return () => {
      active = false;
    };
  }, [code]);

  const run = async (save: FixAction) => {
    setErrorKey(null);
    setIsSaving(true);

    try {
      const failure = await onFix(save);

      // Success unmounts this panel (a new generation starts).
      if (failure) {
        setErrorKey(failure);
      }
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAction = (save: FixAction, disabled: boolean) => (
    <Button
      size="lg"
      full
      loading={isSaving}
      disabled={disabled}
      onClick={() => void run(save)}
    >
      <RefreshCw size={18} aria-hidden />
      {t("gen.fix.saveAndGenerate")}
    </Button>
  );

  const secondary = (
    <Button variant="ghost" full disabled={isSaving} onClick={onAdjustSettings}>
      {t("gen.adjust")}
    </Button>
  );

  const title = t(TITLES[code] ?? "gen.problem.transient");
  const body = t(error.messageKey);
  const failureAlert = errorKey && <Alert tone="error">{t(errorKey)}</Alert>;

  if (code === "budget_missing") {
    const amount = parseBudgetInput(budgetInput);

    return (
      <ProblemScreen
        title={title}
        body={body}
        actions={
          <>
            {saveAction(
              () => saveWeeklyBudget(amount),
              amount <= 0 || budgetIssue(amount) !== null,
            )}
            {secondary}
          </>
        }
      >
        <BudgetEditor
          label={t("gen.shortfall.newBudget")}
          value={budgetInput}
          onChange={(value) => {
            setBudgetInput(value);
            setErrorKey(null);
          }}
          options={[100_000, 150_000, 200_000].map((value) => ({
            label: formatCurrency(value),
            value,
          }))}
          disabled={isSaving}
        />
        {failureAlert}
      </ProblemScreen>
    );
  }

  if (code === "goals_missing") {
    return (
      <ProblemScreen
        title={title}
        body={body}
        actions={
          <>
            {saveAction(() => saveUserGoals(goals), goals.length === 0)}
            {secondary}
          </>
        }
      >
        <GoalPicker
          label={title}
          value={goals}
          onChange={(value) => {
            setGoals(value);
            setErrorKey(null);
          }}
          disabled={isSaving}
        />
        {failureAlert}
      </ProblemScreen>
    );
  }

  if (code === "stores_missing") {
    return (
      <ProblemScreen
        title={title}
        body={body}
        actions={
          <>
            {saveAction(() => saveUserSupermarkets(stores), stores.length === 0)}
            {secondary}
          </>
        }
      >
        <StorePicker
          label={title}
          value={stores}
          onChange={(value) => {
            setStores(value);
            setErrorKey(null);
          }}
          disabled={isSaving}
        />
        {failureAlert}
      </ProblemScreen>
    );
  }

  if (code === "restrictions_too_strict") {
    return (
      <ProblemScreen
        title={title}
        body={body}
        actions={
          <>
            {saveAction(
              () =>
                saveDietaryRestrictions(
                  buildStoredDietaryRestrictions(restrictions, otherFoods),
                ),
              false,
            )}
            {secondary}
          </>
        }
      >
        <DietaryPicker
          label={title}
          selected={restrictions}
          onSelectedChange={(value) => {
            setRestrictions(value);
            setErrorKey(null);
          }}
          otherFoods={otherFoods}
          onOtherFoodsChange={(value) => {
            setOtherFoods(value);
            setErrorKey(null);
          }}
          disabled={isSaving}
        />
        {failureAlert}
      </ProblemScreen>
    );
  }

  if (code === "profile_incomplete") {
    return (
      <ProblemScreen
        title={title}
        body={body}
        actions={
          <>
            <Button size="lg" full onClick={onEditProfile}>
              {t("gen.fix.completeProfile")}
            </Button>
            {secondary}
          </>
        }
      />
    );
  }

  if (code === "quota_exceeded") {
    return (
      <ProblemScreen
        title={title}
        body={body}
        actions={
          <Button size="lg" full onClick={onViewCurrentPlan}>
            {t("gen.fix.viewCurrent")}
          </Button>
        }
      />
    );
  }

  // The AI could not finish: explain what happened and what gives it more room.
  if (TROUBLE_CODES.has(code)) {
    return (
      <PlanTroublePanel
        error={error}
        onFix={onFix}
        onRetry={onRetry}
        onAdjustSettings={onAdjustSettings}
      />
    );
  }

  // Other temporary problems (network): nothing to change, so the honest
  // option is to try again.
  return (
    <ProblemScreen
      title={title}
      body={body}
      actions={
        <>
          <Button size="lg" full onClick={onRetry}>
            <Sparkles size={18} aria-hidden />
            {t("gen.retry")}
          </Button>
          {secondary}
        </>
      }
    />
  );
}
