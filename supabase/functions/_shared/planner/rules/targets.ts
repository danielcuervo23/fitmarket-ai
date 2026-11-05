/**
 * Goal targets (spec section 3): turns a body profile, the chosen goals and
 * optional health conditions into the level 1 (safety) and level 2 (calories
 * and protein) numbers the rule set and the optimizer work with.
 *
 * Pure and deterministic. Estimates for meal planning, not medical advice.
 */

import { calcBmr, calcTargets, isActivityLevel } from "../../nutrition.ts";
import type { BodyProfile, NutritionTargets } from "../../nutrition.ts";

export type HealthCondition = "diabetes" | "kidney_disease" | "pregnancy_lactation" | "eating_disorder";

export type NoticeCode =
  | "fat_blocked_minor"
  | "fat_blocked_senior"
  | "fat_blocked_low_bmi"
  | "goals_blocked_health"
  | "see_professional"
  | "deficit_capped_energy";

export interface Range {
  min: number;
  max: number;
}

export interface GoalTargets {
  /** Goals after blocking. */
  effectiveGoals: string[];
  strategy: NutritionTargets["strategy"];
  bmr: number;
  tdee: number;
  weightKg: number;
  /** Daily target. */
  kcal: number;
  /** Level 2. */
  kcalRange: Range;
  /** Level 1. */
  kcalSafety: Range;
  /** Level 2, g/day. */
  proteinG: Range & { target: number };
  /** Level 1. */
  proteinSafetyMaxG: number;
  /** Level 1, muscle only. */
  proteinFloorG: number | null;
  /** Level 2, muscle only. */
  carbsMinG: number | null;
  notices: NoticeCode[];
}

/** Every household member other than the user, until Plan 3 collects ages. */
export const REFERENCE_ADULT_KCAL = 2000;

const HEALTH_CONDITIONS: ReadonlySet<string> = new Set([
  "diabetes",
  "kidney_disease",
  "pregnancy_lactation",
  "eating_disorder",
]);

const MIN_ADULT_AGE = 18;
const MAX_FAT_AGE = 65;
const LOW_BMI = 18.5;
const HIGH_BMI = 35;

const SEX_FLOOR_KCAL = { female: 1200, male: 1500, unknown: 1400 } as const;
const ABSOLUTE_FLOOR_KCAL = 800;
const SAFETY_MIN_TDEE_FACTOR = 0.75;
const SAFETY_MAX_TDEE_FACTOR = 1.15;
const MAX_KCAL = 4000;

const KCAL_TOLERANCE = 0.1;
const KCAL_PER_KG_FAT = 7700;
const MAX_WEEKLY_LOSS_SHARE = 0.01;
const MAX_WEEKLY_LOSS_KG = 1;

const PROTEIN_SAFETY_MAX_G_PER_KG = 2.5;
const PROTEIN_SAFETY_MAX_KIDNEY_G_PER_KG = 1.2;
const PROTEIN_MUSCLE_FLOOR_G_PER_KG = 1.4;
const CARBS_MIN_MUSCLE_G_PER_KG = 3;

const FAT_SHARE_OF_KCAL = 0.27;

/** Calorie band as factors of TDEE. */
interface KcalBand {
  min: number;
  max: number;
  target: number;
}

interface ProteinPerKg {
  min: number;
  max: number;
  target: number;
}

interface GoalProfile {
  strategy: NutritionTargets["strategy"];
  band: KcalBand;
  protein: ProteinPerKg;
  capsDeficit: boolean;
  notice: NoticeCode | null;
}

