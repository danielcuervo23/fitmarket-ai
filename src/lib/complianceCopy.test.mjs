// Copy guard for compliance lines: a rule with a maximum (two-sided or max
// only) can be overshot, so "Llegas al 120 % de tus calorías" reads wrong.
// Those rules use direction-neutral wording ("están al", "is at"); only
// minimum-only rules may say "llegas al" / "you reach".
//
// The rule list comes from the server's own rule set and the copy from the
// real message dictionaries, so neither can drift from this test.
import assert from "node:assert/strict";
import test from "node:test";
import { buildTargets } from "../../supabase/functions/_shared/planner/rules/targets.ts";
import { buildRuleSet } from "../../supabase/functions/_shared/planner/rules/ruleSet.ts";
import { app } from "../i18n/messages/app.ts";
import { RULE_CODES } from "./planRecipes.ts";

/** `compliance.<rule>.percent` text in one language ("es" or "en"). */
function percentCopy(rule, lang) {
  const text = app[lang][`compliance.${rule}.percent`];
  assert.equal(typeof text, "string", `${lang} compliance.${rule}.percent`);
  return text;
}

/**
 * Rules the server can build, by bound. Structural rules (counts) are
 * minimum-only but use their own "Tienes {achieved} de {target}" wording.
 */
function serverRules() {
  const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };
  const withMaximum = new Set();
  const minOnly = new Set();
  const structural = new Set();
  for (const goals of [[], ["healthy", "energy", "save"], ["muscle"], ["fat"], ["fat", "muscle"]]) {
    const set = buildRuleSet(buildTargets(man, goals));
    for (const rule of set.linear) {
      (rule.max !== undefined ? withMaximum : minOnly).add(rule.code);
    }
    for (const rule of set.structural) structural.add(rule.code);
  }
  // The budget is a cap the optimizer owns, not a linear rule in the set.
  withMaximum.add("budget");
  return { withMaximum, minOnly, structural };
}

const rules = serverRules();

test("the server rule set is actually read (guards against an empty loop)", () => {
  assert.ok(rules.withMaximum.size >= 10, [...rules.withMaximum].join());
  assert.ok(rules.minOnly.size >= 6, [...rules.minOnly].join());
  assert.ok(rules.structural.size >= 4, [...rules.structural].join());
});

test("rules with a maximum never say 'llegas al' / 'you reach'", () => {
  for (const rule of rules.withMaximum) {
    assert.doesNotMatch(percentCopy(rule, "es"), /\bllegas? al\b/i, rule);
    assert.doesNotMatch(percentCopy(rule, "en"), /\breach(es)?\b/i, rule);
    assert.match(percentCopy(rule, "es"), /\{percent\} %/, rule);
    assert.match(percentCopy(rule, "en"), /\{percent\} %/, rule);
  }
});

test("minimum-only rules keep 'Llegas al' / 'you reach'", () => {
  for (const rule of rules.minOnly) {
    assert.match(percentCopy(rule, "es"), /\bllegas? al \{percent\} %/i, rule);
    assert.match(percentCopy(rule, "en"), /\breach(es)? \{percent\} %/i, rule);
  }
});

test("every rule code has percent copy in both languages", () => {
  const codes = new Set([...RULE_CODES, ...rules.withMaximum, ...rules.minOnly, ...rules.structural]);
  for (const rule of codes) {
    percentCopy(rule, "es");
    percentCopy(rule, "en");
  }
});

test("calories use the neutral 'están al ... de lo que necesitas' wording", () => {
  assert.equal(percentCopy("kcal_range", "es"), "Tus calorías están al {percent} % de lo que necesitas");
  assert.equal(percentCopy("kcal_range", "en"), "Your calories are at {percent} % of what you need");
});

test("safe calories read right in both directions (no 'mínimo' on overshoot)", () => {
  assert.equal(percentCopy("kcal_safety", "es"), "Tus calorías están al {percent} % de lo seguro para ti");
  assert.equal(percentCopy("kcal_safety", "en"), "Your calories are at {percent} % of what is safe for you");
});
