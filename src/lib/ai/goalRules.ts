/**
 * Mantener alineado con supabase/functions/_shared/goalRules.ts
 */

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

export const GOAL_PRIORITY_ORDER: GoalType[] = [
  "save",
  "muscle",
  "fat",
  "healthy",
  "energy",
  "family",
];

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "sedentario (poco ejercicio)",
  light: "ligero (1–2 días/semana)",
  moderate: "moderado (3–4 días/semana)",
  active: "activo (5–6 días/semana)",
  very_active: "muy activo (ejercicio intenso diario)",
};

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
