import assert from "node:assert/strict";
import { before, test } from "node:test";
import { STATIC_CATALOG } from "../catalog.ts";
import { failureResponse } from "../generationResponse.ts";
import { RECIPES } from "../recipes/library.generated.ts";
import { MIN_COMPOSE_TIME_MS } from "./callBudget.ts";
import {
  baseInput,
  enumModel,
  female,
  loadSolver,
  respond,
  rotationModel,
  rotationWeek,
} from "./generate.fixtures.mjs";
import { generatePlan, planFromPartial } from "./generate.ts";
import { optimizeWeek } from "./optimizer/optimize.ts";
import { householdFactor, buildTargets } from "./rules/targets.ts";
import { buildRestrictionRules, isAllowed } from "./restrictions.ts";
import { DAYS, SLOTS } from "./types.ts";

before(loadSolver);

const NAMES = new Map(RECIPES.map((r) => [r.id, r]));

/** The real optimizer, wrapped so a test can see its input and change its verdict. */
function realOptimizer(transform = (result) => result, seen = []) {
  return {
    prepare: async () => true,
    loadError: () => null,
    optimize: (input) => {
      seen.push(input);
      return transform(optimizeWeek({ ...input, log: () => {} }), input);
    },
  };
}

const PROTEIN_SHORT = { rule: "protein_min", level: 2, unit: "g_per_kg", target: 1.6, achieved: 1.32 };
const FIBER_SHORT = { rule: "fiber_min", level: 3, unit: "g", target: 25, achieved: 19 };
/** Turns a real optimal week into a relaxed one (same week, budget met). */
const asRelaxed = (shortfalls = [PROTEIN_SHORT], requiredBudgetCop = 320_000) => (result) =>
  result.week ? { ...result, status: "relaxed", shortfalls, requiredBudgetCop } : result;

// ---------------------------------------------------------------- happy path

test("happy path: plan from recipes, every rule met, cost <= budget, names from recipes", async () => {
  const result = await generatePlan(baseInput, rotationModel());

  assert.ok(result.plan, JSON.stringify(result.error));
  const plan = result.plan;
  assert.deepEqual(plan.compliance, { status: "full", unmet: [] });
  assert.ok(plan.summary.estimated_total_cop <= baseInput.weeklyBudgetCop);
  assert.ok(plan.summary.recipe_library_version);
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const id = plan.meal_recipes[day][slot];
      assert.ok(plan.recipes[id], `${day}.${slot} recipe details`);
      const recipe = NAMES.get(id);
      const names = [recipe.name.es, ...recipe.lines.flatMap((l) => (l.alternatives ?? []).map((a) => a.name?.es))];
      assert.ok(names.includes(plan.dish_names[day][slot].es), `${day}.${slot} named from its recipe`);
    }
  }
});

test("model calls: one per attempt plus day fills, never a rename call", async () => {
  const requests = [];
  const ok = await generatePlan(baseInput, rotationModel((r) => requests.push(r)));
  assert.ok(ok.plan);
  assert.equal(requests.length, 1);
  assert.deepEqual(ok.usage, { modelCalls: 1, billableCalls: 1, refusedCalls: 0 });

  const calls = [];
  const twoDays = await generatePlan(baseInput, async (request) => {
    calls.push(request);
    const full = rotationWeek().days;
    if (calls.length === 1) return respond({ days: full.slice(0, 2) });
    const day = DAYS.find((d) => request.user.includes(`Choose ONLY these days now: ${d}.`));
    return respond({ days: full.filter((entry) => entry.day === day) });
  });
  assert.ok(twoDays.plan, JSON.stringify(twoDays.error));
  assert.equal(calls.length, 1 + 5);
  assert.ok(calls.every((r) => r.responseFormat.json_schema.name === "weekly_recipes"), "no rename schema");
});

