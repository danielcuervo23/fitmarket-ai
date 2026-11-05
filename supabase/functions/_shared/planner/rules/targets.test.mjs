import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERENCE_ADULT_KCAL,
  buildTargets,
  householdFactor,
  safetyFloorKcal,
  toNutritionTargets,
} from "./targets.ts";
import { calcBmr } from "../../nutrition.ts";

const man = { age: 25, weightKg: 70, heightCm: 175, activity: "moderate", sex: "male" };

test("REFERENCE_ADULT_KCAL is 2000", () => {
  assert.equal(REFERENCE_ADULT_KCAL, 2000);
});

test("maintenance: band 0.90–1.10, target = TDEE, protein 1.0–2.0 g/kg (target 1.2)", () => {
  const t = buildTargets(man, ["healthy"]);
  assert.equal(t.strategy, "maintenance");
  assert.deepEqual(t.effectiveGoals, ["healthy"]);
  assert.equal(t.kcal, t.tdee);
  assert.deepEqual(t.kcalRange, { min: Math.round(0.9 * t.tdee), max: Math.round(1.1 * t.tdee) });
  assert.deepEqual(t.proteinG, { min: 70, max: 140, target: 84 });
  assert.equal(t.proteinFloorG, null);
  assert.equal(t.carbsMinG, null);
  assert.deepEqual(t.notices, []);
});

test("bmr, tdee and weight are reported rounded", () => {
  const t = buildTargets(man, []);
  // 10*70 + 6.25*175 - 5*25 + 5 = 1673.75; * 1.55 = 2594.31
  assert.equal(t.bmr, 1674);
  assert.equal(t.tdee, 2594);
  assert.equal(t.weightKg, 70);
});

test("fat: 20 % deficit inside the 15–25 % band", () => {
  const t = buildTargets(man, ["fat"]);
  assert.equal(t.strategy, "deficit");
  assert.ok(t.kcalRange.min >= Math.round(0.75 * t.tdee) && t.kcalRange.max <= Math.round(0.85 * t.tdee));
  assert.equal(t.kcal, Math.round(0.8 * t.tdee));
  assert.deepEqual([t.proteinG.min, t.proteinG.max], [112, 154]);
  assert.equal(t.proteinG.target, 126);
});

test("fat deficit capped at 1 % of weight per week", () => {
  // BMR = 500 + 1000 - 150 - 161 = 1189; TDEE = 1189 * 1.9 = 2259
  const woman = { age: 30, weightKg: 50, heightCm: 160, activity: "very_active", sex: "female" };
  const t = buildTargets(woman, ["fat"]);
  const cap = (0.5 * 7700) / 7; // 550 kcal/day
  assert.equal(t.tdee, 2259);
  assert.ok(t.tdee - t.kcalRange.min <= cap, `range min ${t.kcalRange.min}`);
  assert.ok(t.tdee - t.kcal <= cap);
  assert.equal(t.kcalRange.min, 1709);
});

test("fat deficit cap never exceeds 1 kg per week", () => {
  const big = { age: 30, weightKg: 150, heightCm: 190, activity: "very_active", sex: "male" };
  const t = buildTargets(big, ["fat"]);
  assert.ok(t.tdee - t.kcalRange.min <= 1100 + 0.5);
  assert.ok(t.tdee - t.kcal <= 1100 + 0.5);
});

test("fat + energy caps the deficit at 15 % and adds a notice", () => {
  const t = buildTargets(man, ["fat", "energy"]);
  assert.equal(t.strategy, "deficit");
  assert.ok(t.kcal >= Math.round(0.85 * t.tdee));
  assert.ok(t.kcalRange.min >= Math.round(0.85 * t.tdee));
  assert.ok(t.kcalRange.max <= Math.round(0.935 * t.tdee));
  assert.deepEqual(t.notices, ["deficit_capped_energy"]);
});

test("muscle: surplus band, 1.4 g/kg floor and 3 g/kg carbs", () => {
  const t = buildTargets(man, ["muscle"]);
  assert.equal(t.strategy, "surplus");
  assert.equal(t.proteinFloorG, 98);
  assert.equal(t.carbsMinG, 210);
  assert.deepEqual(t.proteinG, { min: 112, max: 154, target: 126 });
  assert.equal(t.kcal, Math.round(1.1 * t.tdee));
  assert.ok(t.kcalRange.min >= Math.round(1.05 * t.tdee) && t.kcalRange.max <= Math.round(1.15 * t.tdee));
});

