import type { WeeklyPlanParsed } from "./weeklyPlanSchema.ts";

export type GoalType =
  | "muscle"
  | "fat"
  | "healthy"
  | "save"
  | "family"
  | "energy";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export interface UserProfileContext {
  age: number;
  weight_kg: number;
  height_cm: number;
  activity_level: ActivityLevel;
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "sedentario (poco ejercicio)",
  light: "ligero (1–2 días/semana)",
  moderate: "moderado (3–4 días/semana)",
  active: "activo (5–6 días/semana)",
  very_active: "muy activo (ejercicio intenso diario)",
};

/** Orden de prioridad al combinar objetivos (primero = más peso en la guía). */
export const GOAL_PRIORITY_ORDER: GoalType[] = [
  "save",
  "muscle",
  "fat",
  "healthy",
  "energy",
  "family",
];

const SINGLE_GOAL_RULES: Record<GoalType, string> = {
  muscle:
    "muscle: priorizar proteína en cada comida principal; porciones ligeramente mayores en almuerzo/cena; favorecer ganancia muscular; mantener el presupuesto semanal.",
  fat:
    "fat: controlar calorías totales (estimated_daily_kcal moderado, no excesivo); alimentos saciantes (fibra, proteína moderada); evitar calorías vacías (ultraprocesados, azúcar innecesaria); favorecer pérdida de grasa sostenible.",
  healthy:
    "healthy: equilibrio general de macros; variedad de frutas, verduras y granos; preferir alimentos mínimamente procesados.",
  save:
    "save: máxima eficiencia económica; ingredientes rendidores (arroz, lentejas, huevos, pollo, seasonal produce); minimizar costo sin sacrificar nutrición básica.",
  energy:
    "energy: priorizar energía sostenida; evitar comidas demasiado ligeras; favorecer carbohidratos complejos y snacks útiles.",
  family:
    "family: comidas compartibles y repetibles; ingredientes fáciles de preparar; porciones rendidoras para varias personas.",
};

const PAIR_GOAL_RULES: Record<string, string> = {
  "save|muscle":
    "save + muscle: proteína alta dentro del presupuesto (huevos, legumbres, pollo, atún económico); evitar suplementos o cortes premium.",
  "fat|healthy":
    "fat + healthy: pérdida de grasa saludable; déficit moderado; mucha fibra y verduras; proteína suficiente sin exceso calórico.",
  "family|save":
    "family + save: comidas rendidoras y económicas (guisos, arroz, legumbres, pollo); compras consolidadas en shopping_list.",
  "muscle|fat":
    "muscle + fat: recomposición; proteína alta; calorías controladas (no superávit grande ni déficit extremo).",
  "muscle|energy":
    "muscle + energy: suficientes carbohidratos complejos alrededor del entrenamiento; proteína en todas las comidas principales.",
  "fat|save":
    "fat + save: porciones controladas con ingredientes baratos (huevo, lenteja, pollo, verduras de temporada).",
  "healthy|energy":
    "healthy + energy: comidas completas con granos integrales y frutas; evitar saltar comidas.",
};

const PROTEIN_NAME_PATTERN =
  /pollo|pechuga|carne|res|cerdo|huevo|huevos|atún|salmon|salmón|tilapia|pescado|lenteja|frijol|garbanzo|arveja|proteína|proteina|queso|yogur|leche|tofu|soya|avena|nuez|almendra|carne molida|muslo/i;

const FAT_MAX_DAILY_KCAL = 3000;
const SAVE_MIN_STAPLE_CATEGORIES = 2;

function pairKey(a: GoalType, b: GoalType): string {
  return [a, b].sort().join("|");
}

export function activityLevelLabel(level: ActivityLevel): string {
  return ACTIVITY_LABELS[level];
}

export function isActivityLevel(value: string): value is ActivityLevel {
  return value in ACTIVITY_LABELS;
}

