// Copy guard for compliance lines: a rule with a maximum (two-sided or max
// only) can be overshot, so "Llegas al 120 % de tus calorías" reads wrong.
// Those rules use direction-neutral wording ("están al", "is at"); only
// minimum-only rules may say "llegas al" / "you reach".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../i18n/messages/app.ts", import.meta.url), "utf8");
const enStart = source.indexOf("\n  en: {");

/** `compliance.<rule>.percent` text in one language ("es" or "en"). */
function percentCopy(rule, lang) {
  const block = lang === "es" ? source.slice(0, enStart) : source.slice(enStart);
  const match = block.match(new RegExp(`"compliance\\.${rule}\\.percent": "([^"]*)"`));
  assert.ok(match, `${lang} compliance.${rule}.percent`);
  return match[1];
}

/** Rules with a `max` in planner/rules/ruleSet.ts, plus the budget cap. */
const WITH_MAXIMUM = [
  "kcal_safety",
  "kcal_range",
  "meal_protein_muscle",
  "protein_safety_max",
  "protein_max",
  "free_sugar_max",
  "sodium_max",
  "fat_max",
  "sat_fat_max",
  "meal_kcal_share_max",
  "budget",
];

test("rules with a maximum never say 'llegas al' / 'you reach'", () => {
  for (const rule of WITH_MAXIMUM) {
    assert.doesNotMatch(percentCopy(rule, "es"), /\bllegas? al\b/i, rule);
    assert.doesNotMatch(percentCopy(rule, "en"), /\breach(es)?\b/i, rule);
    assert.match(percentCopy(rule, "es"), /\{percent\} %/, rule);
    assert.match(percentCopy(rule, "en"), /\{percent\} %/, rule);
  }
});

test("calories use the neutral 'están al ... de lo que necesitas' wording", () => {
  assert.equal(percentCopy("kcal_range", "es"), "Tus calorías están al {percent} % de lo que necesitas");
  assert.equal(percentCopy("kcal_range", "en"), "Your calories are at {percent} % of what you need");
});