test("an unknown recipe id triggers a retry with feedback", async () => {
  const requests = [];
  const result = await generatePlan(baseInput, async (request) => {
    requests.push(request);
    return respond(requests.length === 1 ? rotationWeek({ lun: { cena: "avena_con_banano" } }) : rotationWeek());
  });

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.equal(requests.length, 2);
  assert.match(requests[1].user, /avena_con_banano/);
});

test("weekend-only recipe on Tuesday is repaired, not rejected", async () => {
  const result = await generatePlan(baseInput, async () =>
    respond(rotationWeek({ mar: { almuerzo: "lentejas_con_arroz" } })),
  );

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.notEqual(result.plan.meal_recipes.mar.almuerzo, "lentejas_con_arroz");
});

test("a picker can replace the AI: no model call is made", async () => {
  const week = Object.fromEntries(rotationWeek().days.map(({ day, ...meals }) => [day, meals]));
  let calls = 0;
  const result = await generatePlan(baseInput, async () => {
    calls += 1;
    return respond({});
  }, undefined, { picker: { pick: async () => ({ kind: "week", week }) } });

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.equal(calls, 0);
  assert.equal(result.plan.meal_recipes.lun.almuerzo, "pollo_salteado_con_quinua");
});

// ---------------------------------------------------------------- unreachable goals

test("unreachable goals: goals_unreachable with conflicts, canForce, a budget option and the week to reuse", async () => {
  const result = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });

  assert.equal(result.error?.code, "goals_unreachable", JSON.stringify(result.error));
  assert.deepEqual(result.error.conflicts, [PROTEIN_SHORT]);
  assert.equal(result.error.canForce, true);
  assert.deepEqual(result.error.budget, { currentBudget: 250_000, requiredBudget: 320_000, recommendedIncrease: 70_000 });
  assert.ok(result.reusable?.week?.lun?.almuerzo?.recipeId, "first-attempt week kept for 'Quiero el plan igual'");
});

test("unreachable goals without a budget fix offer no budget option", async () => {
  const result = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: realOptimizer(asRelaxed([PROTEIN_SHORT], null)),
  });
  assert.equal(result.error.code, "goals_unreachable");
  assert.equal(result.error.budget, undefined);
});

test("relaxed with time left retries with feedback from the shortfalls and keeps the best", async () => {
  const requests = [];
  let n = 0;
  const optimizer = realOptimizer((result) => {
    n += 1;
    // Attempt 1: two shortfalls; attempt 2: one; attempt 3: two again.
    return asRelaxed(n === 2 ? [FIBER_SHORT] : [PROTEIN_SHORT, FIBER_SHORT], null)(result);
  });
  const result = await generatePlan(baseInput, rotationModel((r) => requests.push(r)), undefined, { optimizer });

  assert.equal(requests.length, 3);
  assert.match(requests[1].user, /more protein-rich recipes/);
  assert.match(requests[1].user, /vegetables, legumes or fruit/);
  assert.deepEqual(result.error.conflicts, [FIBER_SHORT], "fewest weighted shortfalls wins");
});

test("allowPartial: plan with compliance partial and total <= budget, one attempt", async () => {
  const requests = [];
  const result = await generatePlan({ ...baseInput, allowPartial: true }, rotationModel((r) => requests.push(r)), undefined, {
    optimizer: realOptimizer(asRelaxed()),
  });

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.equal(requests.length, 1, "the first relaxed week is the partial plan");
  assert.equal(result.plan.compliance.status, "partial");
  assert.deepEqual(result.plan.compliance.unmet, [{ rule: "protein_min", target: 1.6, achieved: 1.32, unit: "g_per_kg" }]);
  assert.ok(result.plan.summary.estimated_total_cop <= baseInput.weeklyBudgetCop);
});

test("allowPartial never relaxes the budget: over_budget still answers budget_too_low", async () => {
  const input = { ...baseInput, weeklyBudgetCop: 140_000, allowPartial: true };
  const overBudget = () => ({ status: "over_budget", week: null, costCop: null, shortfalls: [], relaxations: [], requiredBudgetCop: 180_000, solves: 2, cpuMs: 1 });
  const result = await generatePlan(input, rotationModel(), undefined, { optimizer: realOptimizer(overBudget) });

  assert.equal(result.error?.code, "budget_too_low", JSON.stringify(result.error ?? result.plan?.summary));
  assert.deepEqual(result.error.budget, { currentBudget: 140_000, requiredBudget: 180_000, recommendedIncrease: 40_000 });
});

