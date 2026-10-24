import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { MessageGenerationError } from "@/lib/ai/generateWeeklyPlan";
import { saveWeeklyBudget } from "@/lib/budget";
import { budgetIssue, parseBudgetInput } from "@/lib/budgetSuggestion";
import { fetchDashboardData, type DashboardData } from "@/lib/dashboard";
import {
  buildStoredDietaryRestrictions,
  parseStoredDietaryRestrictions,
  saveDietaryRestrictions,
  type DietaryRestrictionId,
} from "@/lib/dietaryRestrictions";
import type { ErrorKey } from "@/lib/errors";
import {
  isSupermarketId,
  saveUserSupermarkets,
  type SupermarketId,
} from "@/lib/supermarkets";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Alert, Button, ProblemScreen } from "@/app/ui";
import { BudgetEditor } from "./BudgetEditor";
import type { FixAction } from "./GenerationProblemPanel";
import { DietaryPicker } from "../shared/pickers/DietaryPicker";
import { StorePicker } from "../shared/pickers/StorePicker";

/** Below this many usable foods a varied 7-day week is hard to build. */
const FEW_FOODS = 40;

type Section = "restrictions" | "stores" | "budget";

interface Props {
  error: MessageGenerationError;
  onFix: (save: FixAction) => Promise<ErrorKey | null>;
  onRetry: () => void;
  onAdjustSettings: () => void;
}

const REASON_CODES = new Set([
  "item_count",
  "wrong_days",
  "invalid_format",
  "not_json",
  "unknown_ingredient",
  "low_protein",
  "low_variety",
  "ai_timeout",
  "ai_unavailable",
  "ai_empty",
  "rate_limited",
]);

function reasonKey(reason: string): MessageKey {
  const code = reason.split(":")[0];

  return (
    REASON_CODES.has(code) ? `gen.reason.${code}` : "gen.reason.other"
  ) as MessageKey;
}

/** "item_count:lun.cena" -> "lun.cena": the technical part, if any. */
function reasonDetail(reason: string): string {
  return reason.includes(":") ? reason.slice(reason.indexOf(":") + 1) : "";
}

/**
 * The AI could not finish the plan. Says what happened in plain words, shows
 * what we tried, and lets the user change what gives the AI more room
 * (restrictions, supermarkets, budget) without leaving the screen.
 */
