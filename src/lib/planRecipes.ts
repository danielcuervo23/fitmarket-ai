// Pure helpers for the recipe details, notices and the partial-plan warning
// of the weekly menu (Plan 2, Task 16).
// No runtime "@/" imports so `node --test` can load this file.
//
// Codes coming from the server (notices, rules, levels, appliances) are plain
// strings: a newer server may send codes this web has no copy for. Those are
// never shown raw; they are dropped or replaced by a generic line.

import type { DayId, MealSlot, PlanRecipeInfo, WeeklyPlan } from "./ai/types.ts";

/** Notice codes with copy (Task 2's NoticeCode). */
export const NOTICE_CODES = [
  "fat_blocked_minor",
  "fat_blocked_senior",
  "fat_blocked_low_bmi",
  "goals_blocked_health",
  "see_professional",
  "deficit_capped_energy",
] as const;
export type KnownNoticeCode = (typeof NOTICE_CODES)[number];

/** Rule codes with copy (Task 3's RuleCode). */
export const RULE_CODES = [
  "kcal_safety",
  "protein_safety_max",
  "protein_muscle_floor",
  "budget",
  "kcal_range",
  "protein_min",
  "protein_max",
  "carbs_min_muscle",
  "meal_protein_muscle",
  "fruit_veg_min",
  "fiber_min",
  "free_sugar_max",
  "sodium_max",
  "fat_max",
  "sat_fat_max",
  "legumes_week",
  "distinct_foods_week",
  "gaba_groups_day",
  "meal_kcal_share_max",
  "breakfast_protein_min",
  "breakfast_fiber_min",
  "iron_sources_week",
  "cheap_protein_share",
] as const;
export type KnownRuleCode = (typeof RULE_CODES)[number];

/** Level 5 rules are always elastic and never shown as unmet. */
const NEVER_REPORTED: ReadonlySet<string> = new Set(["cheap_protein_share"]);

export const COOKING_LEVEL_CODES = ["basic", "comfortable", "enjoys"] as const;
export type KnownCookingLevel = (typeof COOKING_LEVEL_CODES)[number];

export const APPLIANCE_CODES = [
  "estufa",
  "microondas",
  "olla_arrocera",
  "freidora_aire",
  "licuadora",
  "horno",
  "sandwichera",
  "olla_presion",
] as const;
export type KnownAppliance = (typeof APPLIANCE_CODES)[number];

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function ownValue<V>(record: Record<string, V> | undefined, key: string): V | undefined {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Plan data is untrusted: a recipe is shown only when its whole shape is right. */
function isRecipeInfo(value: unknown): value is PlanRecipeInfo {
  if (!isRecord(value)) return false;
  const { name, minutes, level, appliances, batch, steps } = value;
  return (
    isRecord(name) &&
    typeof name.es === "string" &&
    typeof name.en === "string" &&
    typeof minutes === "number" &&
    Number.isFinite(minutes) &&
    typeof level === "string" &&
    isStringList(appliances) &&
    typeof batch === "boolean" &&
    isRecord(steps) &&
    isStringList(steps.es) &&
    isStringList(steps.en)
  );
}

/** The recipe of one meal, or null (old plans, or a recipe the plan does not describe). */
export function recipeForMeal(
  plan: WeeklyPlan,
  day: DayId,
  slot: MealSlot,
): (PlanRecipeInfo & { id: string }) | null {
  const id = ownValue(ownValue(plan.meal_recipes, day), slot);
  if (typeof id !== "string") return null;
  const info: unknown = ownValue(plan.recipes, id);
  return isRecipeInfo(info) ? { ...info, id } : null;
}

export function knownLevel(recipe: PlanRecipeInfo): KnownCookingLevel | null {
  return isOneOf(COOKING_LEVEL_CODES, recipe.level) ? recipe.level : null;
}

export function knownAppliances(recipe: PlanRecipeInfo): KnownAppliance[] {
  return recipe.appliances.filter((a): a is KnownAppliance => isOneOf(APPLIANCE_CODES, a));
}

/** Notice codes the web has copy for, in order, without duplicates. */
function noticeList(plan: WeeklyPlan): unknown[] {
  return Array.isArray(plan.notices) ? plan.notices : [];
}

export function knownNotices(plan: WeeklyPlan): KnownNoticeCode[] {
  const known = noticeList(plan).filter((n): n is KnownNoticeCode => isOneOf(NOTICE_CODES, n));
  return [...new Set(known)];
}

/** True when some notice has no copy here (a generic line is shown once). */
export function hasUnknownNotices(plan: WeeklyPlan): boolean {
  return noticeList(plan).some((n) => !isOneOf(NOTICE_CODES, n));
}

/** A plan with compliance whose status is not "full". Old plans are never partial. */
export function isPartialPlan(plan: WeeklyPlan): boolean {
  return isRecord(plan.compliance) && plan.compliance.status !== "full";
}

export type ComplianceLine =
  | { rule: KnownRuleCode; kind: "percent"; percent: number; achieved: number; target: number }
  | { rule: KnownRuleCode; kind: "unmeasurable" }
  | { rule: KnownRuleCode; kind: "notReached" }
  | { rule: ""; kind: "unknown" };

/**
 * Lines of the partial-plan warning; empty when the plan is not partial.
 * percent = round(100 · achieved / target). Unmeasurable rules never get a
 * percent; a zero or invalid target gives a "not reached" line; codes without
 * copy (and level 5 rules) collapse into one generic line at the end, which
 * is also the only line when a partial plan lists nothing.
 */
export function complianceLines(plan: WeeklyPlan): ComplianceLine[] {
  if (!isPartialPlan(plan)) return [];
  const lines: ComplianceLine[] = [];
  let unknown = false;
  const unmet: unknown = plan.compliance?.unmet;
  for (const entry of Array.isArray(unmet) ? (unmet as unknown[]) : []) {
    const rule = isRecord(entry) ? entry.rule : undefined;
    if (!isOneOf(RULE_CODES, rule) || NEVER_REPORTED.has(rule)) {
      unknown = true;
      continue;
    }
    const { target, achieved, unmeasurable } = entry as Record<string, unknown>;
    if (unmeasurable === true) {
      lines.push({ rule, kind: "unmeasurable" });
      continue;
    }
    const measured = typeof target === "number" && typeof achieved === "number" && target !== 0;
    const percent = measured ? Math.round((100 * achieved) / target) : NaN;
    if (!measured || !Number.isFinite(percent)) {
      lines.push({ rule, kind: "notReached" });
      continue;
    }
    lines.push({ rule, kind: "percent", percent, achieved, target });
  }
  if (unknown || lines.length === 0) lines.push({ rule: "", kind: "unknown" });
  return lines;
}