export function buildGoalSystemPromptSection(): string {
  const singles = Object.values(SINGLE_GOAL_RULES).join("\n- ");

  return `OBJETIVOS NUTRICIONALES (campo goals y goal_guidance del usuario):
- Aplica TODAS las reglas de los objetivos activos del usuario.
- Usa profile (edad, peso, altura, actividad) para ajustar porciones y estimated_daily_kcal de forma razonable para una persona adulta en Colombia.
- ${singles}
- Si hay varios objetivos, sigue goal_guidance y multi_goal_strategy del mensaje del usuario (prioridad documentada).`;
}

export function buildMultiGoalGuidance(goals: string[]): {
  goal_guidance: string;
  multi_goal_strategy: string;
  prioritized_goals: string[];
} {
  const active = GOAL_PRIORITY_ORDER.filter((g) => goals.includes(g));
  const lines: string[] = [];

  for (const goal of active) {
    lines.push(SINGLE_GOAL_RULES[goal]);
  }

  const pairLines: string[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const key = pairKey(active[i], active[j]);
      const rule = PAIR_GOAL_RULES[key];

      if (rule) {
        pairLines.push(rule);
      }
    }
  }

  const strategyParts = [
    `Objetivos activos (orden de prioridad FitMarket): ${active.join(" > ") || "ninguno"}.`,
    "save limita gasto; muscle/fat definen proteína y calorías; healthy es base; energy/family ajustan estilo de comida.",
  ];

  if (pairLines.length > 0) {
    strategyParts.push("Combinaciones detectadas:", ...pairLines);
  }

  return {
    prioritized_goals: active,
    goal_guidance: lines.join("\n"),
    multi_goal_strategy: strategyParts.join("\n"),
  };
}

function countProteinSignals(plan: WeeklyPlanParsed): number {
  let count = 0;

  for (const item of plan.shopping_list) {
    if (item.category === "proteinas") {
      count += 2;
      continue;
    }

    if (PROTEIN_NAME_PATTERN.test(item.name)) {
      count += 1;
    }
  }

  for (const dayMenu of Object.values(plan.weekly_menu)) {
    for (const items of Object.values(dayMenu)) {
      for (const line of items) {
        if (PROTEIN_NAME_PATTERN.test(line)) {
          count += 1;
        }
      }
    }
  }

  return count;
}

function countStapleItems(plan: WeeklyPlanParsed): number {
  return plan.shopping_list.filter(
    (item) =>
      item.category === "granos" || item.category === "frutas_verduras",
  ).length;
}

export function validateGoalCoherence(
  plan: WeeklyPlanParsed,
  goals: string[],
  weeklyBudgetCop: number,
): string | null {
  const goalSet = new Set(goals);

  if (goalSet.has("muscle") && countProteinSignals(plan) < 3) {
    return "El plan no incluye suficientes fuentes de proteína para el objetivo de ganar masa muscular.";
  }

  if (goalSet.has("fat") && plan.summary.estimated_daily_kcal > FAT_MAX_DAILY_KCAL) {
    return `Las calorías estimadas (${plan.summary.estimated_daily_kcal} kcal/día) son demasiado altas para el objetivo de perder grasa.`;
  }

  if (goalSet.has("save")) {
    const listTotal = plan.shopping_list.reduce(
      (sum, item) => sum + item.estimated_price_cop,
      0,
    );
    const staples = countStapleItems(plan);
    const budgetPressure = listTotal >= weeklyBudgetCop * 0.9;

    if (budgetPressure && staples < SAVE_MIN_STAPLE_CATEGORIES) {
      return "El plan agota el presupuesto sin suficientes ingredientes económicos básicos (granos o frutas/verduras) para el objetivo de ahorrar.";
    }

    const proteinSpend = plan.shopping_list
      .filter((item) => item.category === "proteinas")
      .reduce((sum, item) => sum + item.estimated_price_cop, 0);

    if (budgetPressure && proteinSpend > listTotal * 0.55) {
      return "El plan concentra demasiado gasto en proteínas premium respecto al presupuesto para el objetivo de ahorrar.";
    }
  }

  return null;
}
