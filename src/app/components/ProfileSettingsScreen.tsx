import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  History,
  Languages,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { deleteAccount } from "@/lib/account";
import { useAuth } from "@/contexts/AuthContext";
import { saveWeeklyBudget } from "@/lib/budget";
import { fetchDashboardData } from "@/lib/dashboard";
import {
  buildStoredDietaryRestrictions,
  parseStoredDietaryRestrictions,
  saveDietaryRestrictions,
  type DietaryRestrictionId,
} from "@/lib/dietaryRestrictions";
import type { ErrorKey } from "@/lib/errors";
import { saveUserGoals, type GoalType } from "@/lib/goals";
import {
  isSupermarketId,
  saveUserSupermarkets,
  type SupermarketId,
} from "@/lib/supermarkets";
import { displayNameFromUser } from "@/lib/displayName";
import { useI18n } from "@/i18n/I18nProvider";
import {
  Alert,
  Button,
  Card,
  ErrorState,
  LanguageSwitch,
  LoadingState,
  Screen,
  ScreenBody,
  TextField,
} from "@/app/ui";
import { BottomNav, type NavTab } from "./BottomNav";
import { DietaryPicker } from "./pickers/DietaryPicker";
import { GoalPicker } from "./pickers/GoalPicker";
import { StorePicker } from "./pickers/StorePicker";

interface Props {
  onTabChange: (tab: NavTab) => void;
  onSignedOut: () => void;
  onOpenPlanHistory?: () => void;
  onOpenPrivacy?: () => void;
}

interface SavedPreferences {
  budgetCop: number;
  goals: string[];
  supermarkets: string[];
  dietaryRestrictions: string[];
}

function sortedKey(values: string[]): string {
  return [...values].sort().join("|");
}

function parseBudgetInput(raw: string): number {
  return parseInt(raw.replace(/\D/g, ""), 10) || 0;
}