// ---------------------------------------------------------------- restrictions and profiles

test("vegan + no gluten, peanut or nuts: restrictions_too_strict with availableRecipes, no model call", async () => {
  let calls = 0;
  const result = await generatePlan({ ...baseInput, restrictions: ["vegan", "gluten", "peanut", "nuts"] }, enumModel(() => (calls += 1)));

  assert.equal(result.error.code, "restrictions_too_strict");
  assert.equal(calls, 0);
  assert.equal(result.error.diagnostics.availableRecipes.almuerzo, 0);
  assert.equal(typeof result.error.diagnostics.availableFoods, "number");
});

test("vegan: no tagged food anywhere in the plan or the shopping list", async () => {
  const result = await generatePlan({ ...baseInput, restrictions: ["vegan"], allowPartial: true }, enumModel());
  assert.ok(result.plan, JSON.stringify(result.error));

  const rules = buildRestrictionRules(["vegan"], STATIC_CATALOG);
  const vegan = new Set(STATIC_CATALOG.all.filter((f) => isAllowed(f, rules)).map((f) => f.name.es));
  assert.ok(vegan.size < STATIC_CATALOG.all.length);

  for (const item of result.plan.shopping_list) assert.ok(vegan.has(item.name), item.name);
});

test("a 16-year-old asking for fat gets a maintenance plan with notice fat_blocked_minor", async () => {
  const teen = { ...female, age: 16 };
  const seen = [];
  const result = await generatePlan({ ...baseInput, goals: ["fat"], profile: teen, allowPartial: true }, enumModel(), undefined, {
    optimizer: realOptimizer(undefined, seen),
  });

  assert.ok(result.plan, JSON.stringify(result.error));
  assert.ok(result.plan.notices.includes("fat_blocked_minor"));
  assert.deepEqual(seen[0].rules.targets.effectiveGoals, []);
});

test("household of 3 buys for 1 + 2·2000/userKcal portions", async () => {
  const seen = [];
  const results = [];
  const input = { ...baseInput, householdSize: 3, weeklyBudgetCop: 600_000 };
  const result = await generatePlan(input, rotationModel(), undefined, {
    optimizer: realOptimizer((r) => (results.push(r), r), seen),
  });

  assert.ok(result.plan, JSON.stringify(result.error));
  const kcal = buildTargets(female, ["save"]).kcal;
  assert.equal(seen[0].householdFactor, householdFactor(3, kcal));
  assert.equal(result.plan.summary.household_size, 3);
  assert.equal(result.plan.summary.estimated_total_cop, results[0].costCop, "the list is bought for the same factor");
});

test("shopping list foods are exactly the menu foods (after swaps)", async () => {
  const results = [];
  const result = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: realOptimizer((r) => (results.push(r), r)),
  });
  assert.ok(result.plan);

  const menuFoods = new Set();
  for (const day of DAYS) for (const slot of SLOTS) for (const item of results[0].week[day][slot].items) {
    menuFoods.add(STATIC_CATALOG.get(item.id).name.es);
  }
  assert.deepEqual(new Set(result.plan.shopping_list.map((i) => i.name)), menuFoods);
});

// ---------------------------------------------------------------- time and failures

test("time budget: no new attempt when less than MIN_COMPOSE_TIME_MS is left", async () => {
  let clock = 0;
  const requests = [];
  const result = await generatePlan(baseInput, async (request) => {
    requests.push(request);
    clock = 120_000 - MIN_COMPOSE_TIME_MS + 1; // the answer took almost all the time
    return respond(rotationWeek({ lun: { cena: "avena_con_banano" } }));
  }, { deadline: 120_000, now: () => clock });

  assert.equal(requests.length, 1);
  assert.equal(result.error.code, "invalid_format");
});

