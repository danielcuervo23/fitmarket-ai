import type { DayId, DayMenu, WeeklyPlan } from "@/lib/ai/types";
import { DAY_IDS } from "@/lib/ai/types";
import type { DashboardData } from "@/lib/dashboard";

/** Sample data for the development-only screen gallery (DevPreview.tsx). */

const DAY: DayMenu = {
  desayuno: ["80 g de avena en hojuelas", "1 banano mediano", "250 ml de leche"],
  almuerzo: [
    "150 g de pechuga de pollo",
    "120 g de arroz cocido",
    "80 g de ensalada mixta",
  ],
  cena: ["2 huevos", "1 arepa", "50 g de queso campesino"],
  snacks: ["1 manzana", "20 g de nueces"],
};

const DISH_NAMES = {
  desayuno: { es: "Avena con banano y leche", en: "Oatmeal with banana and milk" },
  almuerzo: { es: "Pollo con arroz y ensalada", en: "Chicken with rice and salad" },
  cena: { es: "Huevos con arepa y queso", en: "Eggs with arepa and cheese" },
  snacks: { es: "Manzana con nueces", en: "Apple with walnuts" },
};

export const MOCK_PLAN: WeeklyPlan = {
  dish_names: Object.fromEntries(
    DAY_IDS.map((day: DayId) => [day, DISH_NAMES]),
  ) as WeeklyPlan["dish_names"],
  summary: { estimated_total_cop: 138_500, estimated_daily_kcal: 2150 },
  weekly_menu: Object.fromEntries(
    DAY_IDS.map((day: DayId) => [day, DAY]),
  ) as WeeklyPlan["weekly_menu"],
  shopping_list: [
    { name: "Pechuga de pollo", quantity: "1.5 kg", estimated_price_cop: 36_000, category: "proteinas", store_id: "D1" },
    { name: "Huevos", quantity: "30 unidades", estimated_price_cop: 17_500, category: "proteinas", store_id: "D1" },
    { name: "Arroz blanco", quantity: "2 kg", estimated_price_cop: 9_800, category: "granos", store_id: "D1" },
    { name: "Avena en hojuelas", quantity: "500 g", estimated_price_cop: 6_200, category: "granos", store_id: "Ara" },
    { name: "Leche entera", quantity: "3 L", estimated_price_cop: 12_900, category: "lacteos", store_id: "Ara" },
    { name: "Banano", quantity: "12 unidades", estimated_price_cop: 7_400, category: "frutas_verduras", store_id: "Ara" },
    { name: "Manzana", quantity: "8 unidades", estimated_price_cop: 14_700, category: "frutas_verduras", store_id: "Ara" },
    { name: "Queso campesino", quantity: "400 g", estimated_price_cop: 34_000, category: "lacteos", store_id: "D1" },
  ],
};

const RECIPE_IDS = {
  desayuno: "avena_banano_leche",
  almuerzo: "pollo_arroz_ensalada",
  cena: "huevos_arepa_queso",
  snacks: "manzana_nueces",
};

/** A Plan 2 plan: recipe details, notices and a partial-plan warning. */
export const MOCK_RECIPE_PLAN: WeeklyPlan = {
  ...MOCK_PLAN,
  meal_recipes: Object.fromEntries(
    DAY_IDS.map((day: DayId) => [day, RECIPE_IDS]),
  ) as WeeklyPlan["meal_recipes"],
  recipes: {
    avena_banano_leche: {
      name: DISH_NAMES.desayuno,
      minutes: 10,
      level: "basic",
      appliances: ["estufa", "microondas"],
      batch: false,
      steps: {
        es: ["Calienta la leche.", "Agrega la avena y revuelve 3 minutos.", "Sirve con el banano en rodajas."],
        en: ["Heat the milk.", "Add the oats and stir for 3 minutes.", "Serve with the sliced banana."],
      },
    },
    pollo_arroz_ensalada: {
      name: DISH_NAMES.almuerzo,
      minutes: 35,
      level: "comfortable",
      appliances: ["estufa", "olla_arrocera", "freidora_aire"],
      batch: true,
      steps: {
        es: ["Pon el arroz en la olla arrocera.", "Sazona el pollo con sal.", "Cocina el pollo 15 minutos.", "Mezcla la ensalada."],
        en: ["Put the rice in the rice cooker.", "Season the chicken with salt.", "Cook the chicken for 15 minutes.", "Mix the salad."],
      },
    },
    huevos_arepa_queso: {
      name: DISH_NAMES.cena,
      minutes: 15,
      level: "enjoys",
      appliances: ["estufa", "sandwichera"],
      batch: false,
      steps: {
        es: ["Calienta la arepa.", "Revuelve los huevos en la sartén.", "Sirve con el queso."],
        en: ["Warm the arepa.", "Scramble the eggs in the pan.", "Serve with the cheese."],
      },
    },
    manzana_nueces: {
      name: DISH_NAMES.snacks,
      minutes: 2,
      level: "basic",
      appliances: [],
      batch: false,
      steps: { es: ["Lava la manzana.", "Sírvela con las nueces."], en: ["Wash the apple.", "Serve it with the walnuts."] },
    },
  },
  notices: ["deficit_capped_energy", "see_professional", "code_from_a_newer_server"],
  compliance: {
    status: "partial",
    unmet: [
      { rule: "protein_min", target: 2, achieved: 1.7, unit: "g_per_kg" },
      { rule: "legumes_week", target: 3, achieved: 2, unit: "count" },
      { rule: "sodium_max", target: 2000, achieved: 1500, unit: "mg", unmeasurable: true },
    ],
  },
};

export const MOCK_DASHBOARD: DashboardData = {
  displayName: "Juan Daniel Cuervo",
  weeklyBudgetCop: 150_000,
  goals: [{ id: "healthy" }, { id: "save" }],
  supermarkets: [
    { id: "D1", name: "D1" },
    { id: "Ara", name: "Ara" },
  ],
  dietaryRestrictions: ["lactose"],
};
