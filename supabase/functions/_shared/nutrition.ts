/**
 * Daily energy and protein targets, computed (not guessed by the AI).
 *
 * BMR uses the Mifflin-St Jeor equation, a standard estimate for adults:
 *   men:     10 * kg + 6.25 * cm - 5 * age + 5
 *   women:   10 * kg + 6.25 * cm - 5 * age - 161
 * When sex is unknown the midpoint (-78) is used. These are estimates for a
 * meal-planning guide, not medical advice.
 */

export type Sex = "female" | "male";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

const ACTIVITY_LEVELS: readonly string[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

export function isActivityLevel(value: string): value is ActivityLevel {
  return ACTIVITY_LEVELS.includes(value);
}

export interface BodyProfile {
  age: number;
  weightKg: number;
  heightCm: number;
  activity: ActivityLevel;
  /** null / undefined = not provided ("prefer not to say"). */
  sex?: Sex | null;
}

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  /** Per person, per day. */
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Plain-language note about how the calories were adjusted. */
  strategy: "deficit" | "surplus" | "recomposition" | "maintenance";
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const MIN_KCAL = 1400;
const MAX_KCAL = 4000;

export function calcBmr(profile: BodyProfile): number {
  const base =
    10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const offset =
    profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;

  return base + offset;
}

function strategyFor(goals: string[]): {
  strategy: NutritionTargets["strategy"];
  factor: number;
  proteinPerKg: number;
} {
  const wantsFat = goals.includes("fat");
  const wantsMuscle = goals.includes("muscle");

  if (wantsFat && wantsMuscle) {
    return { strategy: "recomposition", factor: 0.95, proteinPerKg: 2 };
  }

  if (wantsFat) {
    return { strategy: "deficit", factor: 0.82, proteinPerKg: 1.7 };
  }

  if (wantsMuscle) {
    return { strategy: "surplus", factor: 1.1, proteinPerKg: 1.8 };
  }

  return { strategy: "maintenance", factor: 1, proteinPerKg: 1.2 };
}

export function calcTargets(
  profile: BodyProfile,
  goals: string[],
): NutritionTargets {
  const bmr = calcBmr(profile);
  const tdee = bmr * ACTIVITY_FACTOR[profile.activity];
  const { strategy, factor, proteinPerKg } = strategyFor(goals);

  // Never plan below the basal rate or a safe floor, whatever the goal says.
  const kcal = Math.round(
    Math.min(MAX_KCAL, Math.max(MIN_KCAL, bmr, tdee * factor)),
  );

  const proteinG = Math.round(profile.weightKg * proteinPerKg);
  const fatG = Math.round((kcal * 0.27) / 9);
  const carbsG = Math.max(
    0,
    Math.round((kcal - proteinG * 4 - fatG * 9) / 4),
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    proteinG,
    fatG,
    carbsG,
    strategy,
  };
}