test("recomposition: 2.0–2.4 g/kg, -5 % to maintenance", () => {
  const t = buildTargets(man, ["fat", "muscle"]);
  assert.equal(t.strategy, "recomposition");
  assert.deepEqual(t.proteinG, { min: 140, max: 168, target: 154 });
  assert.equal(t.kcal, Math.round(0.975 * t.tdee));
  assert.ok(t.kcalRange.min >= Math.round(0.95 * t.tdee) && t.kcalRange.max <= t.tdee);
});

test("kcal safety: floor and ceiling at 1.15 TDEE", () => {
  const t = buildTargets(man, []);
  assert.deepEqual(t.kcalSafety, {
    min: Math.max(t.bmr, 1500, 800, Math.round(0.75 * t.tdee)),
    max: Math.round(1.15 * t.tdee),
  });
});

test("kcal safety ceiling is never above 4000", () => {
  const huge = { age: 20, weightKg: 140, heightCm: 200, activity: "very_active", sex: "male" };
  const t = buildTargets(huge, ["muscle"]);
  assert.equal(t.kcalSafety.max, 4000);
  assert.ok(t.kcalRange.max <= 4000);
  assert.ok(t.kcal <= 4000);
});

test("safety floor wins over the goal band", () => {
  const t = buildTargets({ age: 30, weightKg: 45, heightCm: 150, activity: "sedentary", sex: "male" }, ["fat"]);
  assert.equal(t.kcalSafety.min, 1500);
  assert.ok(t.kcalRange.min >= 1500);
  assert.ok(t.kcal >= 1500);
  assert.ok(t.kcalRange.min <= t.kcalRange.max);
});

test("safetyFloorKcal: female 1200, male 1500, unknown 1400", () => {
  const small = { age: 70, weightKg: 40, heightCm: 145, activity: "sedentary" };
  assert.equal(safetyFloorKcal({ ...small, sex: "female" }, calcBmr({ ...small, sex: "female" })), 1200);
  assert.equal(safetyFloorKcal({ ...small, sex: "male" }, calcBmr({ ...small, sex: "male" })), 1500);
  assert.equal(safetyFloorKcal({ ...small, sex: null }, calcBmr({ ...small, sex: null })), 1400);
  assert.equal(safetyFloorKcal(small, calcBmr(small)), 1400);
});

test("safetyFloorKcal uses BMR when it is higher", () => {
  assert.equal(safetyFloorKcal(man, calcBmr(man)), Math.round(calcBmr(man)));
});

test("unknown sex floor is 1400 and never below 800", () => {
  const t = buildTargets({ age: 60, weightKg: 40, heightCm: 150, activity: "sedentary", sex: null }, ["fat"]);
  assert.equal(t.kcalSafety.min, 1400);
  assert.ok(t.kcalSafety.min >= 800);
  assert.ok(t.kcal >= 1400);
});

test("minors and seniors lose fat; seniors see a professional", () => {
  const minor = buildTargets({ ...man, age: 16 }, ["fat", "healthy"]);
  assert.deepEqual(minor.effectiveGoals, ["healthy"]);
  assert.deepEqual(minor.notices, ["fat_blocked_minor"]);
  assert.equal(minor.strategy, "maintenance");
  assert.deepEqual(buildTargets({ ...man, age: 66 }, ["fat"]).notices, ["fat_blocked_senior", "see_professional"]);
});

test("ages 18 and 65 keep the fat goal", () => {
  assert.deepEqual(buildTargets({ ...man, age: 18 }, ["fat"]).effectiveGoals, ["fat"]);
  assert.deepEqual(buildTargets({ ...man, age: 65 }, ["fat"]).effectiveGoals, ["fat"]);
});

test("blocking notices only appear when a requested goal was removed", () => {
  assert.deepEqual(buildTargets({ ...man, age: 16 }, ["healthy"]).notices, []);
});

test("blocked fat turns recomposition into muscle", () => {
  const t = buildTargets({ ...man, age: 16 }, ["fat", "muscle"]);
  assert.deepEqual(t.effectiveGoals, ["muscle"]);
  assert.equal(t.strategy, "surplus");
});

