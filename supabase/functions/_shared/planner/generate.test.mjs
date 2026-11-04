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

// 2b. An answer with only some of the days is completed, not thrown away:
// each missing day is requested on its own.
{
  const full = goodComposition();
  const prompts = [];

  const result = await generatePlan(baseInput, async (request) => {
    prompts.push(request.user);

    // First call: one day only. Day calls: that day, as asked.
    if (prompts.length === 1) {
      return respond({ days: full.days.slice(0, 1) });
    }

    const asked = request.user.match(/Compose ONLY these days now: (\w+)\./)?.[1];
    return respond({ days: full.days.filter((entry) => entry.day === asked) });
  });

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.equal(prompts.length, 7, "one call plus six single-day calls");
  assert.ok(prompts.slice(1).every((p) => /lun:/.test(p)), "already planned days are shown");
  assert.ok(result.plan.weekly_menu.dom.almuerzo.length >= 1);
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
  const result = await generatePlan({ ...baseInput, weeklyBudgetCop: 45_000 }, async () =>
    respond(goodComposition()),
  );

  assert.equal(result.error.code, "budget_too_low");
  const { currentBudget, requiredBudget, recommendedIncrease } = result.error.budget;
  assert.equal(currentBudget, 45_000);
  assert.ok(requiredBudget > 45_000);
  assert.equal(recommendedIncrease, requiredBudget - 45_000);
}

// 4b. An absurd budget (someone typed 150 instead of 150,000) is answered at
// once, without paying for an AI request.
{
  let calls = 0;
  const result = await generatePlan({ ...baseInput, weeklyBudgetCop: 150 }, async () => {
    calls += 1;
    return respond(goodComposition());
  });

  assert.equal(calls, 0);
  assert.equal(result.error.code, "budget_too_low");
  assert.equal(result.error.budget.requiredBudget, 40_000);
  assert.equal(
    (await generatePlan({ ...baseInput, weeklyBudgetCop: 100_000, householdSize: 3 }, async () => respond(goodComposition()))).error.budget.requiredBudget,
    120_000,
    "the floor scales with the household",
  );
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

// 5b. Swapped meals are renamed from their final ingredients, so a dish name
// never mentions a food that is no longer on the plate.
{
  const open = await generatePlan({ ...baseInput, weeklyBudgetCop: 10_000_000 }, async () =>
    respond(goodComposition()),
  );
  const namingCalls = [];
  const tight = await generatePlan(
    { ...baseInput, weeklyBudgetCop: Math.round(open.plan.summary.estimated_total_cop * 0.85) },
    async (request) => {
      if (request.responseFormat.json_schema.name === "meal_names") {
        const keys = request.responseFormat.json_schema.schema.properties.meals.items.properties.key.enum;
        namingCalls.push(keys);
        return respond({
          meals: keys.map((key) => ({ key, name_es: `Plato renombrado ${key}`, name_en: `Renamed dish ${key}` })),
        });
      }
      return respond(goodComposition());
    },
  );

  assert.ok(tight.plan);
  assert.equal(namingCalls.length, 1, "one naming call for all changed meals");
  assert.ok(namingCalls[0].length > 0 && namingCalls[0].length < 28, "only changed meals are renamed");

  const renamed = new Set(namingCalls[0]);
  for (const day of ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]) {
    for (const slot of ["desayuno", "almuerzo", "cena", "snacks"]) {
      const name = tight.plan.dish_names[day][slot].es;
      assert.equal(name.startsWith("Plato renombrado"), renamed.has(`${day}.${slot}`), `${day}.${slot}`);
    }
  }
}

// 5c. No swaps needed -> no extra naming request is made.
{
  let calls = 0;
  const result = await generatePlan({ ...baseInput, weeklyBudgetCop: 10_000_000 }, async () => {
    calls += 1;
    return respond(goodComposition());
  });
  assert.ok(result.plan);
  assert.equal(calls, 1);
}

// 5d. With D1, Ara and Jumbo selected the list is bought at the cheap ones,
// and uses both discount stores (the app used to ignore Ara).
{
  const result = await generatePlan(
    { ...baseInput, stores: ["Ara", "D1", "Jumbo"], goals: ["save"] },
    async () => respond(goodComposition()),
  );
  const used = new Set(result.plan.shopping_list.map((i) => i.store_id));
  assert.ok(used.has("D1") && used.has("Ara"));
  // Jumbo is only needed for what the discount chains do not stock (almonds).
  const atJumbo = result.plan.shopping_list.filter((i) => i.store_id === "Jumbo").map((i) => i.name);
  assert.deepEqual(atJumbo, ["Almendras"]);
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
  const { CATALOG } = await import("../catalog.ts");
  const tooMany = CATALOG.slice(0, 55).map((item) => item.name.es);
  const result = await generatePlan(
    { ...baseInput, restrictions: tooMany },
    async () => respond(goodComposition()),
  );
  assert.equal(result.error.code, "restrictions_too_strict");
}