export function ProfileSettingsScreen({
  onTabChange,
  onSignedOut,
  onOpenPlanHistory,
  onOpenPrivacy,
}: Props) {
  const { t, formatNumber } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState<SavedPreferences | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [goals, setGoals] = useState<GoalType[]>([]);
  const [stores, setStores] = useState<SupermarketId[]>([]);
  const [dietary, setDietary] = useState<DietaryRestrictionId[]>([]);
  const [otherFoods, setOtherFoods] = useState("");

  const email = user?.email ?? t("settings.noEmail");
  const name = user ? displayNameFromUser(user) : "";
  const budgetCop = parseBudgetInput(budgetInput);

  const loadPreferences = useCallback(async () => {
    setIsLoadingPrefs(true);
    setErrorKey(null);

    try {
      const { data, error } = await fetchDashboardData();

      if (error || !data) {
        setErrorKey(error ?? "errors.load");
        return;
      }

      const budget = data.weeklyBudgetCop ?? 0;
      const loadedGoals = data.goals.map((goal) => goal.id);
      const loadedStores = data.supermarkets
        .map((store) => store.id)
        .filter(isSupermarketId);
      const { selectedIds, otherText } = parseStoredDietaryRestrictions(
        data.dietaryRestrictions,
      );

      setSavedPrefs({
        budgetCop: budget,
        goals: loadedGoals,
        supermarkets: loadedStores,
        dietaryRestrictions: data.dietaryRestrictions,
      });
      setBudgetInput(budget > 0 ? formatNumber(budget) : "");
      setGoals(loadedGoals);
      setStores(loadedStores);
      setDietary(selectedIds);
      setOtherFoods(otherText);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsLoadingPrefs(false);
    }
    // formatNumber only changes with the language; reloading on a language
    // switch would discard unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const hasChanges = useMemo(() => {
    if (!savedPrefs) {
      return false;
    }

    const currentDietary = buildStoredDietaryRestrictions(dietary, otherFoods);

    return (
      budgetCop !== savedPrefs.budgetCop ||
      sortedKey(goals) !== sortedKey(savedPrefs.goals) ||
      sortedKey(stores) !== sortedKey(savedPrefs.supermarkets) ||
      sortedKey(currentDietary) !== sortedKey(savedPrefs.dietaryRestrictions)
    );
  }, [savedPrefs, budgetCop, goals, stores, dietary, otherFoods]);

  const canSave =
    !isLoadingPrefs &&
    !isSaving &&
    hasChanges &&
    budgetCop > 0 &&
    goals.length > 0 &&
    stores.length > 0;

  const markEdited = () => {
    setErrorKey(null);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setErrorKey(null);
    setSaved(false);

    try {
      const dietaryStored = buildStoredDietaryRestrictions(dietary, otherFoods);
      const steps = [
        () => saveWeeklyBudget(budgetCop),
        () => saveUserGoals(goals),
        () => saveUserSupermarkets(stores),
        () => saveDietaryRestrictions(dietaryStored),
      ];

      for (const step of steps) {
        const { error } = await step();

        if (error) {
          setErrorKey(error);
          return;
        }
      }

      setSavedPrefs({
        budgetCop,
        goals: [...goals],
        supermarkets: [...stores],
        dietaryRestrictions: dietaryStored,
      });
      setSaved(true);
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    setErrorKey(null);
    setIsSigningOut(true);

    try {
      const { error } = await signOut();

      if (error) {
        setErrorKey(error);
        return;
      }

      onSignedOut();
    } catch {
      setErrorKey("errors.signOut");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    setErrorKey(null);
    setIsDeleting(true);

    try {
      const { error } = await deleteAccount();

      if (error) {
        setErrorKey(error);
        return;
      }

      onSignedOut();
    } catch {
      setErrorKey("account.deleteFailed");
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteWord = t("account.deleteWord");
  const canDelete = deleteText.trim().toUpperCase() === deleteWord;
  const busy = isSaving || isLoadingPrefs;

  return (
    <Screen>
      <header className="px-6 pb-4 pt-14">
        <h1 className="text-[26px] font-extrabold tracking-tight">
          {t("settings.title")}
        </h1>
      </header>

      <ScreenBody className={`flex flex-col gap-5 ${hasChanges ? "pb-44" : "pb-28"}`}>
        <Card className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800"
          >
            {(name || email).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            {name && <p className="truncate font-bold text-ink-900">{name}</p>}
            <p className="flex items-center gap-1.5 truncate text-[13px] text-ink-500">
              <Mail size={13} aria-hidden />
              {email}
            </p>
          </div>
        </Card>

        {onOpenPlanHistory && (
          <button
            type="button"
            onClick={onOpenPlanHistory}
            disabled={isSaving}
            className="flex w-full items-center gap-3.5 rounded-card border border-ink-100 bg-white p-4 text-left shadow-card transition-all active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <History size={20} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold">
                {t("settings.history")}
              </span>
              <span className="text-[13px] text-ink-500">
                {t("settings.historyDesc")}
              </span>
            </span>
            <ChevronRight size={18} className="text-ink-300" aria-hidden />
          </button>
        )}

        {onOpenPrivacy && (
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="flex w-full items-center gap-3.5 rounded-card border border-ink-100 bg-white p-4 text-left shadow-card transition-all active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <ShieldCheck size={20} aria-hidden />
            </span>
            <span className="flex-1 text-[15px] font-semibold">
              {t("account.privacy")}
            </span>
            <ChevronRight size={18} className="text-ink-300" aria-hidden />
          </button>
        )}

        <Card className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Languages size={20} aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">
                {t("language.label")}
              </span>
              <span className="text-[13px] text-ink-500">
                {t("language.description")}
              </span>
            </span>
          </span>
          <LanguageSwitch />
        </Card>

        <h2 className="pt-1 text-[13px] font-semibold text-ink-500">
          {t("settings.nutrition")}
        </h2>

        {isLoadingPrefs ? (
          <LoadingState message={t("settings.loading")} />
        ) : !savedPrefs ? (
          <ErrorState
            message={t(errorKey ?? "errors.load")}
            onRetry={() => void loadPreferences()}
          />
        ) : (
          <>
            <TextField
              label={t("settings.budget")}
              inputMode="numeric"
              icon={<span className="text-sm font-bold">$</span>}
              placeholder={t("budget.customPlaceholder")}
              value={budgetInput}
              disabled={busy}
              onChange={(event) => {
                setBudgetInput(event.target.value);
                markEdited();
              }}
            />

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-bold">{t("settings.goals")}</h3>
              <GoalPicker
                label={t("settings.goals")}
                value={goals}
                onChange={(value) => {
                  setGoals(value);
                  markEdited();
                }}
                disabled={busy}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-bold">{t("settings.stores")}</h3>
              <StorePicker
                label={t("settings.stores")}
                value={stores}
                onChange={(value) => {
                  setStores(value);
                  markEdited();
                }}
                disabled={busy}
              />
            </section>

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-bold">
                  {t("settings.restrictions")}
                </h3>
                <p className="text-[13px] text-ink-500">
                  {t("settings.restrictionsHint")}
                </p>
              </div>
              <DietaryPicker
                label={t("settings.restrictions")}
                selected={dietary}
                onSelectedChange={(value) => {
                  setDietary(value);
                  markEdited();
                }}
                otherFoods={otherFoods}
                onOtherFoodsChange={(value) => {
                  setOtherFoods(value);
                  markEdited();
                }}
                disabled={busy}
              />
            </section>
          </>
        )}

        {saved && <Alert tone="success">{t("settings.saved")}</Alert>}
        {errorKey && savedPrefs && <Alert tone="error">{t(errorKey)}</Alert>}

        <Button
          variant="secondary"
          size="lg"
          full
          loading={isSigningOut}
          disabled={isSaving}
          onClick={handleSignOut}
          className="border-danger-100 text-danger-600 hover:bg-danger-50"
        >
          <LogOut size={18} aria-hidden />
          {t("settings.signOut")}
        </Button>

        <section className="flex flex-col gap-3 rounded-card border border-danger-100 bg-danger-50/50 p-4">
          <h2 className="text-sm font-bold text-danger-700">
            {t("account.dangerZone")}
          </h2>

          {!confirmingDelete ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmingDelete(true)}
              disabled={isSaving || isSigningOut}
              className="border-danger-100 text-danger-600 hover:bg-danger-50"
            >
              <Trash2 size={16} aria-hidden />
              {t("account.delete")}
            </Button>
          ) : (
            <>
              <p className="text-[13px] leading-snug text-danger-700">
                {t("account.deleteWarning")}
              </p>
              <TextField
                label={t("account.deletePrompt", { word: deleteWord })}
                value={deleteText}
                disabled={isDeleting}
                autoComplete="off"
                onChange={(event) => setDeleteText(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  full
                  disabled={isDeleting}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteText("");
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  full
                  loading={isDeleting}
                  disabled={!canDelete}
                  onClick={() => void handleDeleteAccount()}
                >
                  {t("account.deleteConfirm")}
                </Button>
              </div>
            </>
          )}
        </section>
      </ScreenBody>

      {hasChanges && (
        <div className="absolute inset-x-4 bottom-24 z-10 flex items-center gap-3 rounded-card border border-ink-100 bg-white p-3 pl-4 shadow-float">
          <p className="flex-1 text-[13px] font-semibold text-ink-700">
            {t("settings.unsaved")}
          </p>
          <Button loading={isSaving} disabled={!canSave} onClick={handleSave}>
            {t("settings.save")}
          </Button>
        </div>
      )}

      <BottomNav active="profile" onChange={onTabChange} />
    </Screen>
  );
}