test("solver not loaded: generation_failed optimizer_unavailable before any model call", async () => {
  let calls = 0;
  const logs = [];
  const original = console.log;
  console.log = (line) => logs.push(String(line));
  let result;
  try {
    result = await generatePlan(baseInput, rotationModel(() => (calls += 1)), undefined, {
      optimizer: { prepare: async () => false, loadError: () => "wasm_not_found", optimize: () => assert.fail("no solve") },
    });
  } finally {
    console.log = original;
  }

  assert.equal(result.error.code, "generation_failed");
  assert.deepEqual(result.error.diagnostics.reasons, ["optimizer_unavailable"]);
  assert.equal(calls, 0, "no paid call when the week could not be priced");
  assert.ok(logs.some((l) => l === JSON.stringify({ event: "lp_load_failed", code: "wasm_not_found" })));
});

for (const [error, reason] of [["cpu_exhausted", "optimizer_cpu_exhausted"], ["solver_error", "optimizer_unavailable"]]) {
  test(`optimizer error ${error} without a week: generation_failed ${reason}`, async () => {
    const result = await generatePlan(baseInput, rotationModel(), undefined, {
      optimizer: realOptimizer(() => ({ status: "infeasible", week: null, costCop: null, shortfalls: [], relaxations: [], requiredBudgetCop: null, solves: 1, cpuMs: 1, error })),
    });
    assert.equal(result.error.code, "generation_failed");
    assert.ok(result.error.diagnostics.reasons.includes(reason));
  });
}

test("optimizer error read before status: a week found before the CPU ran out is still used", async () => {
  const result = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: realOptimizer((r) => ({ ...r, error: "cpu_exhausted" })),
  });
  assert.ok(result.plan, JSON.stringify(result.error));
});

test("infeasible: generation_failed optimizer_infeasible", async () => {
  const result = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: realOptimizer(() => ({ status: "infeasible", week: null, costCop: null, shortfalls: [], relaxations: [], requiredBudgetCop: null, solves: 2, cpuMs: 1 })),
  });
  assert.equal(result.error.code, "generation_failed");
  assert.ok(result.error.diagnostics.reasons.includes("optimizer_infeasible"));
});

test("a RangeError from the optimizer becomes generation_failed optimizer_invalid_input", async () => {
  const result = await generatePlan(baseInput, rotationModel(), undefined, {
    optimizer: realOptimizer(() => {
      throw new RangeError("weekend-only recipe on lun");
    }),
  });
  assert.equal(result.error.code, "generation_failed");
  assert.ok(result.error.diagnostics.reasons.includes("optimizer_invalid_input"));
});

// ---------------------------------------------------------------- contract with the HTTP answer

test("generatePlan → failureResponse: new client gets goals_unreachable, old client a known code", async () => {
  const result = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });

  const fresh = failureResponse(result.error, { appVersion: "0.1.0", allowPartial: false });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.payload.code, "goals_unreachable");
  assert.deepEqual(fresh.payload.conflicts, [PROTEIN_SHORT]);
  assert.equal(fresh.payload.canForce, true);
  assert.equal(fresh.payload.budgetOption.requiredBudget, 320_000);

  const old = failureResponse(result.error, { appVersion: null, allowPartial: false });
  assert.deepEqual(old, { status: 200, payload: { error: "budget_too_low", code: "budget_too_low", currentBudget: 250_000, requiredBudget: 320_000, recommendedIncrease: 70_000 } });

  const noFix = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed([PROTEIN_SHORT], null)) });
  assert.equal(failureResponse(noFix.error, { appVersion: null, allowPartial: false }).payload.code, "goal_incoherent");
});

// ---------------------------------------------------------------- "Quiero el plan igual" from a stored week

