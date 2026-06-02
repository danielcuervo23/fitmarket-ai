import assert from "node:assert/strict";
import {
  buildMultiGoalGuidance,
  validateGoalCoherence,
} from "./goalRules.ts";

const baseMenu = {
  lun: {
    desayuno: ["80 g de avena", "1 banano"],
    almuerzo: ["150 g de pechuga de pollo", "120 g de arroz"],
    cena: ["100 g de lentejas", "80 g de ensalada"],
    snacks: ["1 manzana"],
  },
  mar: {
    desayuno: ["2 huevos", "1 rebanada pan"],
    almuerzo: ["150 g de pollo", "100 g de frijoles"],
    cena: ["120 g de pescado", "80 g de verduras"],
    snacks: ["20 g de nueces"],
  },
  mie: {
    desayuno: ["80 g de avena", "200 ml leche"],
    almuerzo: ["150 g pechuga pollo", "120 g arroz"],
    cena: ["100 g lentejas", "1 tomate"],
    snacks: ["1 yogur"],
  },
  jue: {
    desayuno: ["2 huevos", "1 banano"],
    almuerzo: ["150 g pollo", "120 g arroz"],
    cena: ["120 g pescado", "ensalada"],
    snacks: ["1 manzana"],
  },
  vie: {
    desayuno: ["80 g avena", "leche"],
    almuerzo: ["pollo", "arroz"],
    cena: ["lentejas", "verduras"],
    snacks: ["yogur"],
  },
  sab: {
    desayuno: ["huevos", "pan"],
    almuerzo: ["pollo", "frijoles"],
    cena: ["pescado", "verduras"],
    snacks: ["nueces"],
  },
  dom: {
    desayuno: ["avena", "banano"],
    almuerzo: ["pollo", "arroz"],
    cena: ["lentejas", "ensalada"],
    snacks: ["manzana"],
  },
};

const musclePlan = {
  summary: { estimated_total_cop: 140000, estimated_daily_kcal: 2400 },
  weekly_menu: baseMenu,
  shopping_list: [
    {
      name: "Pechuga de pollo",
      quantity: "1.5 kg",
      estimated_price_cop: 45000,
      category: "proteinas",
      store_id: "D1",
    },
    {
      name: "Huevos",
      quantity: "30 un",
      estimated_price_cop: 18000,
      category: "proteinas",
      store_id: "D1",
    },
    {
      name: "Arroz",
      quantity: "2 kg",
      estimated_price_cop: 12000,
      category: "granos",
      store_id: "D1",
    },
  ],
};

const noProteinPlan = {
  ...musclePlan,
  shopping_list: [
    {
      name: "Galletas",
      quantity: "1 paq",
      estimated_price_cop: 8000,
      category: "otros",
      store_id: "D1",
    },
    {
      name: "Refresco",
      quantity: "2 L",
      estimated_price_cop: 6000,
      category: "bebidas",
      store_id: "D1",
    },
  ],
  weekly_menu: {
    ...baseMenu,
    lun: {
      desayuno: ["80 g galletas", "1 jugo"],
      almuerzo: ["100 g pasta", "salsa"],
      cena: ["pan", "mermelada"],
      snacks: ["dulce"],
    },
  },
};

const fatHighKcalPlan = {
  ...musclePlan,
  summary: { estimated_total_cop: 140000, estimated_daily_kcal: 3500 },
};

const guidance = buildMultiGoalGuidance(["save", "muscle"]);

assert.ok(guidance.goal_guidance.includes("muscle"));
assert.ok(guidance.multi_goal_strategy.includes("save > muscle"));
assert.ok(guidance.multi_goal_strategy.includes("save + muscle"));

assert.equal(validateGoalCoherence(musclePlan, ["muscle"], 150000), null);
assert.ok(
  validateGoalCoherence(noProteinPlan, ["muscle"], 150000)?.includes("proteína"),
);
assert.ok(
  validateGoalCoherence(fatHighKcalPlan, ["fat"], 150000)?.includes("calorías"),
);

console.log("goalCoherence.validation.test.mjs: OK");
