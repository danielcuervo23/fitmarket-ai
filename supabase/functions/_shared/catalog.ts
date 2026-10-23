/**
 * Ingredient catalog: the single source of truth for what the planner may use.
 *
 * Why a catalog: the AI used to invent prices, calories and quantities. Now it
 * only chooses ingredient ids and grams; prices, nutrition and allergens come
 * from this table, so totals are computed (not guessed) and restrictions are
 * checked exactly, in any language.
 *
 * Conventions
 * - Quantities are as purchased: DRY / RAW weights (rice, lentils, meat...).
 * - `per100` is per 100 g (or per 100 ml for liquids).
 * - `price` is COP per ONE g / ml / unit, REGULAR price (never promotions).
 * - `priceSource: "sample"` means it was read from a store page on 2026-10-23
 *   (see data/price-samples); "estimate" means it is a rough placeholder to be
 *   refined with real prices. Prices are national references, not per store.
 */

export type FoodUnit = "g" | "ml" | "unit";

export type ShoppingCategory =
  | "proteinas"
  | "frutas_verduras"
  | "lacteos"
  | "granos"
  | "bebidas"
  | "condimentos"
  | "otros";

/**
 * Why an ingredient can be excluded:
 * - lactose: contains lactose (milk, yogurt, cheese). Lactose-free milk does
 *   not have it, so it carries only `dairy`.
 * - dairy: any milk product (excluded by vegan).
 * - meat: any land-animal flesh, pork included (excluded by vegetarian).
 */
export type DietTag =
  | "lactose"
  | "dairy"
  | "egg"
  | "gluten"
  | "peanut"
  | "tree_nut"
  | "fish"
  | "shellfish"
  | "pork"
  | "meat"
  | "honey";

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Ingredient {
  id: string;
  name: { es: string; en: string };
  /** Plural names, only for foods counted in units (eggs, fruit). */
  plural?: { es: string; en: string };
  category: ShoppingCategory;
  unit: FoodUnit;
  /** Grams in one unit (required when unit is "unit"; used for nutrition). */
  gramsPerUnit?: number;
  per100: Nutrition;
  tags: DietTag[];
  /** Smallest realistic purchase, in `unit` (a 500 g bag, a 12-egg carton). */
  pack: number;
  /** COP per one g / ml / unit, regular price. */
  price: number;
  priceSource: "sample" | "estimate";
}

type Seed = Omit<Ingredient, "priceSource"> & {
  priceSource?: Ingredient["priceSource"];
};

const n = (kcal: number, protein: number, carbs: number, fat: number): Nutrition => ({
  kcal,
  protein,
  carbs,
  fat,
});

