import assert from "node:assert/strict";
import { generatePlan } from "./generate.ts";
import { DAYS } from "./types.ts";

const m = (name, ...items) => ({
  name_es: name,
  name_en: name,
  items: items.map(([id, qty]) => ({ id, qty })),
});

/** What a decent model would return: three rotating day templates. */
function goodComposition() {
  const templates = [
    {
      desayuno: m("Avena con fruta", ["avena", 60], ["banano", 1], ["leche_entera", 200]),
      almuerzo: m("Lentejas con arroz", ["lentejas", 80], ["arroz_blanco", 80], ["cebolla_cabezona", 40], ["zanahoria", 60]),
      cena: m("Huevos pericos", ["huevo", 3], ["tomate_chonto", 80], ["harina_maiz", 60]),
      snacks: m("Yogur con manzana", ["yogur_natural", 150], ["manzana", 1]),
    },
    {
      desayuno: m("Arepa con queso", ["harina_maiz", 70], ["queso_campesino", 40], ["huevo", 2]),
      almuerzo: m("Pollo con papa", ["pernil_pollo", 180], ["papa", 250], ["habichuela", 80]),
      cena: m("Pasta con atún", ["pasta", 80], ["atun_lata", 80], ["pimenton", 0.5]),
      snacks: m("Maní y naranja", ["mani", 25], ["naranja", 1]),
    },
    {
      desayuno: m("Pan con huevo", ["pan_tajado", 70], ["huevo", 2], ["leche_entera", 200]),
      almuerzo: m("Frijoles con plátano", ["frijol", 80], ["platano", 150], ["arroz_blanco", 70], ["repollo", 60]),
      cena: m("Pescado con yuca", ["tilapia", 150], ["yuca", 200], ["ahuyama", 100]),
      snacks: m("Papaya", ["papaya", 200], ["almendras", 15]),
    },
  ];

  return { days: DAYS.map((day, i) => ({ day, ...templates[i % 3] })) };
}

const baseInput = {
  weeklyBudgetCop: 250_000,
  goals: ["healthy"],
  stores: ["Exito", "D1"],
  restrictions: [],
  householdSize: 1,
  profile: { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" },
};

const respond = (content) => ({ content: JSON.stringify(content), error: null, errorCode: null });

// 1. Happy path: a valid composition becomes a priced, balanced plan.
{
  let prompts = [];
  const result = await generatePlan(baseInput, async (request) => {
    prompts.push(request);
    return respond(goodComposition());
  });

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.equal(prompts.length, 1, "no retry needed");
  assert.ok(result.plan.summary.estimated_total_cop <= baseInput.weeklyBudgetCop);
  assert.ok(result.plan.shopping_list.length >= 14);
  assert.equal(
    result.plan.shopping_list.reduce((s, i) => s + i.estimated_price_cop, 0),
    result.plan.summary.estimated_total_cop,
  );
  assert.ok(result.plan.weekly_menu.lun.almuerzo.length >= 2);
  assert.ok(result.plan.weekly_menu_en.lun.almuerzo.length >= 2);

  // The model only ever sees the ingredient ids it may use.
  assert.match(prompts[0].user, /pechuga_pollo/);
  assert.equal(prompts[0].responseFormat.json_schema.strict, true);
}

// 2. Restrictions are enforced by construction: vegan users never see eggs.
{
  let seen = "";
  const result = await generatePlan({ ...baseInput, restrictions: ["vegan"] }, async (request) => {
    // Only the first prompt: the retry prompt names the rejected ids on purpose.
    seen ||= request.user;
    return respond(goodComposition()); // uses huevo / leche: not allowed for vegan
  });

  assert.doesNotMatch(seen, /\bhuevo\b/);
  assert.doesNotMatch(seen, /leche_entera/);
  assert.ok(result.error, "a plan using forbidden foods must be rejected");
  assert.equal(result.error.code, "invalid_format");
}

// 3. A bad first answer gets feedback and a second chance.
{
  const prompts = [];
  const bad = goodComposition();
  bad.days[0].cena.items[0].id = "pizza";
  const answers = [respond(bad), respond(goodComposition())];

  const result = await generatePlan(baseInput, async (request) => {
    prompts.push(request.user);
    return answers.shift();
  });

  assert.ok(result.plan);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /"pizza" is not an allowed ingredient id/);
}

// 4. A budget that cannot work is reported with the real required amount.
{
  const result = await generatePlan({ ...baseInput, weeklyBudgetCop: 30_000 }, async () =>
    respond(goodComposition()),
  );

  assert.equal(result.error.code, "budget_too_low");
  const { currentBudget, requiredBudget, recommendedIncrease } = result.error.budget;
  assert.equal(currentBudget, 30_000);
  assert.ok(requiredBudget > 30_000);
  assert.equal(recommendedIncrease, requiredBudget - 30_000);
}

// 5. The fitter makes an over-budget but fixable week fit.
{
  const open = await generatePlan({ ...baseInput, weeklyBudgetCop: 10_000_000 }, async () =>
    respond(goodComposition()),
  );
  const tight = await generatePlan(
    { ...baseInput, weeklyBudgetCop: Math.round(open.plan.summary.estimated_total_cop * 0.9) },
    async () => respond(goodComposition()),
  );

  assert.ok(tight.plan, "a 10% shortfall should be fixed with cheaper swaps");
  assert.ok(tight.plan.summary.estimated_total_cop < open.plan.summary.estimated_total_cop);
}

// 6. Household size scales the shopping list but not the per-person menu.
{
  const one = await generatePlan(baseInput, async () => respond(goodComposition()));
  const three = await generatePlan(
    { ...baseInput, householdSize: 3, weeklyBudgetCop: 750_000 },
    async () => respond(goodComposition()),
  );

  assert.ok(three.plan.summary.estimated_total_cop > one.plan.summary.estimated_total_cop * 1.5);
  assert.equal(three.plan.summary.household_size, 3);
  assert.deepEqual(three.plan.weekly_menu.lun.desayuno, one.plan.weekly_menu.lun.desayuno);
}

// 7. Failures from the model are reported; a missing key is not retried.
{
  let calls = 0;
  const config = await generatePlan(baseInput, async () => {
    calls += 1;
    return { content: null, error: "x", errorCode: "server_config" };
  });
  assert.equal(config.error.code, "server_config");
  assert.equal(calls, 1);

  let flaky = 0;
  const timeout = await generatePlan(baseInput, async () => {
    flaky += 1;
    return { content: null, error: "x", errorCode: "ai_timeout" };
  });
  assert.equal(timeout.error.code, "ai_timeout");
  assert.equal(flaky, 2, "transient failures get one retry");

  const garbage = await generatePlan(baseInput, async () => ({ content: "not json", error: null, errorCode: null }));
  assert.ok(garbage.error);
}

// 8. Too many restrictions leave too few foods to plan with.
{
  const result = await generatePlan(
    { ...baseInput, restrictions: ["vegan", "gluten", "peanut", "nuts", "arroz", "papa", "lentejas", "frijol", "yuca", "platano", "avena", "garbanzo"] },
    async () => respond(goodComposition()),
  );
  assert.ok(result.error);
}

console.log("generate: all checks passed");
