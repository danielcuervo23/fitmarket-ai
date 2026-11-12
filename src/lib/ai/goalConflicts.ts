// "No se puede cumplir" (Plan 2, Task 15): reads the server's
// `goals_unreachable` answer and turns each conflict into a translation key
// plus numbers. Pure; no runtime "@/" imports so `node --test` can load it.
//
// The answer is untrusted: anything malformed is dropped, rule codes are plain
// strings (a newer server may send codes this web has no copy for, which get a
// generic line), and only numbers ever reach the copy, never server text.

export interface GoalConflict {
  rule: string;
  level: number;
  unit: string;
  target: number;
  achieved: number;
  /** The server could not fully measure this rule; `achieved` is partial. */
  unmeasurable?: true;
}

export interface BudgetOption {
  currentBudget: number;
  requiredBudget: number;
  recommendedIncrease: number;
}

export interface GoalsUnreachableGenerationError {
  kind: "goals_unreachable";
  conflicts: GoalConflict[];
  budgetOption: BudgetOption | null;
  /** The server offers "Quiero el plan igual". */
  canForce: boolean;
}

export interface ConflictLine {
  /** A `gen.conflict.*` message key. */
  key: string;
  params: Record<string, number>;
}

export const MAX_CONFLICTS = 8;

/** Display unit of every rule the server reports (planner/rules/ruleSet.ts). */
export const CONFLICT_UNITS: Readonly<Record<string, string>> = {
  kcal_safety: "kcal",
  protein_safety_max: "g_per_kg",
  protein_muscle_floor: "g_per_kg",
  kcal_range: "kcal",
  protein_min: "g_per_kg",
  protein_max: "g_per_kg",
  carbs_min_muscle: "g_per_kg",
  meal_protein_muscle: "g",
  fruit_veg_min: "g",
  fiber_min: "g",
  free_sugar_max: "pct_kcal",
  sodium_max: "mg",
  fat_max: "pct_kcal",
  sat_fat_max: "pct_kcal",
  legumes_week: "count",
  distinct_foods_week: "count",
  gaba_groups_day: "count",
  meal_kcal_share_max: "pct_kcal",
  breakfast_protein_min: "g",
  breakfast_fiber_min: "g",
  iron_sources_week: "count",
  cheap_protein_share: "pct_protein",
};

/**
 * Rules with both a minimum and a maximum. The server reports the bound that
 * was missed, so `achieved > target` means the maximum was passed.
 */
const TWO_SIDED: ReadonlySet<string> = new Set(["kcal_safety", "kcal_range", "meal_protein_muscle"]);

const RULE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const UNIT_PATTERN = /^[a-z][a-z_]{0,19}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readConflict(value: unknown): GoalConflict | null {
  if (!isRecord(value)) {
    return null;
  }

  const { rule, level, unit, target, achieved } = value;

  if (
    typeof rule !== "string" ||
    !RULE_PATTERN.test(rule) ||
    typeof unit !== "string" ||
    !UNIT_PATTERN.test(unit) ||
    typeof level !== "number" ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 5 ||
    !finite(target) ||
    !finite(achieved)
  ) {
    return null;
  }

  const conflict: GoalConflict = { rule, level, unit, target, achieved };
  return value.unmeasurable === true ? { ...conflict, unmeasurable: true } : conflict;
}

function readBudgetOption(value: unknown): BudgetOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const { currentBudget, requiredBudget, recommendedIncrease } = value;

  if (
    !finite(currentBudget) ||
    !finite(requiredBudget) ||
    !finite(recommendedIncrease) ||
    currentBudget < 0 ||
    requiredBudget < 0 ||
    recommendedIncrease <= 0
  ) {
    return null;
  }

  return { currentBudget, requiredBudget, recommendedIncrease };
}

/** The `goals_unreachable` answer, or null for any other body. */
export function readGoalsUnreachable(body: unknown): GoalsUnreachableGenerationError | null {
  if (!isRecord(body) || body.code !== "goals_unreachable") {
    return null;
  }

  const conflicts: GoalConflict[] = [];

  if (Array.isArray(body.conflicts)) {
    for (const item of body.conflicts) {
      const conflict = readConflict(item);
      if (conflict) {
        conflicts.push(conflict);
      }
      if (conflicts.length === MAX_CONFLICTS) {
        break;
      }
    }
  }

  return {
    kind: "goals_unreachable",
    conflicts,
    budgetOption: readBudgetOption(body.budgetOption),
    canForce: body.canForce === true,
  };
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * The copy for one conflict, or null when this web has no exact line for it
 * (unknown rule, unexpected unit, or a rule that could not be measured); the
 * panel then shows the generic line.
 */
export function describeConflict(conflict: GoalConflict): ConflictLine | null {
  const unit = Object.hasOwn(CONFLICT_UNITS, conflict.rule) ? CONFLICT_UNITS[conflict.rule] : undefined;

  if (!unit || unit !== conflict.unit || conflict.unmeasurable) {
    return null;
  }

  const decimals = unit === "g_per_kg" ? 1 : 0;
  const achieved = round(conflict.achieved, decimals);
  const target = round(conflict.target, decimals);
  const over = TWO_SIDED.has(conflict.rule) && conflict.achieved > conflict.target;
  const key = `gen.conflict.${conflict.rule}${over ? ".over" : ""}`;

  if (conflict.rule === "protein_min") {
    return { key, params: { gap: round(conflict.target - conflict.achieved, 1), achieved, target } };
  }

  return { key, params: { achieved, target } };
}