// A model that answers one day per attempt and garbage for every day fill:
// the worst case for the number of calls.
function oneDayThenGarbage(onCall = () => {}) {
  const full = goodComposition();
  return async (request) => {
    onCall(request);
    if (/Compose ONLY these days now/.test(request.user)) {
      return { content: "not json", error: null, errorCode: null };
    }
    return respond({ days: full.days.slice(0, 1) });
  };
}

// 9. The call cap bounds the cost of one request (it used to reach ~40 calls).
{
  let uncapped = 0;
  const before = await generatePlan(
    baseInput,
    oneDayThenGarbage(() => (uncapped += 1)),
    { maxModelCalls: 1000 },
  );
  assert.ok(before.error);
  assert.equal(uncapped, 39, "3 attempts x (1 + 2 rounds x 6 days)");

  let calls = 0;
  let composeCalls = 0;
  const capped = await generatePlan(
    baseInput,
    oneDayThenGarbage((request) => {
      calls += 1;
      if (!/Compose ONLY these days now/.test(request.user)) composeCalls += 1;
    }),
  );
  assert.ok(capped.error);
  assert.ok(calls <= 12, `default cap is 12, made ${calls}`);
  // A day-fill round that cannot cover every missing day is skipped (it could
  // not complete the week), so the calls go to the retries with feedback.
  assert.equal(calls, 9, "1 + 6 fills, then 2 retries; no partial round");
  assert.equal(composeCalls, 3, "all 3 attempts still run");
  assert.equal(capped.usage.modelCalls, calls);
  assert.equal(capped.usage.billableCalls, calls, "every answer had content: all billed");

  let small = 0;
  await generatePlan(baseInput, oneDayThenGarbage(() => (small += 1)), { maxModelCalls: 3 });
  assert.equal(small, 3, "the cap is configurable");
}

// 10. The time budget: a slow model (50 s per call) never runs past the deadline,
// and each call is given at most the time left.
{
  let clock = 0;
  const deadline = 120_000;
  const full = goodComposition();
  const timeouts = [];

  const slowModel = async (request) => {
    const startedAt = clock;
    const limit = request.timeoutMs ?? Infinity;
    timeouts.push({ limit, left: deadline - startedAt });
    await null;
    clock = Math.max(clock, startedAt + Math.min(50_000, limit));
    if (limit < 50_000) {
      return { content: null, error: "x", errorCode: "ai_timeout" };
    }
    if (/Compose ONLY these days now/.test(request.user)) {
      return { content: "not json", error: null, errorCode: null };
    }
    return respond({ days: full.days.slice(0, 1) });
  };

  const result = await generatePlan(baseInput, slowModel, {
    deadline,
    now: () => clock,
  });

  assert.ok(result.error);
  assert.ok(clock <= deadline, `finished at ${clock} ms, deadline ${deadline} ms`);
  assert.ok(timeouts.every((t) => t.limit <= t.left), "no call may outlive the deadline");
  // t=0 compose (50 s), t=50 s six day fills (50 s). At t=100 s only 20 s are
  // left: less than a full composition needs (30 s), so attempt 2 never starts.
  assert.equal(clock, 100_000);
  assert.equal(result.usage.modelCalls, 7);
}

// 11. Usage is reported: the happy path makes one billed call.
{
  const result = await generatePlan(baseInput, async () => respond(goodComposition()));
  assert.ok(result.plan);
  assert.deepEqual(result.usage, { modelCalls: 1, billableCalls: 1, refusedCalls: 0 });
}

// 12. Refunds only when OpenAI charged nothing. An empty answer (a refusal)
// and an aborted call may be billed, so a request ending in ai_timeout after
// them is NOT refunded; a pure outage (no answer at all) is.
{
  const { shouldRefund } = await import("../quota.ts");
  const answers = [
    { content: null, error: "x", errorCode: "ai_empty", detail: "refusal" },
    { content: null, error: "x", errorCode: "ai_timeout" },
  ];
  const billed = await generatePlan(baseInput, async () => answers.shift());
  assert.equal(billed.error.code, "ai_timeout");
  assert.equal(billed.usage.billableCalls, 2);
  assert.equal(shouldRefund(billed.error.code, billed.usage), false);

  const outage = await generatePlan(baseInput, async () => ({
    content: null,
    error: "x",
    errorCode: "ai_unavailable",
    detail: "http_503",
  }));
  assert.equal(outage.error.code, "ai_unavailable");
  assert.equal(outage.usage.billableCalls, 0);
  assert.equal(shouldRefund(outage.error.code, outage.usage), true);
}

console.log("generate: all checks passed");