export function PlanTroublePanel({
  error,
  onFix,
  onRetry,
  onAdjustSettings,
}: Props) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const code = error.code ?? "";
  const diagnostics = error.diagnostics;

  const [saved, setSaved] = useState<DashboardData | null>(null);
  const [open, setOpen] = useState<Section | null>(null);
  const [restrictions, setRestrictions] = useState<DietaryRestrictionId[]>([]);
  const [otherFoods, setOtherFoods] = useState("");
  const [stores, setStores] = useState<SupermarketId[]>([]);
  const [budgetInput, setBudgetInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  useEffect(() => {
    let active = true;

    void fetchDashboardData().then(({ data }) => {
      if (!active || !data) {
        return;
      }

      const parsed = parseStoredDietaryRestrictions(data.dietaryRestrictions);
      setSaved(data);
      setRestrictions(parsed.selectedIds);
      setOtherFoods(parsed.otherText);
      setStores(
        data.supermarkets.map((store) => store.id).filter(isSupermarketId),
      );
      setBudgetInput(formatNumber(data.weeklyBudgetCop ?? 150_000));
    });

    return () => {
      active = false;
    };
    // Load once; formatNumber only changes with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body: MessageKey =
    code === "goal_incoherent"
      ? "gen.trouble.bodyQuality"
      : code === "invalid_format" || code === "generation_failed"
        ? "gen.trouble.bodyShape"
        : "gen.trouble.bodyBusy";

  const toggle = (section: Section) => {
    setErrorKey(null);
    setOpen((current) => (current === section ? null : section));
  };

  const amount = parseBudgetInput(budgetInput);
  const saveAction: FixAction | null =
    open === "restrictions"
      ? () =>
          saveDietaryRestrictions(
            buildStoredDietaryRestrictions(restrictions, otherFoods),
          )
      : open === "stores"
        ? () => saveUserSupermarkets(stores)
        : open === "budget"
          ? () => saveWeeklyBudget(amount)
          : null;
  const canSave =
    open === "stores"
      ? stores.length > 0
      : open === "budget"
        ? amount > 0 && budgetIssue(amount) === null
        : true;

  const handleSave = async () => {
    if (!saveAction) {
      return;
    }

    setErrorKey(null);
    setIsSaving(true);

    try {
      const failure = await onFix(saveAction);

      if (failure) {
        setErrorKey(failure);
      }
    } catch {
      setErrorKey("errors.network");
    } finally {
      setIsSaving(false);
    }
  };

  const restrictionNames = saved
    ? [
        ...restrictions.map((id) => t(`dietary.${id}`)),
        ...otherFoods
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      ]
    : [];

  const rows: { id: Section; label: MessageKey; value: string }[] = [
    {
      id: "restrictions",
      label: "gen.trouble.restrictions",
      value: !saved
        ? ""
        : restrictionNames.length > 0
          ? restrictionNames.join(", ")
          : t("gen.trouble.none"),
    },
    {
      id: "stores",
      label: "gen.trouble.stores",
      value: saved
        ? saved.supermarkets.map((store) => store.name).join(", ")
        : "",
    },
    {
      id: "budget",
      label: "gen.trouble.budget",
      value: saved ? formatCurrency(saved.weeklyBudgetCop ?? 0) : "",
    },
  ];

  const attempts = diagnostics?.reasons ?? [];

  return (
    <ProblemScreen
      title={t("gen.trouble.title")}
      body={t(body)}
      actions={
        <>
          {saveAction ? (
            <Button
              size="lg"
              full
              loading={isSaving}
              disabled={!canSave}
              onClick={() => void handleSave()}
            >
              <RefreshCw size={18} aria-hidden />
              {t("gen.fix.saveAndGenerate")}
            </Button>
          ) : (
            <Button size="lg" full onClick={onRetry}>
              <Sparkles size={18} aria-hidden />
              {t("gen.retry")}
            </Button>
          )}
          <Button
            variant="ghost"
            full
            disabled={isSaving}
            onClick={onAdjustSettings}
          >
            {t("gen.adjust")}
          </Button>
        </>
      }
    >
      {diagnostics && diagnostics.availableFoods > 0 && (
        <div className="rounded-card border border-ink-100 bg-white p-4 shadow-card">
          <p className="text-[15px] font-bold text-ink-900">
            {t("gen.trouble.foods", {
              n: diagnostics.availableFoods,
              total: diagnostics.totalFoods,
            })}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink-500">
            {diagnostics.availableFoods < FEW_FOODS
              ? t("gen.trouble.foodsLow")
              : t("gen.trouble.foodsOk")}
          </p>
        </div>
      )}

      <section
        aria-label={t("gen.trouble.options")}
        className="flex flex-col gap-2.5"
      >
        <h2 className="text-[13px] font-semibold text-ink-500">
          {t("gen.trouble.options")}
        </h2>

        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 rounded-card border border-ink-100 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink-500">
                  {t(row.label)}
                </p>
                <p className="truncate text-[15px] font-semibold text-ink-900">
                  {row.value || "…"}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={isSaving || !saved}
                onClick={() => toggle(row.id)}
              >
                {open === row.id
                  ? t("gen.trouble.close")
                  : t("gen.trouble.change")}
              </Button>
            </div>

            {open === row.id && row.id === "restrictions" && (
              <DietaryPicker
                label={t(row.label)}
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
            )}

            {open === row.id && row.id === "stores" && (
              <StorePicker
                label={t(row.label)}
                value={stores}
                onChange={(value) => {
                  setStores(value);
                  setErrorKey(null);
                }}
                disabled={isSaving}
              />
            )}

            {open === row.id && row.id === "budget" && (
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
            )}
          </div>
        ))}
      </section>

      {attempts.length > 0 && (
        <details
          open
          className="rounded-card border border-ink-100 bg-ink-50/60 p-4 text-[13px]"
        >
          <summary className="cursor-pointer font-semibold text-ink-600">
            {t("gen.trouble.attempts")}
          </summary>
          <ol className="mt-2 flex flex-col gap-1 text-ink-600">
            {attempts.map((reason, index) => (
              <li key={`${reason}-${index}`}>
                <span className="font-semibold">
                  {t("gen.trouble.attempt", { n: index + 1 })}:
                </span>{" "}
                {t(reasonKey(reason))}
                {reasonDetail(reason) && (
                  <span className="text-ink-400"> ({reasonDetail(reason)})</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {errorKey && <Alert tone="error">{t(errorKey)}</Alert>}
    </ProblemScreen>
  );
}