const MAINTENANCE: GoalProfile = {
  strategy: "maintenance",
  band: { min: 0.9, max: 1.1, target: 1 },
  protein: { min: 1, max: 2, target: 1.2 },
  capsDeficit: false,
  notice: null,
};
const FAT: GoalProfile = {
  strategy: "deficit",
  band: { min: 0.75, max: 0.85, target: 0.8 },
  protein: { min: 1.6, max: 2.2, target: 1.8 },
  capsDeficit: true,
  notice: null,
};
const FAT_ENERGY: GoalProfile = {
  ...FAT,
  band: { min: 0.85, max: 0.935, target: 0.85 },
  notice: "deficit_capped_energy",
};
const MUSCLE: GoalProfile = {
  strategy: "surplus",
  band: { min: 1.05, max: 1.15, target: 1.1 },
  protein: { min: 1.6, max: 2.2, target: 1.8 },
  capsDeficit: false,
  notice: null,
};
const RECOMPOSITION: GoalProfile = {
  strategy: "recomposition",
  band: { min: 0.95, max: 1, target: 0.975 },
  protein: { min: 2, max: 2.4, target: 2.2 },
  capsDeficit: false,
  notice: null,
};
const KIDNEY_PROTEIN: ProteinPerKg = { min: 0.8, max: 1.2, target: 1 };

function assertBody(profile: BodyProfile): void {
  const valid =
    Number.isFinite(profile.age) && profile.age > 0 &&
    Number.isFinite(profile.weightKg) && profile.weightKg > 0 &&
    Number.isFinite(profile.heightCm) && profile.heightCm > 0 &&
    isActivityLevel(profile.activity);
  if (!valid) throw new RangeError("invalid body profile");
}

/** Level 1 floor without the TDEE part: max(BMR, sex floor, 800). */
export function safetyFloorKcal(profile: BodyProfile, bmr: number): number {
  const sexFloor =
    profile.sex === "female" ? SEX_FLOOR_KCAL.female
    : profile.sex === "male" ? SEX_FLOOR_KCAL.male
    : SEX_FLOOR_KCAL.unknown;
  return Math.round(Math.max(bmr, sexFloor, ABSOLUTE_FLOOR_KCAL));
}

function bmiOf(profile: BodyProfile): number {
  const meters = profile.heightCm / 100;
  return profile.weightKg / (meters * meters);
}

/** Removes blocked goals, in the order of the spec, and collects notices. */
function blockGoals(
  profile: BodyProfile,
  goals: string[],
  health: readonly string[],
): { effectiveGoals: string[]; notices: NoticeCode[] } {
  let effective = [...new Set(goals)];
  const notices = new Set<NoticeCode>();
  const remove = (blocked: readonly string[], reasons: NoticeCode[]): void => {
    if (!effective.some((goal) => blocked.includes(goal))) return;
    effective = effective.filter((goal) => !blocked.includes(goal));
    for (const reason of reasons) notices.add(reason);
  };
  const bmi = bmiOf(profile);

  if (profile.age < MIN_ADULT_AGE) remove(["fat"], ["fat_blocked_minor"]);
  if (profile.age > MAX_FAT_AGE) remove(["fat"], ["fat_blocked_senior", "see_professional"]);
  if (bmi < LOW_BMI) remove(["fat"], ["fat_blocked_low_bmi"]);
  if (bmi >= HIGH_BMI) notices.add("see_professional");
  if (health.length > 0) {
    remove(["fat", "muscle"], ["goals_blocked_health"]);
    notices.add("see_professional");
  }

  return { effectiveGoals: effective, notices: [...notices] };
}

function goalProfileFor(goals: readonly string[]): GoalProfile {
  const fat = goals.includes("fat");
  const muscle = goals.includes("muscle");
  if (fat && muscle) return RECOMPOSITION;
  if (fat) return goals.includes("energy") ? FAT_ENERGY : FAT;
  if (muscle) return MUSCLE;
  return MAINTENANCE;
}

function clamp(value: number, range: Range): number {
  return Math.min(range.max, Math.max(range.min, value));
}

