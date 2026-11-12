// Shared fixtures for the generation pipeline tests (no OpenAI, no network).
import { readFile } from "node:fs/promises";
import { prepareLp } from "./lp.ts";
import { DAYS, SLOTS } from "./types.ts";

export const female = { age: 28, weightKg: 65, heightCm: 165, activity: "moderate", sex: "female" };

/** Goals without rules the current library cannot meet, at a generous budget: an optimal week. */
export const baseInput = {
  weeklyBudgetCop: 250_000,
  goals: ["save"],
  stores: ["Exito", "D1"],
  restrictions: [],
  householdSize: 1,
  profile: female,
};

export const respond = (content) => ({ content: JSON.stringify(content), error: null, errorCode: null });

/** A hand-picked week of recipes eligible for the default kitchen (20 min on weekdays). */
export const ROTATION = {
  desayuno: ["avena_con_banano", "huevos_pericos_con_arepa", "yogur_con_fruta", "changua", "huevos_pericos_con_arepa", "avena_con_banano", "changua"],
  almuerzo: ["pollo_salteado_con_quinua", "pasta_con_atun", "sardinas_guisadas_con_arepa", "pollo_salteado_con_quinua", "tilapia_con_arepa_y_ensalada", "lentejas_con_arroz", "sopa_de_lentejas"],
  cena: ["huevos_revueltos_con_espinaca", "quinua_con_verduras", "sopa_rapida_de_verduras_con_huevo", "pasta_con_tomate_y_espinaca", "huevos_revueltos_con_espinaca", "quinua_con_verduras", "sopa_rapida_de_verduras_con_huevo"],
  snacks: ["fruta_con_almendras", "salpicon_de_frutas", "yogur_con_fruta", "fruta_con_almendras", "palitos_de_verdura_con_guacamole", "salpicon_de_frutas", "yogur_con_fruta"],
};

export const rotationWeek = (over = {}) => ({
  days: DAYS.map((day, i) => ({ day, ...Object.fromEntries(SLOTS.map((slot) => [slot, ROTATION[slot][i]])), ...(over[day] ?? {}) })),
});

export const isDayFill = (request) => /Choose ONLY these days now/.test(request.user);

/** A model that answers with the hand-picked week. */
export const rotationModel = (onCall = () => {}) => async (request) => {
  onCall(request);
  return respond(rotationWeek());
};

/** A model that rotates through the ids the schema allows for each meal (works for any restriction). */
export const enumModel = (onCall = () => {}) => async (request) => {
  onCall(request);
  const props = request.responseFormat.json_schema.schema.properties.days.items.properties;
  return respond({
    days: DAYS.map((day, i) => ({ day, ...Object.fromEntries(SLOTS.map((slot) => [slot, props[slot].enum[i % props[slot].enum.length]])) })),
  });
};

export async function loadSolver() {
  const ok = await prepareLp({ loadWasm: () => readFile(new URL(import.meta.resolve("highs/runtime"))) });
  if (!ok) throw new Error("highs did not load");
}

export const silentLog = () => {};
