import type { DietTag, ShoppingCategory } from "./catalog.ts";

/**
 * How people in Colombia (and a few neighbours) actually name the foods in the
 * catalog, so a user can write "auyama", "cuajada" or "granos" and be
 * understood. Words are matched without accents and in singular or plural.
 *
 * Keep aliases specific: every word of an alias becomes a match word for that
 * ingredient, so generic words ("verde", "agua", "lata") must not appear here.
 */

/** Extra names per catalog ingredient id (the catalog name is always matched). */
export const FOOD_ALIASES: Record<string, string[]> = {
  pechuga_pollo: ["pollo", "pechuga", "ave", "aves", "chicken"],
  pernil_pollo: ["pollo", "pernil", "muslo", "contramuslo", "pierna", "ave", "aves", "chicken"],
  carne_molida_res: ["res", "carne de res", "ternera", "vacuno", "molida", "beef"],
  res_sobrebarriga: ["res", "carne de res", "sobrebarriga", "vacuno", "beef"],
  lomo_cerdo: ["cerdo", "puerco", "chancho", "marrano", "cochino", "lomo", "pork"],
  huevo: ["huevos", "huevito", "egg", "eggs"],
  atun_lata: ["atun", "enlatado", "enlatados", "conserva", "tuna"],
  sardina_lata: ["sardina", "sardinas", "enlatado", "enlatados", "conserva"],
  tilapia: ["tilapia", "mojarra", "pescado", "fish"],
  salmon: ["salmon", "pescado", "fish"],
  lentejas: ["lenteja", "lentejas", "legumbre", "legumbres", "lentils"],
  frijol: ["frijol", "frijoles", "poroto", "porotos", "alubia", "alubias", "judia", "judias", "caraota", "caraotas", "cargamanto", "legumbre", "legumbres", "beans"],
  garbanzo: ["garbanzo", "garbanzos", "legumbre", "legumbres", "chickpeas"],
  arveja_seca: ["arveja", "arvejas", "alverja", "alverjas", "guisante", "guisantes", "chicharo", "legumbre", "legumbres", "peas"],
  arroz_blanco: ["arroz", "rice"],
  arroz_integral: ["arroz", "rice"],
  pasta: ["pasta", "espagueti", "espaguetis", "spaghetti", "macarron", "macarrones", "fideo", "fideos", "tallarin", "tallarines", "sopa de pasta"],
  avena: ["avena", "hojuelas", "oats", "oatmeal", "cereal"],
  harina_maiz: ["arepa", "arepas", "masarepa", "maiz", "harina de maiz", "corn", "cornmeal"],
  pan_tajado: ["pan", "tostada", "tostadas", "sandwich", "bread", "tajado"],
  quinua: ["quinua", "quinoa", "kinua", "kinoa"],
  papa: ["papa", "papas", "patata", "patatas", "potato", "potatoes", "tuberculo", "tuberculos"],
  papa_criolla: ["papa", "papas", "criolla", "tuberculo", "tuberculos"],
  yuca: ["yuca", "mandioca", "casava", "cassava", "tuberculo", "tuberculos"],
  platano: ["platano", "platanos", "maduro", "maduros", "patacon", "patacones", "plantain"],
  leche_entera: ["leche", "lacteo", "lacteos", "milk"],
  leche_deslactosada: ["leche", "deslactosada", "lacteo", "lacteos", "milk"],
  yogur_natural: ["yogur", "yogurt", "yoghurt", "kumis", "lacteo", "lacteos"],
  queso_campesino: ["queso", "quesos", "cuajada", "quesito", "cheese", "lacteo", "lacteos"],
  queso_mozzarella: ["queso", "quesos", "mozzarella", "mozarela", "cheese", "lacteo", "lacteos"],
  mantequilla: ["mantequilla", "butter", "lacteo", "lacteos"],
  tomate_chonto: ["tomate", "tomates", "jitomate", "chonto", "tomato"],
  cebolla_cabezona: ["cebolla", "cebollas", "onion"],
  cebolla_junca: ["cebolla", "cebollas", "junca", "cebollin", "cebolleta", "scallion"],
  zanahoria: ["zanahoria", "zanahorias", "carrot"],
  habichuela: ["habichuela", "habichuelas", "vainita", "vainitas", "ejote", "ejotes", "chaucha", "chauchas"],
  brocoli: ["brocoli", "brecol", "broccoli"],
  espinaca: ["espinaca", "espinacas", "spinach"],
  lechuga: ["lechuga", "lechugas", "ensalada", "lettuce"],
  pepino: ["pepino", "pepinos", "cohombro", "cucumber"],
  pimenton: ["pimenton", "pimentones", "pimiento", "pimientos", "aji", "paprika", "pepper"],
  ajo: ["ajo", "ajos", "garlic"],
  cilantro: ["cilantro", "culantro", "coriandro", "coriander"],
  repollo: ["repollo", "col", "berza", "cabbage"],
  remolacha: ["remolacha", "remolachas", "betabel", "betarraga", "beet"],
  ahuyama: ["ahuyama", "auyama", "calabaza", "zapallo", "squash"],
  calabacin: ["calabacin", "zucchini", "zuquini", "zapallito", "courgette"],
  banano: ["banano", "bananos", "guineo", "banana", "bananas", "cambur"],
  manzana: ["manzana", "manzanas", "apple", "apples"],
  naranja: ["naranja", "naranjas", "orange", "oranges", "citrico", "citricos"],
  mandarina: ["mandarina", "mandarinas", "tangerina", "citrico", "citricos"],
  pera: ["pera", "peras", "pear"],
  aguacate: ["aguacate", "aguacates", "palta", "avocado"],
  papaya: ["papaya", "lechosa", "fruta bomba"],
  pina: ["pina", "anana", "ananas", "pineapple"],
  mango: ["mango", "mangos"],
  guayaba: ["guayaba", "guayabas", "guava"],
  fresa: ["fresa", "fresas", "frutilla", "strawberry", "strawberries"],
  mora: ["mora", "moras", "blackberry"],
  tomate_arbol: ["tomate de arbol", "tamarillo"],
  maracuya: ["maracuya", "parchita", "fruta de la pasion", "passion fruit"],
  mani: ["mani", "cacahuate", "cacahuete", "peanut", "peanuts", "fruto seco", "frutos secos"],
  almendras: ["almendra", "almendras", "almond", "fruto seco", "frutos secos"],
  nueces: ["nuez", "nueces", "walnut", "fruto seco", "frutos secos"],
  aceite_vegetal: ["aceite", "aceites", "grasa", "grasas", "canola", "oil"],
  aceite_oliva: ["aceite", "aceites", "oliva", "grasa", "grasas", "olive"],
  sal: ["sal", "salt"],
  azucar: ["azucar", "dulce", "dulces", "sugar"],
  panela: ["panela", "dulce", "dulces", "azucar"],
  miel: ["miel", "abejas", "honey", "dulce", "dulces"],
};