test("BMI < 18.5 blocks fat; BMI >= 35 recommends a professional", () => {
  const thin = buildTargets({ ...man, weightKg: 56, heightCm: 175 }, ["fat"]); // BMI 18.29
  assert.deepEqual(thin.effectiveGoals, []);
  assert.deepEqual(thin.notices, ["fat_blocked_low_bmi"]);
  const heavy = buildTargets({ ...man, weightKg: 110, heightCm: 175 }, ["fat"]); // BMI 35.9
  assert.deepEqual(heavy.effectiveGoals, ["fat"]);
  assert.deepEqual(heavy.notices, ["see_professional"]);
});

test("health conditions give maintenance; kidney caps protein at 1.2 g/kg", () => {
  const t = buildTargets(man, ["muscle"], ["kidney_disease"]);
  assert.equal(t.strategy, "maintenance");
  assert.equal(t.proteinSafetyMaxG, 84);
  assert.equal(t.proteinG.max, 84);
  assert.deepEqual(t.proteinG, { min: 56, max: 84, target: 70 });
  assert.equal(t.proteinFloorG, null);
  assert.equal(t.carbsMinG, null);
  assert.deepEqual(t.effectiveGoals, []);
  assert.deepEqual(t.notices, ["goals_blocked_health", "see_professional"]);
});

test("any listed health condition removes fat and muscle", () => {
  for (const condition of ["diabetes", "pregnancy_lactation", "eating_disorder"]) {
    const t = buildTargets(man, ["fat", "muscle", "healthy"], [condition]);
    assert.deepEqual(t.effectiveGoals, ["healthy"], condition);
    assert.equal(t.strategy, "maintenance");
    assert.deepEqual(t.proteinG, { min: 70, max: 140, target: 84 });
    assert.deepEqual(t.notices, ["goals_blocked_health", "see_professional"]);
  }
});

test("health condition without body goals still recommends a professional", () => {
  assert.deepEqual(buildTargets(man, ["healthy"], ["diabetes"]).notices, ["see_professional"]);
});

test("unknown health values are ignored and health defaults to none", () => {
  assert.deepEqual(buildTargets(man, ["fat"], ["flu"]).effectiveGoals, ["fat"]);
  assert.deepEqual(buildTargets(man, ["fat"]).notices, []);
});

test("see_professional appears once when several reasons apply", () => {
  const t = buildTargets({ ...man, age: 70, weightKg: 110 }, ["fat", "muscle"], ["diabetes"]);
  assert.deepEqual(t.notices, ["fat_blocked_senior", "see_professional", "goals_blocked_health"]);
});

test("protein max never above 2.5 g/kg", () => {
  for (const goals of [[], ["fat"], ["muscle"], ["fat", "muscle"], ["energy"]]) {
    const t = buildTargets(man, goals);
    assert.equal(t.proteinSafetyMaxG, 175);
    assert.ok(t.proteinG.max <= t.proteinSafetyMaxG);
  }
});

test("duplicate goals are collapsed", () => {
  assert.deepEqual(buildTargets(man, ["fat", "fat"]).effectiveGoals, ["fat"]);
});

test("invalid body values are rejected", () => {
  assert.throws(() => buildTargets({ ...man, weightKg: 0 }, []), RangeError);
  assert.throws(() => buildTargets({ ...man, heightCm: Number.NaN }, []), RangeError);
  assert.throws(() => buildTargets({ ...man, age: -1 }, []), RangeError);
});

test("toNutritionTargets: fat 27 % of kcal, carbs the rest", () => {
  const t = buildTargets(man, ["fat"]);
  const n = toNutritionTargets(t);
  assert.equal(n.kcal, t.kcal);
  assert.equal(n.bmr, t.bmr);
  assert.equal(n.tdee, t.tdee);
  assert.equal(n.strategy, "deficit");
  assert.equal(n.proteinG, t.proteinG.target);
  assert.equal(n.fatG, Math.round((t.kcal * 0.27) / 9));
  assert.equal(n.carbsG, Math.round((t.kcal - n.proteinG * 4 - n.fatG * 9) / 4));
});

test("householdFactor: 1 for one person; others at 2000 kcal", () => {
  assert.equal(householdFactor(1, 2500), 1);
  assert.equal(householdFactor(3, 2000), 3);
  assert.equal(householdFactor(2, 2500), 1.8);
});

test("householdFactor rejects invalid input", () => {
  assert.throws(() => householdFactor(0, 2000), RangeError);
  assert.throws(() => householdFactor(1.5, 2000), RangeError);
  assert.throws(() => householdFactor(2, 0), RangeError);
});
