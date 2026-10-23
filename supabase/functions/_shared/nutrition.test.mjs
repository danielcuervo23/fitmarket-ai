import assert from "node:assert/strict";
import { calcBmr, calcTargets } from "./nutrition.ts";

const woman = { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" };

// Mifflin-St Jeor: 10*65 + 6.25*165 - 5*28 - 161 = 1380.25
assert.equal(Math.round(calcBmr(woman)), 1380);
assert.equal(Math.round(calcBmr({ ...woman, sex: "male" })), 1546);
// Unknown sex uses the midpoint (-78): 1463.25
assert.equal(Math.round(calcBmr({ ...woman, sex: null })), 1463);

// Maintenance: TDEE = BMR * 1.55
const maintain = calcTargets(woman, ["healthy"]);
assert.equal(maintain.strategy, "maintenance");
assert.equal(maintain.tdee, Math.round(1380.25 * 1.55));
assert.equal(maintain.kcal, maintain.tdee);
assert.equal(maintain.proteinG, Math.round(65 * 1.2));

// Fat loss is a deficit, muscle gain a surplus, both together a recomposition.
const fat = calcTargets(woman, ["fat"]);
const muscle = calcTargets(woman, ["muscle"]);
const both = calcTargets(woman, ["fat", "muscle"]);
assert.equal(fat.strategy, "deficit");
assert.ok(fat.kcal < maintain.kcal);
assert.equal(muscle.strategy, "surplus");
assert.ok(muscle.kcal > maintain.kcal);
assert.equal(both.strategy, "recomposition");
assert.ok(both.proteinG > maintain.proteinG);

// Safety floor: never below the basal rate or 1,400 kcal.
const tiny = calcTargets(
  { age: 70, weightKg: 45, heightCm: 150, activity: "sedentary", sex: "female" },
  ["fat"],
);
assert.ok(tiny.kcal >= 1400);
assert.ok(tiny.kcal >= tiny.bmr);

// Macros add up to the calorie target (within rounding).
const total = maintain.proteinG * 4 + maintain.carbsG * 4 + maintain.fatG * 9;
assert.ok(Math.abs(total - maintain.kcal) <= 12, "macros must match kcal");

console.log("nutrition: all checks passed");