export interface FoodGroup {
  tags?: DietTag[];
  ids?: string[];
  category?: ShoppingCategory;
}

const FRUIT_IDS = [
  "banano", "manzana", "naranja", "mandarina", "pera", "aguacate", "papaya",
  "pina", "mango", "guayaba", "fresa", "mora", "tomate_arbol", "maracuya",
];

const VEGETABLE_IDS = [
  "tomate_chonto", "cebolla_cabezona", "cebolla_junca", "zanahoria",
  "habichuela", "brocoli", "espinaca", "lechuga", "pepino", "pimenton", "ajo",
  "cilantro", "repollo", "remolacha", "ahuyama", "calabacin",
];

const LEGUME_IDS = ["lentejas", "frijol", "garbanzo", "arveja_seca"];

const GROUPS: [string[], FoodGroup][] = [
  // Whole shelves of the catalog.
  [["granos", "grano", "legumbres", "legumbre", "leguminosas", "menestras", "grains", "grain", "legumes", "pulses"], { ids: LEGUME_IDS }],
  [["cereales", "cereal"], { ids: ["arroz_blanco", "arroz_integral", "avena", "quinua", "harina_maiz", "pasta", "pan_tajado"] }],
  [["arroz", "arroces", "rice"], { ids: ["arroz_blanco", "arroz_integral"] }],
  [["verduras", "verdura", "vegetales", "hortalizas", "veggies", "vegetables"], { ids: VEGETABLE_IDS }],
  [["frutas", "fruta", "fruits", "fruit"], { ids: FRUIT_IDS }],
  [["tuberculos", "tuberculo"], { ids: ["papa", "papa_criolla", "yuca"] }],
  [["harinas", "harina", "panaderia", "masas"], { ids: ["harina_maiz", "pan_tajado", "pasta"] }],
  [["dulces", "dulce", "azucares", "endulzantes", "sweets"], { ids: ["azucar", "panela", "miel"] }],
  [["aceites", "grasas", "grasa"], { ids: ["aceite_vegetal", "aceite_oliva", "mantequilla"] }],
  [["enlatados", "enlatado", "conservas", "canned"], { ids: ["atun_lata", "sardina_lata"] }],
  [["condimentos", "especias", "sazonadores", "aliños", "alinos"], { category: "condimentos" }],
  [["pollo", "aves", "ave", "chicken", "poultry"], { ids: ["pechuga_pollo", "pernil_pollo"] }],
  [["res", "carne de res", "vacuno", "ternera", "beef"], { ids: ["carne_molida_res", "res_sobrebarriga"] }],
  [["carne roja", "carnes rojas"], { ids: ["carne_molida_res", "res_sobrebarriga", "lomo_cerdo"] }],
  // Diet tags.
  [["lacteos", "lacteo", "dairy", "leche y derivados", "derivados de la leche"], { tags: ["dairy", "lactose"] }],
  [["huevos", "huevo", "egg", "eggs"], { tags: ["egg"] }],
  [["frutos secos", "fruto seco", "nueces y almendras", "nuts"], { tags: ["tree_nut", "peanut"] }],
  [["nueces", "nuez", "tree nuts"], { tags: ["tree_nut"] }],
  [["carne", "carnes", "meat"], { tags: ["meat"] }],
  [["cerdo", "puerco", "chancho", "marrano", "cochino", "pork"], { tags: ["pork"] }],
  [["pescado", "pescados", "fish"], { tags: ["fish"] }],
  [["mariscos", "marisco", "camarones", "camaron", "shellfish", "seafood"], { tags: ["shellfish"] }],
  [["trigo", "wheat", "gluten"], { tags: ["gluten"] }],
  [["miel", "honey"], { tags: ["honey"] }],
];

/** Group words (normalized, without accents) -> what they exclude. */
export const FOOD_GROUPS: Record<string, FoodGroup> = Object.fromEntries(
  GROUPS.flatMap(([names, group]) =>
    names.map((name) => [
      name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      group,
    ]),
  ),
);

/** Words of a catalog name that must NOT match that ingredient. */
export const NOT_WORDS: Record<string, string[]> = {
  // "tomate" means the red tomato; the tree tomato has its own name.
  tomate_arbol: ["tomate"],
};

/**
 * Words that appear in many catalog names without naming a food on their own
 * ("agua" in "atún en agua"), so typing them must not exclude anything.
 */
export const GENERIC_WORDS = new Set([
  "agua",
  "lata",
  "entera",
  "blanco",
  "natural",
  "verde",
  "seca",
  "precocida",
  "tajado",
  "molida",
  "criolla",
  "campesino",
  "vegetal",
  "filete",
  "cabezona",
  "chonto",
]);