const seeds: Seed[] = [
  // ---- Proteins
  { id: "pechuga_pollo", name: { es: "Pechuga de pollo", en: "Chicken breast" }, category: "proteinas", unit: "g", per100: n(120, 22.5, 0, 2.6), tags: ["meat"], pack: 500, price: 22 },
  { id: "pernil_pollo", name: { es: "Pierna pernil de pollo", en: "Chicken drumstick and thigh" }, category: "proteinas", unit: "g", per100: n(121, 19.7, 0, 4.1), tags: ["meat"], pack: 500, price: 9.9, priceSource: "sample" },
  { id: "carne_molida_res", name: { es: "Carne molida de res", en: "Ground beef" }, category: "proteinas", unit: "g", per100: n(176, 20, 0, 10), tags: ["meat"], pack: 450, price: 38, priceSource: "sample" },
  { id: "res_sobrebarriga", name: { es: "Sobrebarriga de res", en: "Beef flank" }, category: "proteinas", unit: "g", per100: n(150, 21, 0, 7), tags: ["meat"], pack: 500, price: 25 },
  { id: "lomo_cerdo", name: { es: "Lomo de cerdo", en: "Pork loin" }, category: "proteinas", unit: "g", per100: n(143, 21, 0, 6), tags: ["meat", "pork"], pack: 500, price: 14.6, priceSource: "sample" },
  { id: "huevo", plural: { es: "huevos", en: "eggs" }, name: { es: "Huevo", en: "Egg" }, category: "proteinas", unit: "unit", gramsPerUnit: 50, per100: n(143, 12.6, 0.7, 9.5), tags: ["egg"], pack: 12, price: 650, priceSource: "sample" },
  { id: "atun_lata", name: { es: "Atún en lata (en agua)", en: "Canned tuna (in water)" }, category: "proteinas", unit: "g", per100: n(116, 26, 0, 1), tags: ["fish"], pack: 160, price: 38 },
  { id: "sardina_lata", name: { es: "Sardinas en lata", en: "Canned sardines" }, category: "proteinas", unit: "g", per100: n(208, 25, 0, 11.5), tags: ["fish"], pack: 125, price: 36 },
  { id: "tilapia", name: { es: "Filete de tilapia", en: "Tilapia fillet" }, category: "proteinas", unit: "g", per100: n(96, 20, 0, 1.7), tags: ["fish"], pack: 500, price: 25 },
  { id: "salmon", name: { es: "Salmón", en: "Salmon" }, category: "proteinas", unit: "g", per100: n(208, 20, 0, 13), tags: ["fish"], pack: 250, price: 60 },

  // ---- Legumes
  { id: "lentejas", name: { es: "Lentejas", en: "Lentils" }, category: "granos", unit: "g", per100: n(352, 24.6, 63, 1.1), tags: [], pack: 500, price: 3, priceSource: "sample" },
  { id: "frijol", name: { es: "Fríjol rojo", en: "Red beans" }, category: "granos", unit: "g", per100: n(333, 23.6, 60, 0.8), tags: [], pack: 500, price: 8 },
  { id: "garbanzo", name: { es: "Garbanzos", en: "Chickpeas" }, category: "granos", unit: "g", per100: n(364, 19, 61, 6), tags: [], pack: 500, price: 8 },
  { id: "arveja_seca", name: { es: "Arveja seca", en: "Dried peas" }, category: "granos", unit: "g", per100: n(341, 24.6, 60, 1.2), tags: [], pack: 500, price: 5.5 },

  // ---- Grains, starches
  { id: "arroz_blanco", name: { es: "Arroz blanco", en: "White rice" }, category: "granos", unit: "g", per100: n(365, 7.1, 80, 0.7), tags: [], pack: 500, price: 3.6, priceSource: "sample" },
  { id: "arroz_integral", name: { es: "Arroz integral", en: "Brown rice" }, category: "granos", unit: "g", per100: n(370, 7.9, 77, 2.9), tags: [], pack: 500, price: 5.5 },
  { id: "pasta", name: { es: "Pasta", en: "Pasta" }, category: "granos", unit: "g", per100: n(371, 13, 75, 1.5), tags: ["gluten"], pack: 500, price: 5 },
  { id: "avena", name: { es: "Avena en hojuelas", en: "Rolled oats" }, category: "granos", unit: "g", per100: n(389, 16.9, 66, 6.9), tags: ["gluten"], pack: 400, price: 11 },
  { id: "harina_maiz", name: { es: "Harina de maíz precocida (arepas)", en: "Pre-cooked cornmeal (arepas)" }, category: "granos", unit: "g", per100: n(360, 7, 78, 1.5), tags: [], pack: 1000, price: 5.5 },
  { id: "pan_tajado", name: { es: "Pan tajado", en: "Sliced bread" }, category: "granos", unit: "g", per100: n(265, 9, 49, 3.5), tags: ["gluten"], pack: 450, price: 10 },
  { id: "quinua", name: { es: "Quinua", en: "Quinoa" }, category: "granos", unit: "g", per100: n(368, 14, 64, 6), tags: [], pack: 400, price: 14 },
  { id: "papa", name: { es: "Papa", en: "Potato" }, category: "frutas_verduras", unit: "g", per100: n(77, 2, 17, 0.1), tags: [], pack: 1000, price: 5.5, priceSource: "sample" },
  { id: "papa_criolla", name: { es: "Papa criolla", en: "Criolla potato" }, category: "frutas_verduras", unit: "g", per100: n(80, 2, 18, 0.2), tags: [], pack: 500, price: 6 },
  { id: "yuca", name: { es: "Yuca", en: "Cassava" }, category: "frutas_verduras", unit: "g", per100: n(160, 1.4, 38, 0.3), tags: [], pack: 500, price: 2.5 },
  { id: "platano", name: { es: "Plátano", en: "Plantain" }, category: "frutas_verduras", unit: "g", per100: n(122, 1.3, 32, 0.4), tags: [], pack: 500, price: 4.7, priceSource: "sample" },

  // ---- Dairy
  { id: "leche_entera", name: { es: "Leche entera", en: "Whole milk" }, category: "lacteos", unit: "ml", per100: n(61, 3.2, 4.8, 3.3), tags: ["lactose", "dairy"], pack: 900, price: 3.43, priceSource: "sample" },
  { id: "leche_deslactosada", name: { es: "Leche deslactosada", en: "Lactose-free milk" }, category: "lacteos", unit: "ml", per100: n(60, 3.2, 4.8, 3.2), tags: ["dairy"], pack: 900, price: 4.5 },
  { id: "yogur_natural", name: { es: "Yogur natural", en: "Plain yogurt" }, category: "lacteos", unit: "g", per100: n(61, 3.5, 4.7, 3.3), tags: ["lactose", "dairy"], pack: 1000, price: 9 },
  { id: "queso_campesino", name: { es: "Queso campesino", en: "Farmer's cheese" }, category: "lacteos", unit: "g", per100: n(260, 17, 3, 20), tags: ["lactose", "dairy"], pack: 250, price: 28 },
  { id: "queso_mozzarella", name: { es: "Queso mozzarella", en: "Mozzarella cheese" }, category: "lacteos", unit: "g", per100: n(280, 22, 2.2, 22), tags: ["lactose", "dairy"], pack: 250, price: 40 },
  { id: "mantequilla", name: { es: "Mantequilla", en: "Butter" }, category: "lacteos", unit: "g", per100: n(717, 0.9, 0.1, 81), tags: ["lactose", "dairy"], pack: 250, price: 83.2, priceSource: "sample" },

  // ---- Vegetables
  { id: "tomate_chonto", name: { es: "Tomate chonto", en: "Tomato" }, category: "frutas_verduras", unit: "g", per100: n(18, 0.9, 3.9, 0.2), tags: [], pack: 500, price: 6.8, priceSource: "sample" },
  { id: "cebolla_cabezona", name: { es: "Cebolla cabezona", en: "Onion" }, category: "frutas_verduras", unit: "g", per100: n(40, 1.1, 9.3, 0.1), tags: [], pack: 500, price: 4 },
  { id: "cebolla_junca", name: { es: "Cebolla larga (junca)", en: "Scallion" }, category: "frutas_verduras", unit: "g", per100: n(34, 1.8, 7.3, 0.2), tags: [], pack: 500, price: 10.9, priceSource: "sample" },
  { id: "zanahoria", name: { es: "Zanahoria", en: "Carrot" }, category: "frutas_verduras", unit: "g", per100: n(41, 0.9, 9.6, 0.2), tags: [], pack: 500, price: 2.7, priceSource: "sample" },
  { id: "habichuela", name: { es: "Habichuela", en: "Green beans" }, category: "frutas_verduras", unit: "g", per100: n(33, 1.8, 7, 0.2), tags: [], pack: 250, price: 8 },
  { id: "brocoli", name: { es: "Brócoli", en: "Broccoli" }, category: "frutas_verduras", unit: "g", per100: n(34, 2.8, 6.6, 0.4), tags: [], pack: 250, price: 10 },
  { id: "espinaca", name: { es: "Espinaca", en: "Spinach" }, category: "frutas_verduras", unit: "g", per100: n(23, 2.9, 3.6, 0.4), tags: [], pack: 250, price: 12 },
  { id: "lechuga", name: { es: "Lechuga", en: "Lettuce" }, category: "frutas_verduras", unit: "g", per100: n(15, 1.4, 2.9, 0.2), tags: [], pack: 250, price: 8 },
  { id: "pepino", name: { es: "Pepino cohombro", en: "Cucumber" }, category: "frutas_verduras", unit: "g", per100: n(15, 0.7, 3.6, 0.1), tags: [], pack: 250, price: 8 },
  { id: "pimenton", plural: { es: "pimentones", en: "bell peppers" }, name: { es: "Pimentón", en: "Bell pepper" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 150, per100: n(31, 1, 6, 0.3), tags: [], pack: 1, price: 1360, priceSource: "sample" },
  { id: "ajo", name: { es: "Ajo", en: "Garlic" }, category: "condimentos", unit: "g", per100: n(149, 6.4, 33, 0.5), tags: [], pack: 100, price: 20 },
  { id: "cilantro", name: { es: "Cilantro", en: "Cilantro" }, category: "condimentos", unit: "g", per100: n(23, 2.1, 3.7, 0.5), tags: [], pack: 50, price: 41.8, priceSource: "sample" },
  { id: "repollo", name: { es: "Repollo", en: "Cabbage" }, category: "frutas_verduras", unit: "g", per100: n(25, 1.3, 5.8, 0.1), tags: [], pack: 500, price: 3 },
  { id: "remolacha", name: { es: "Remolacha", en: "Beetroot" }, category: "frutas_verduras", unit: "g", per100: n(43, 1.6, 9.6, 0.2), tags: [], pack: 500, price: 4 },
  { id: "ahuyama", name: { es: "Ahuyama", en: "Pumpkin" }, category: "frutas_verduras", unit: "g", per100: n(26, 1, 6.5, 0.1), tags: [], pack: 500, price: 3 },
  { id: "calabacin", name: { es: "Calabacín", en: "Zucchini" }, category: "frutas_verduras", unit: "g", per100: n(17, 1.2, 3.1, 0.3), tags: [], pack: 250, price: 6 },

  // ---- Fruit
  { id: "banano", plural: { es: "bananos", en: "bananas" }, name: { es: "Banano", en: "Banana" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 120, per100: n(89, 1.1, 22.8, 0.3), tags: [], pack: 1, price: 713, priceSource: "sample" },
  { id: "manzana", plural: { es: "manzanas", en: "apples" }, name: { es: "Manzana", en: "Apple" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 180, per100: n(52, 0.3, 13.8, 0.2), tags: [], pack: 1, price: 2440, priceSource: "sample" },
  { id: "naranja", plural: { es: "naranjas", en: "oranges" }, name: { es: "Naranja", en: "Orange" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 150, per100: n(47, 0.9, 11.8, 0.1), tags: [], pack: 1, price: 800 },
  { id: "mandarina", plural: { es: "mandarinas", en: "mandarins" }, name: { es: "Mandarina", en: "Mandarin" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 90, per100: n(53, 0.8, 13.3, 0.3), tags: [], pack: 1, price: 500 },
  { id: "pera", plural: { es: "peras", en: "pears" }, name: { es: "Pera", en: "Pear" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 170, per100: n(57, 0.4, 15.2, 0.1), tags: [], pack: 1, price: 1800 },
  { id: "aguacate", plural: { es: "aguacates", en: "avocados" }, name: { es: "Aguacate", en: "Avocado" }, category: "frutas_verduras", unit: "unit", gramsPerUnit: 200, per100: n(160, 2, 8.5, 14.7), tags: [], pack: 1, price: 3500 },
  { id: "papaya", name: { es: "Papaya", en: "Papaya" }, category: "frutas_verduras", unit: "g", per100: n(43, 0.5, 11, 0.3), tags: [], pack: 500, price: 4 },
  { id: "pina", name: { es: "Piña", en: "Pineapple" }, category: "frutas_verduras", unit: "g", per100: n(50, 0.5, 13.1, 0.1), tags: [], pack: 500, price: 4 },
  { id: "mango", name: { es: "Mango", en: "Mango" }, category: "frutas_verduras", unit: "g", per100: n(60, 0.8, 15, 0.4), tags: [], pack: 500, price: 5 },
  { id: "guayaba", name: { es: "Guayaba", en: "Guava" }, category: "frutas_verduras", unit: "g", per100: n(68, 2.6, 14.3, 1), tags: [], pack: 500, price: 6 },
  { id: "fresa", name: { es: "Fresa", en: "Strawberry" }, category: "frutas_verduras", unit: "g", per100: n(32, 0.7, 7.7, 0.3), tags: [], pack: 250, price: 15 },
  { id: "mora", name: { es: "Mora", en: "Blackberry (mora)" }, category: "frutas_verduras", unit: "g", per100: n(43, 1.4, 9.6, 0.5), tags: [], pack: 500, price: 9 },
  { id: "tomate_arbol", name: { es: "Tomate de árbol", en: "Tree tomato" }, category: "frutas_verduras", unit: "g", per100: n(31, 2, 4.5, 0.4), tags: [], pack: 500, price: 5 },
  { id: "maracuya", name: { es: "Maracuyá", en: "Passion fruit" }, category: "frutas_verduras", unit: "g", per100: n(97, 2.2, 23.4, 0.7), tags: [], pack: 250, price: 8 },

  // ---- Nuts and fats
  { id: "mani", name: { es: "Maní", en: "Peanuts" }, category: "otros", unit: "g", per100: n(567, 25.8, 16.1, 49.2), tags: ["peanut"], pack: 200, price: 15 },
  { id: "almendras", name: { es: "Almendras", en: "Almonds" }, category: "otros", unit: "g", per100: n(579, 21.2, 21.6, 49.9), tags: ["tree_nut"], pack: 100, price: 80 },
  { id: "nueces", name: { es: "Nueces", en: "Walnuts" }, category: "otros", unit: "g", per100: n(654, 15.2, 13.7, 65.2), tags: ["tree_nut"], pack: 100, price: 90 },
  { id: "aceite_vegetal", name: { es: "Aceite vegetal (canola)", en: "Vegetable (canola) oil" }, category: "condimentos", unit: "ml", per100: n(813, 0, 0, 90), tags: [], pack: 1000, price: 9.99, priceSource: "sample" },
  { id: "aceite_oliva", name: { es: "Aceite de oliva", en: "Olive oil" }, category: "condimentos", unit: "ml", per100: n(813, 0, 0, 90), tags: [], pack: 250, price: 65 },

  // ---- Pantry
  { id: "sal", name: { es: "Sal", en: "Salt" }, category: "condimentos", unit: "g", per100: n(0, 0, 0, 0), tags: [], pack: 500, price: 3 },
  { id: "azucar", name: { es: "Azúcar", en: "Sugar" }, category: "condimentos", unit: "g", per100: n(387, 0, 100, 0), tags: [], pack: 1000, price: 4.5 },
  { id: "panela", name: { es: "Panela", en: "Panela (unrefined cane sugar)" }, category: "condimentos", unit: "g", per100: n(380, 0.5, 95, 0), tags: [], pack: 500, price: 6 },
  { id: "miel", name: { es: "Miel de abejas", en: "Honey" }, category: "condimentos", unit: "g", per100: n(304, 0.3, 82, 0), tags: ["honey"], pack: 300, price: 30 },
];

export const CATALOG: readonly Ingredient[] = seeds.map((seed) => ({
  ...seed,
  priceSource: seed.priceSource ?? "estimate",
}));

const BY_ID = new Map(CATALOG.map((ingredient) => [ingredient.id, ingredient]));

export function getIngredient(id: string): Ingredient | undefined {
  return BY_ID.get(id);
}

export const CATALOG_IDS: readonly string[] = CATALOG.map(
  (ingredient) => ingredient.id,
);

/** Grams (or ml) that `quantity` of the ingredient weighs, for nutrition. */
export function gramsOf(ingredient: Ingredient, quantity: number): number {
  return ingredient.unit === "unit"
    ? quantity * (ingredient.gramsPerUnit ?? 0)
    : quantity;
}

/** Nutrition of `quantity` (in the ingredient's own unit). */
export function nutritionOf(
  ingredient: Ingredient,
  quantity: number,
): Nutrition {
  const factor = gramsOf(ingredient, quantity) / 100;

  return {
    kcal: ingredient.per100.kcal * factor,
    protein: ingredient.per100.protein * factor,
    carbs: ingredient.per100.carbs * factor,
    fat: ingredient.per100.fat * factor,
  };
}

/** COP to buy `quantity`: whole packs only, as at a real supermarket. */
export function costOf(ingredient: Ingredient, quantity: number): number {
  if (quantity <= 0) {
    return 0;
  }

  const packs = Math.ceil(quantity / ingredient.pack - 1e-9);

  return Math.round(packs * ingredient.pack * ingredient.price);
}
