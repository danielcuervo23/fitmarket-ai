// Owner decision 2026-11-11: when the plan has a dried legume that must soak
// overnight (only ever on Saturday or Sunday), it reminds the user the evening before.
import assert from "node:assert/strict";
import test from "node:test";
import { calcTargets } from "../nutrition.ts";
import { parseWeeklyPlanJson } from "../weeklyPlanSchema.ts";
import { assemblePlan, soakNotices } from "./build.ts";
import { DAYS, SLOTS } from "./types.ts";

const targets = calcTargets({ age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" }, ["healthy"]);
const STORES = ["Exito"];

const recipe = (id) => ({
  id,
  status: "pending_owner_ok",
  source: "ai_draft",
  name: { es: id, en: id },
  slots: ["desayuno", "almuerzo", "cena", "snacks"],
  minutes: 15,
  level: "basic",
  appliances: ["estufa"],
  batch: { ok: false, keepsDays: 1 },
  lines: [{ food: "huevo", qty: 2, role: "protein" }],
  steps: { es: ["Paso."], en: ["Step."] },
  weekendOnly: false,
});

const LIBRARY = new Map(["huevos", "frijoles", "garbanzos", "lentejas"].map((id) => [id, recipe(id)]));

const MEALS = {
  huevos: [{ id: "huevo", qty: 2 }, { id: "arroz_blanco", qty: 70 }],
  frijoles: [{ id: "frijol", qty: 70 }, { id: "arroz_blanco", qty: 60 }],
  garbanzos: [{ id: "garbanzo", qty: 70 }, { id: "papa", qty: 120 }],
  lentejas: [{ id: "lentejas", qty: 70 }, { id: "arroz_blanco", qty: 70 }],
};

/** Huevos every meal, with per-day almuerzo overrides by recipe id. */
function week(almuerzos = {}) {
  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      Object.fromEntries(
        SLOTS.map((slot) => {
          const id = slot === "almuerzo" ? (almuerzos[day] ?? "huevos") : "huevos";
          return [slot, { name: { es: id, en: id }, items: MEALS[id].map((item) => ({ ...item })), recipeId: id }];
        }),
      ),
    ]),
  );
}

const plan = (w, options = {}) => assemblePlan(w, { householdSize: 1, stores: STORES, targets, recipes: LIBRARY, ...options });

test("(d) fríjoles on Saturday: a reminder for Friday night", () => {
  assert.deepEqual(soakNotices(week({ sab: "frijoles" })), ["soak_friday_night"]);
});

test("(d) garbanzos on Sunday: a reminder for Saturday night", () => {
  assert.deepEqual(soakNotices(week({ dom: "garbanzos" })), ["soak_saturday_night"]);
});

test("(d) both weekend days: both reminders, Friday first, once each", () => {
  const w = week({ sab: "frijoles", dom: "garbanzos" });
  w.sab.cena = { ...w.sab.almuerzo, items: w.sab.almuerzo.items.map((i) => ({ ...i })) };
  assert.deepEqual(soakNotices(w), ["soak_friday_night", "soak_saturday_night"]);
});

test("(d) no soak food, no reminder; lentejas never need one", () => {
  assert.deepEqual(soakNotices(week()), []);
  assert.deepEqual(soakNotices(week({ sab: "lentejas", dom: "lentejas", mar: "lentejas" })), []);
});

test("(d) the plan carries the reminder next to the other notices and the schema accepts it", () => {
  const built = plan(week({ dom: "frijoles" }), { notices: ["see_professional"] });
  assert.deepEqual(built.notices, ["see_professional", "soak_saturday_night"]);
  assert.equal(parseWeeklyPlanJson(built).error, null);
});

test("(d) a plan without soak foods keeps its old shape (no notices field)", () => {
  assert.ok(!("notices" in plan(week({ sab: "lentejas" }))));
});

test("(d) a free-composition plan (no recipe library) never gets a reminder", () => {
  const w = week({ sab: "frijoles" });
  for (const day of DAYS) for (const slot of SLOTS) delete w[day][slot].recipeId;
  assert.ok(!("notices" in assemblePlan(w, { householdSize: 1, stores: STORES, targets })));
});
