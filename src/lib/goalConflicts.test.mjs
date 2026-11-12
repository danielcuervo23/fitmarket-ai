// "No se puede cumplir" (Plan 2, Task 15): reading the server's
// goals_unreachable answer and turning each conflict into a plain-words line.
import assert from "node:assert/strict";
import test from "node:test";
import { buildTargets } from "../../supabase/functions/_shared/planner/rules/targets.ts";
import { buildRuleSet } from "../../supabase/functions/_shared/planner/rules/ruleSet.ts";
import { errors } from "../i18n/messages/errors.ts";
import {
  CONFLICT_UNITS,
  MAX_CONFLICTS,
  describeConflict,
  readGoalsUnreachable,
} from "./ai/goalConflicts.ts";
import { RULE_CODES } from "./planRecipes.ts";

const protein = { rule: "protein_min", level: 2, unit: "g_per_kg", target: 1.6, achieved: 1.32 };
const fiber = { rule: "fiber_min", level: 3, unit: "g", target: 25, achieved: 18.4 };
const budget = { currentBudget: 150000, requiredBudget: 172000, recommendedIncrease: 22000 };

const answer = (extra = {}) => ({
  error: "Así como está, tu plan no cumple todas tus metas.",
  code: "goals_unreachable",
  conflicts: [protein, fiber],
  canForce: true,
  budgetOption: budget,
  ...extra,
});

test("reads conflicts and budget option", () => {
  assert.deepEqual(readGoalsUnreachable(answer()), {
    kind: "goals_unreachable",
    conflicts: [protein, fiber],
    budgetOption: budget,
    canForce: true,
  });
});

test("only the goals_unreachable code is read", () => {
  assert.equal(readGoalsUnreachable(answer({ code: "budget_too_low" })), null);
  assert.equal(readGoalsUnreachable(null), null);
  assert.equal(readGoalsUnreachable("goals_unreachable"), null);
  assert.equal(readGoalsUnreachable([answer()]), null);
});

test("malformed conflicts are dropped; more than 8 are cut", () => {
  const bad = [
    null,
    "protein_min",
    { ...protein, target: "1.6" },
    { ...protein, achieved: Number.NaN },
    { ...protein, level: 9 },
    { ...protein, level: 1.5 },
    { ...protein, rule: "<img src=x onerror=alert(1)>" },
    { ...protein, rule: "x".repeat(80) },
    { ...protein, unit: 7 },
  ];
  assert.deepEqual(readGoalsUnreachable(answer({ conflicts: [...bad, fiber] })).conflicts, [fiber]);

  const many = Array.from({ length: 12 }, (_, i) => ({ ...fiber, achieved: i }));
  const read = readGoalsUnreachable(answer({ conflicts: many })).conflicts;
  assert.equal(MAX_CONFLICTS, 8);
  assert.equal(read.length, 8);
  assert.deepEqual(read[7], { ...fiber, achieved: 7 });
});

test("conflicts that are not a list give an empty list (the panel shows a generic line)", () => {
  assert.deepEqual(readGoalsUnreachable(answer({ conflicts: "nope" })).conflicts, []);
});

test("only the contract fields are kept from each conflict", () => {
  const read = readGoalsUnreachable(answer({ conflicts: [{ ...fiber, html: "<b>x</b>", unmeasurable: true }] }));
  assert.deepEqual(read.conflicts, [{ ...fiber, unmeasurable: true }]);
});

test("a missing or malformed budget option is null", () => {
  assert.equal(readGoalsUnreachable(answer({ budgetOption: undefined })).budgetOption, null);
  assert.equal(readGoalsUnreachable(answer({ budgetOption: { ...budget, requiredBudget: "x" } })).budgetOption, null);
  assert.equal(readGoalsUnreachable(answer({ budgetOption: { ...budget, recommendedIncrease: -5 } })).budgetOption, null);
});

test("canForce is true only when the server says exactly true", () => {
  assert.equal(readGoalsUnreachable(answer({ canForce: "true" })).canForce, false);
  assert.equal(readGoalsUnreachable(answer({ canForce: undefined })).canForce, false);
});

test("protein gap is target - achieved rounded to 1 decimal (the panel formats it per language)", () => {
  assert.equal(describeConflict(protein).params.gap, 0.3);
  assert.deepEqual(describeConflict(protein), {
    key: "gen.conflict.protein_min",
    params: { gap: 0.3, achieved: 1.3, target: 1.6 },
  });
});

test("grams, milligrams, calories and counts are whole numbers", () => {
  assert.deepEqual(describeConflict(fiber).params, { achieved: 18, target: 25 });
  assert.deepEqual(
    describeConflict({ rule: "sodium_max", level: 3, unit: "mg", target: 2000, achieved: 2412.6 }).params,
    { achieved: 2413, target: 2000 },
  );
});

test("unknown rule gives null", () => {
  assert.equal(describeConflict({ ...fiber, rule: "brand_new_rule" }), null);
});

