/**
 * Offline quality evaluation of the plan generator.
 *
 * Runs the real pipeline (prompt -> OpenAI -> validation -> pricing -> budget
 * fit) on a fixed set of user profiles and prints metrics, so prompts and
 * models can be compared with numbers instead of impressions.
 *
 *   OPENAI_API_KEY=sk-... node scripts/eval-plans.mjs
 *   OPENAI_MODEL=gpt-4o-mini OPENAI_API_KEY=sk-... node scripts/eval-plans.mjs
 *
 * It calls OpenAI (one or two requests per profile), so it costs a little
 * money; nothing is read from or written to Supabase.
 */
import { createOpenAICaller } from "../supabase/functions/_shared/openai.ts";
import { generatePlan } from "../supabase/functions/_shared/planner/generate.ts";
import { calcTargets } from "../supabase/functions/_shared/nutrition.ts";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("Set OPENAI_API_KEY to run the evaluation.");
  process.exit(1);
}

const model = process.env.OPENAI_MODEL || undefined;
const callModel = createOpenAICaller({ apiKey, model });

const woman = { age: 28, weightKg: 62, heightCm: 165, activity: "moderate", sex: "female" };
const man = { age: 34, weightKg: 82, heightCm: 178, activity: "active", sex: "male" };
const student = { age: 20, weightKg: 58, heightCm: 168, activity: "light", sex: null };

const profiles = [
  { name: "Healthy, 1 person, 150k", weeklyBudgetCop: 150_000, goals: ["healthy"], restrictions: [], householdSize: 1, profile: woman },
  { name: "Save money, student, 90k", weeklyBudgetCop: 90_000, goals: ["save"], restrictions: [], householdSize: 1, profile: student },
  { name: "Muscle gain, 200k", weeklyBudgetCop: 200_000, goals: ["muscle"], restrictions: [], householdSize: 1, profile: man },
  { name: "Fat loss, 130k", weeklyBudgetCop: 130_000, goals: ["fat"], restrictions: [], householdSize: 1, profile: woman },
  { name: "Recomposition, 180k", weeklyBudgetCop: 180_000, goals: ["fat", "muscle"], restrictions: [], householdSize: 1, profile: man },
  { name: "Family of 4, 400k", weeklyBudgetCop: 400_000, goals: ["family", "save"], restrictions: [], householdSize: 4, profile: man },
  { name: "Vegetarian, 140k", weeklyBudgetCop: 140_000, goals: ["healthy"], restrictions: ["vegetarian"], householdSize: 1, profile: woman },
  { name: "Vegan, 140k", weeklyBudgetCop: 140_000, goals: ["healthy"], restrictions: ["vegan"], householdSize: 1, profile: woman },
  { name: "Lactose + gluten, 160k", weeklyBudgetCop: 160_000, goals: ["healthy"], restrictions: ["lactose", "gluten"], householdSize: 1, profile: man },
  { name: "Nut allergies + fish, 150k", weeklyBudgetCop: 150_000, goals: ["energy"], restrictions: ["peanut", "nuts", "fish", "shellfish"], householdSize: 1, profile: woman },
  { name: "Free text (cilantro, pollo), 150k", weeklyBudgetCop: 150_000, goals: ["healthy"], restrictions: ["cilantro", "pollo"], householdSize: 1, profile: man },
  { name: "Very tight budget, 60k", weeklyBudgetCop: 60_000, goals: ["save"], restrictions: [], householdSize: 1, profile: student },
];

const pad = (value, width) => String(value).padEnd(width);
const rows = [];

for (const scenario of profiles) {
  const started = Date.now();
  const targets = calcTargets(scenario.profile, scenario.goals);
  const outcome = await generatePlan(scenario, callModel);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if ("plan" in outcome) {
    const { summary, shopping_list } = outcome.plan;
    const kcalError = Math.round(
      (Math.abs(summary.estimated_daily_kcal - targets.kcal) / targets.kcal) * 100,
    );

    rows.push({
      name: scenario.name,
      result: "ok",
      cost: `${summary.estimated_total_cop} / ${scenario.weeklyBudgetCop}`,
      kcal: `${summary.estimated_daily_kcal} (${kcalError}% off)`,
      protein: `${summary.estimated_daily_protein_g} / ${targets.proteinG} g`,
      items: shopping_list.length,
      seconds,
    });
  } else {
    const { code, budget } = outcome.error;

    rows.push({
      name: scenario.name,
      result: code,
      cost: budget ? `needs ${budget.requiredBudget}` : "-",
      kcal: "-",
      protein: "-",
      items: "-",
      seconds,
    });
  }
}

console.log(`\nModel: ${model ?? "default"}\n`);
console.log(
  [pad("scenario", 36), pad("result", 18), pad("cost / budget", 22), pad("kcal", 20), pad("protein", 16), pad("items", 6), "sec"].join(""),
);

for (const row of rows) {
  console.log(
    [pad(row.name, 36), pad(row.result, 18), pad(row.cost, 22), pad(row.kcal, 20), pad(row.protein, 16), pad(row.items, 6), row.seconds].join(""),
  );
}

const ok = rows.filter((row) => row.result === "ok").length;
console.log(`\n${ok}/${rows.length} scenarios produced a plan.`);
