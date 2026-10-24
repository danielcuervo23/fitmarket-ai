/**
 * Cheaper stand-ins used when a plan is over budget. Each rule says "if the
 * plan uses `from`, `to` can replace it" and what to keep equal when swapping
 * (protein for protein foods, calories for everything else).
 *
 * The planner tries these in the order of how much money each one saves, and
 * only uses substitutes that are allowed for the user (restrictions).
 */
export interface SwapRule {
  from: string;
  to: string;
  keep: "protein" | "kcal";
}

export const SWAP_RULES: readonly SwapRule[] = [
  // Proteins
  { from: "salmon", to: "tilapia", keep: "protein" },
  { from: "salmon", to: "atun_lata", keep: "protein" },
  { from: "tilapia", to: "pernil_pollo", keep: "protein" },
  { from: "tilapia", to: "huevo", keep: "protein" },
  { from: "atun_lata", to: "huevo", keep: "protein" },
  { from: "sardina_lata", to: "huevo", keep: "protein" },
  { from: "pechuga_pollo", to: "pernil_pollo", keep: "protein" },
  { from: "pechuga_pollo", to: "huevo", keep: "protein" },
  { from: "res_sobrebarriga", to: "pernil_pollo", keep: "protein" },
  { from: "carne_molida_res", to: "pernil_pollo", keep: "protein" },
  { from: "carne_molida_res", to: "lentejas", keep: "protein" },
  { from: "lomo_cerdo", to: "pernil_pollo", keep: "protein" },
  { from: "pernil_pollo", to: "huevo", keep: "protein" },
  { from: "pernil_pollo", to: "lentejas", keep: "protein" },
  { from: "queso_mozzarella", to: "queso_campesino", keep: "protein" },
  { from: "queso_campesino", to: "huevo", keep: "protein" },
  { from: "garbanzo", to: "lentejas", keep: "protein" },
  { from: "frijol", to: "lentejas", keep: "protein" },

  // Fats and nuts
  { from: "mantequilla", to: "aceite_vegetal", keep: "kcal" },
  { from: "aceite_oliva", to: "aceite_vegetal", keep: "kcal" },
  { from: "almendras", to: "mani", keep: "kcal" },
  { from: "nueces", to: "mani", keep: "kcal" },
  { from: "almendras", to: "avena", keep: "kcal" },
  { from: "nueces", to: "avena", keep: "kcal" },
  { from: "mani", to: "avena", keep: "kcal" },

  // Grains and starches
  { from: "quinua", to: "arroz_blanco", keep: "kcal" },
  { from: "arroz_integral", to: "arroz_blanco", keep: "kcal" },
  { from: "pasta", to: "arroz_blanco", keep: "kcal" },
  { from: "pan_tajado", to: "harina_maiz", keep: "kcal" },
  { from: "papa_criolla", to: "papa", keep: "kcal" },
  { from: "yogur_natural", to: "leche_entera", keep: "kcal" },
  { from: "yogur_natural", to: "leche_deslactosada", keep: "kcal" },
  { from: "miel", to: "panela", keep: "kcal" },

  // Fruit and vegetables
  { from: "fresa", to: "banano", keep: "kcal" },
  { from: "mora", to: "banano", keep: "kcal" },
  { from: "manzana", to: "banano", keep: "kcal" },
  { from: "pera", to: "banano", keep: "kcal" },
  { from: "naranja", to: "banano", keep: "kcal" },
  { from: "mandarina", to: "banano", keep: "kcal" },
  { from: "mango", to: "banano", keep: "kcal" },
  { from: "pina", to: "banano", keep: "kcal" },
  { from: "papaya", to: "banano", keep: "kcal" },
  { from: "guayaba", to: "banano", keep: "kcal" },
  { from: "maracuya", to: "banano", keep: "kcal" },
  { from: "tomate_arbol", to: "banano", keep: "kcal" },
  { from: "brocoli", to: "repollo", keep: "kcal" },
  { from: "espinaca", to: "repollo", keep: "kcal" },
  { from: "calabacin", to: "zanahoria", keep: "kcal" },
  { from: "habichuela", to: "zanahoria", keep: "kcal" },
];