test("planFromPartial: the stored week becomes a partial plan without any model call", async () => {
  const first = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });
  const plan = planFromPartial(baseInput, first.reusable);

  assert.ok(plan);
  assert.equal(plan.compliance.status === "partial" || plan.compliance.status === "full", true);
  assert.ok(plan.summary.estimated_total_cop <= baseInput.weeklyBudgetCop);
  assert.equal(plan.meal_recipes.lun.almuerzo, first.reusable.week.lun.almuerzo.recipeId);
});

test("planFromPartial measures compliance on the stored week (never trusts stored claims)", async () => {
  const first = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });
  // The week itself meets every rule for "save"; healthy adds rules it misses.
  const plan = planFromPartial({ ...baseInput, goals: ["healthy"] }, first.reusable);
  assert.ok(plan === null || plan.compliance.status === "partial");
});

test("planFromPartial rejects a stored week with a forbidden food", async () => {
  const first = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });
  assert.equal(planFromPartial({ ...baseInput, restrictions: ["fish"] }, first.reusable), null);
});

test("planFromPartial rejects a stored week above the budget", async () => {
  const first = await generatePlan(baseInput, rotationModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });
  assert.equal(planFromPartial({ ...baseInput, weeklyBudgetCop: 131_000 }, first.reusable), null);
});

test("planFromPartial rejects malformed data", () => {
  assert.equal(planFromPartial(baseInput, null), null);
  assert.equal(planFromPartial(baseInput, { week: { lun: {} } }), null);
  assert.equal(planFromPartial(baseInput, { week: "x" }), null);
});

test("fat_max shortfall: the retry names the fattiest day and its fattiest dish to swap", async () => {
  const fatty = { desayuno: "pan_con_aguacate_y_tomate", almuerzo: "ensalada_de_aguacate_y_mani", cena: "tortilla_de_verduras_con_aguacate", snacks: "palitos_de_verdura_con_guacamole" };
  const base = Object.fromEntries(rotationWeek().days.map(({ day, ...meals }) => [day, meals]));
  const week = { ...base, mie: fatty };
  const feedbacks = [];
  const picker = { pick: async (context) => (feedbacks.push(context.feedback), { kind: "week", week }) };
  const FAT = { rule: "fat_max", level: 3, unit: "pct_kcal", target: 30, achieved: 41 };
  await generatePlan(baseInput, rotationModel(), undefined, { picker, optimizer: realOptimizer(asRelaxed([FAT], null)) });

  assert.equal(feedbacks.length, 3);
  assert.match(feedbacks[1], /mie/);
  assert.match(feedbacks[1], /"(ensalada_de_aguacate_y_mani|tortilla_de_verduras_con_aguacate)"/);
  assert.match(feedbacks[1], /at most one high-fat dish per day/);
});

// Recipes now scale cooking oil as a "condiment" line (0.5-1x) and protein up to 2.5x.
test("planFromPartial accepts a stored week whose recipes have condiment lines", async () => {
  const first = await generatePlan(baseInput, enumModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });
  const withOil = DAYS.flatMap((d) => SLOTS.map((s) => first.reusable.week[d][s])).filter((meal) =>
    NAMES.get(meal.recipeId).lines.some((line) => line.role === "condiment"),
  );
  assert.ok(withOil.length > 0, "the fixture week uses condiment recipes");
  assert.ok(planFromPartial(baseInput, first.reusable));
});

test("planFromPartial rejects an item far above what its recipe line can scale to", async () => {
  const first = await generatePlan(baseInput, enumModel(), undefined, { optimizer: realOptimizer(asRelaxed()) });
  const week = structuredClone(first.reusable.week);
  const meal = DAYS.flatMap((d) => SLOTS.map((s) => week[d][s])).find((m) =>
    NAMES.get(m.recipeId).lines.some((line) => line.role === "condiment"),
  );
  const recipe = NAMES.get(meal.recipeId);
  const oil = meal.items.find((item) => recipe.lines.some((l) => l.role === "condiment" && (l.food === item.id || (l.alternatives ?? []).some((a) => a.food === item.id))));
  oil.qty *= 10; // a condiment never grows above 1x
  assert.equal(planFromPartial(baseInput, { week }), null);
});