export function buildTargets(
  profile: BodyProfile,
  goals: string[],
  health: HealthCondition[] = [],
): GoalTargets {
  assertBody(profile);
  const conditions = health.filter((condition) => HEALTH_CONDITIONS.has(condition));
  const { effectiveGoals, notices } = blockGoals(profile, goals, conditions);
  const goal = goalProfileFor(effectiveGoals);
  const kidney = conditions.includes("kidney_disease");

  const rawBmr = calcBmr(profile);
  const bmr = Math.round(rawBmr);
  // Reuses the TDEE of nutrition.ts (BMR x activity factor, rounded).
  const tdee = calcTargets(profile, []).tdee;
  const weightKg = profile.weightKg;

  // Level 1: safety range.
  const safetyMin = Math.max(safetyFloorKcal(profile, rawBmr), Math.round(SAFETY_MIN_TDEE_FACTOR * tdee));
  const kcalSafety: Range = {
    min: safetyMin,
    max: Math.max(safetyMin, Math.round(Math.min(MAX_KCAL, SAFETY_MAX_TDEE_FACTOR * tdee))),
  };

  // Goal band, with the fat deficit capped at min(1 % of weight, 1 kg) a week.
  let bandMin = goal.band.min * tdee;
  let target = goal.band.target * tdee;
  if (goal.capsDeficit) {
    const maxDailyDeficit =
      (Math.min(MAX_WEEKLY_LOSS_SHARE * weightKg, MAX_WEEKLY_LOSS_KG) * KCAL_PER_KG_FAT) / 7;
    bandMin = Math.max(bandMin, tdee - maxDailyDeficit);
    target = Math.max(target, tdee - maxDailyDeficit);
  }
  const bandMax = Math.max(goal.band.max * tdee, bandMin);

  // Level 2: target ± 10 %, intersected with the band, clipped into safety.
  const kcalRange: Range = {
    min: clamp(Math.round(Math.max(target * (1 - KCAL_TOLERANCE), bandMin)), kcalSafety),
    max: clamp(Math.round(Math.min(target * (1 + KCAL_TOLERANCE), bandMax)), kcalSafety),
  };
  const kcal = clamp(Math.round(target), kcalRange);

  // Protein.
  const proteinSafetyMaxG = Math.round(
    (kidney ? PROTEIN_SAFETY_MAX_KIDNEY_G_PER_KG : PROTEIN_SAFETY_MAX_G_PER_KG) * weightKg,
  );
  const perKg = kidney ? KIDNEY_PROTEIN : goal.protein;
  const proteinG = {
    min: Math.min(Math.round(perKg.min * weightKg), proteinSafetyMaxG),
    max: Math.min(Math.round(perKg.max * weightKg), proteinSafetyMaxG),
    target: Math.min(Math.round(perKg.target * weightKg), proteinSafetyMaxG),
  };

  const muscle = effectiveGoals.includes("muscle");
  const allNotices = goal.notice ? [...notices, goal.notice] : notices;

  return {
    effectiveGoals,
    strategy: goal.strategy,
    bmr,
    tdee,
    weightKg,
    kcal,
    kcalRange,
    kcalSafety,
    proteinG,
    proteinSafetyMaxG,
    proteinFloorG: muscle ? Math.round(PROTEIN_MUSCLE_FLOOR_G_PER_KG * weightKg) : null,
    carbsMinG: muscle ? Math.round(CARBS_MIN_MUSCLE_G_PER_KG * weightKg) : null,
    notices: allNotices,
  };
}

/** Same macro split as `calcTargets`: fat 27 % of kcal, carbs the rest. */
export function toNutritionTargets(targets: GoalTargets): NutritionTargets {
  const proteinG = targets.proteinG.target;
  const fatG = Math.round((targets.kcal * FAT_SHARE_OF_KCAL) / 9);
  const carbsG = Math.max(0, Math.round((targets.kcal - proteinG * 4 - fatG * 9) / 4));
  return {
    bmr: targets.bmr,
    tdee: targets.tdee,
    kcal: targets.kcal,
    proteinG,
    fatG,
    carbsG,
    strategy: targets.strategy,
  };
}

/** Shopping multiplier: the user plus every other member at 2000 kcal. */
export function householdFactor(householdSize: number, userKcal: number): number {
  if (!Number.isInteger(householdSize) || householdSize < 1) throw new RangeError("invalid household size");
  if (!Number.isFinite(userKcal) || userKcal <= 0) throw new RangeError("invalid user kcal");
  return 1 + ((householdSize - 1) * REFERENCE_ADULT_KCAL) / userKcal;
}
