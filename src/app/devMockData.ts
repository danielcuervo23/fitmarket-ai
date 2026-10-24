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