test("a rule with an unexpected unit, or that could not be measured, gives null", () => {
  assert.equal(describeConflict({ ...fiber, unit: "mg" }), null);
  assert.equal(describeConflict({ ...fiber, unmeasurable: true }), null);
});

test("two-sided rules say 'te pasas' wording when achieved is above the bound", () => {
  const under = { rule: "kcal_range", level: 2, unit: "kcal", target: 2200, achieved: 1890.4 };
  assert.deepEqual(describeConflict(under), {
    key: "gen.conflict.kcal_range",
    params: { achieved: 1890, target: 2200 },
  });
  assert.equal(describeConflict({ ...under, achieved: 2600 }).key, "gen.conflict.kcal_range.over");
  assert.equal(
    describeConflict({ rule: "meal_protein_muscle", level: 2, unit: "g", target: 40, achieved: 52 }).key,
    "gen.conflict.meal_protein_muscle.over",
  );
});

test("the budget is never a conflict line (it is the budget option)", () => {
  assert.equal(describeConflict({ rule: "budget", level: 1, unit: "cop", target: 1, achieved: 2 }), null);
});

/** Every linear and structural rule the server can build: unit and which bounds it has. */
function serverRules() {
  const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };
  const rules = new Map();
  for (const goals of [[], ["healthy", "energy", "save"], ["muscle"], ["fat"], ["fat", "muscle"]]) {
    const set = buildRuleSet(buildTargets(man, goals));
    for (const rule of set.linear) {
      rules.set(rule.code, { unit: rule.display.unit, hasMin: rule.min !== undefined, hasMax: rule.max !== undefined });
    }
    for (const rule of set.structural) rules.set(rule.code, { unit: "count", hasMin: true, hasMax: false });
  }
  return rules;
}

test("every server rule has a conflict line with the server's unit", () => {
  const rules = serverRules();
  assert.ok(rules.size >= 20);
  for (const [rule, { unit }] of rules) {
    assert.equal(CONFLICT_UNITS[rule], unit, rule);
  }
  for (const rule of RULE_CODES.filter((code) => code !== "budget")) {
    assert.ok(CONFLICT_UNITS[rule], rule);
  }
});

test("below a minimum the line says 'llegas'; above a maximum it never does", () => {
  for (const [rule, { unit, hasMin, hasMax }] of serverRules()) {
    if (hasMax) {
      const over = describeConflict({ rule, level: 2, unit, target: 100, achieved: 5000 });
      assert.doesNotMatch(errors.es[over.key], /\bllegas?\b/i, over.key);
      assert.doesNotMatch(errors.en[over.key], /\breach(es)?\b/i, over.key);
    }
    if (hasMin) {
      const under = describeConflict({ rule, level: 2, unit, target: 100, achieved: 0.5 });
      assert.match(errors.es[under.key], /\bllegas?\b/i, under.key);
      assert.match(errors.en[under.key], /\breach(es)?\b/i, under.key);
    }
  }
});

test("every key describeConflict can give exists in Spanish and English", () => {
  for (const [rule, unit] of Object.entries(CONFLICT_UNITS)) {
    for (const achieved of [0.5, 5000]) {
      const line = describeConflict({ rule, level: 2, unit, target: 100, achieved });
      assert.ok(line, rule);
      for (const lang of ["es", "en"]) {
        const text = errors[lang][line.key];
        assert.ok(text, `${lang} ${line.key}`);
        for (const name of text.match(/\{(\w+)\}/g) ?? []) {
          assert.ok(name.slice(1, -1) in line.params, `${lang} ${line.key} ${name}`);
        }
      }
    }
  }
});

test("panel copy matches the plan, Spanish first", () => {
  assert.equal(errors.es["gen.unreachable.title"], "Así como está, tu plan no cumple todas tus metas");
  assert.equal(errors.en["gen.unreachable.title"], "As it stands, your plan can't meet all your goals");
  assert.equal(errors.es["gen.unreachable.intro"], "Para lograrlo, puedes cambiar una de estas cosas:");
  assert.equal(errors.es["gen.unreachable.budget"], "Subir tu presupuesto en {amount}");
  assert.equal(errors.es["gen.unreachable.force"], "Quiero el plan igual");
  assert.equal(errors.en["gen.unreachable.force"], "Give me the plan anyway");
  assert.equal(
    errors.es["gen.unreachable.forceHelp"],
    "Te damos el mejor plan posible sin pasarte de tu presupuesto ni romper tus restricciones, y te decimos qué no se cumple.",
  );
  assert.equal(errors.es["gen.conflict.generic"], "Una de tus metas no se alcanza del todo");
  assert.equal(errors.es["gen.conflict.fiber_min"], "Fibra: llegas a {achieved} de {target} g al día");
  assert.equal(
    errors.es["gen.conflict.protein_min"],
    "Bajar tu meta de proteína {gap} g por kilo (hoy llegas a {achieved} de {target})",
  );
});
