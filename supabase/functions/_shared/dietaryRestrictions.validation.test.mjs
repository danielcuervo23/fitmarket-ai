/**
 * Suite de verificación alineada con dietaryRestrictions.ts
 * Ejecutar: node supabase/functions/_shared/dietaryRestrictions.validation.test.mjs
 */

const DIETARY_PREDEFINED_IDS = new Set([
  "lactose", "gluten", "pork", "fish", "shellfish",
  "peanut", "nuts", "vegetarian", "vegan",
]);

const MEAT_TERMS = ["pollo", "carne", "res", "cerdo", "churrasco", "bistec", "costilla"];
const FISH_TERMS = ["pescado", "salmon", "atun", "trucha", "tilapia", "bacalao", "sardina"];
const SHELLFISH_TERMS = ["mariscos", "camaron", "camarones", "langostino", "langostinos", "pulpo"];
const DAIRY_TERMS = ["leche", "queso", "yogur", "mantequilla"];
const GLUTEN_TERMS = ["trigo", "avena", "espagueti", "espaguetis", "pan", "fideos"];
const PORK_TERMS = ["cerdo", "chicharron", "pernil", "tocino"];
const PEANUT_TERMS = ["mani", "cacahuate"];
const NUT_TERMS = ["nueces", "nuez", "almendra", "almendras", "avellana"];
const EGG_TERMS = ["huevo", "huevos"];
const HONEY_TERMS = ["miel"];

const PLANT_DAIRY_EXCEPTIONS = [
  "leche de almendras", "leche de almendra", "leche de soya", "leche de coco",
  "leche vegetal", "bebida de almendras", "yogur de coco", "queso vegano",
];
const DAIRY_MATCH_TERMS = new Set(["leche", "queso", "yogur", "yogurt", "mantequilla"]);

const PREDEFINED_ID_TERMS = {
  lactose: DAIRY_TERMS,
  gluten: GLUTEN_TERMS,
  pork: PORK_TERMS,
  fish: FISH_TERMS,
  shellfish: SHELLFISH_TERMS,
  peanut: PEANUT_TERMS,
  nuts: NUT_TERMS,
  vegetarian: [...MEAT_TERMS, ...FISH_TERMS, ...SHELLFISH_TERMS],
  vegan: [...MEAT_TERMS, ...FISH_TERMS, ...SHELLFISH_TERMS, ...DAIRY_TERMS, ...EGG_TERMS, ...HONEY_TERMS],
};

function normalizeForMatching(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlantDairyException(text, term) {
  if (!DAIRY_MATCH_TERMS.has(normalizeForMatching(term))) return false;
  const normalized = normalizeForMatching(text);
  return PLANT_DAIRY_EXCEPTIONS.some((phrase) =>
    normalized.includes(normalizeForMatching(phrase))
  );
}

function getTermVariants(term) {
  const normalized = normalizeForMatching(term.trim());
  const variants = new Set([normalized]);
  if (!normalized.includes(" ") && !normalized.endsWith("s")) {
    variants.add(`${normalized}s`);
    variants.add(`${normalized}es`);
  }
  return [...variants];
}

function textContainsProhibitedTerm(text, term) {
  if (isPlantDairyException(text, term)) return false;
  return getTermVariants(term).some((variant) => {
    const normalized = normalizeForMatching(text);
    const normalizedTerm = normalizeForMatching(variant);
    if (!normalizedTerm) return false;
    if (normalizedTerm.includes(" ")) return normalized.includes(normalizedTerm);
    return new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?:[^a-z0-9]|$)`,
    ).test(normalized);
  });
}

function buildProhibitedFoodTerms(restrictions) {
  const terms = new Set();
  for (const restriction of restrictions) {
    if (DIETARY_PREDEFINED_IDS.has(restriction)) {
      for (const term of PREDEFINED_ID_TERMS[restriction]) terms.add(term);
    } else {
      const custom = restriction.trim().toLowerCase();
      if (custom) terms.add(custom);
    }
  }
  return [...terms];
}

function findDietaryViolation(plan, dietaryRestrictions) {
  const prohibitedTerms = buildProhibitedFoodTerms(dietaryRestrictions);
  if (prohibitedTerms.length === 0) return null;

  for (const [day, dayMenu] of Object.entries(plan.weekly_menu)) {
    for (const [meal, items] of Object.entries(dayMenu)) {
      for (const item of items) {
        for (const term of prohibitedTerms) {
          if (textContainsProhibitedTerm(item, term)) {
            return { location: "weekly_menu", day, meal, text: item, matchedTerm: term };
          }
        }
      }
    }
  }

  for (const item of plan.shopping_list) {
    for (const term of prohibitedTerms) {
      if (textContainsProhibitedTerm(item.name, term)) {
        return { location: "shopping_list", text: item.name, matchedTerm: term };
      }
    }
  }
  return null;
}

function makeValidPlan(overrides = {}) {
  const day = {
    desayuno: overrides.desayuno ?? ["Fruta fresca"],
    almuerzo: overrides.almuerzo ?? ["Ensalada de quinoa"],
    cena: overrides.cena ?? ["Sopa de lentejas"],
    snacks: overrides.snacks ?? ["Manzana"],
  };
  const days = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  return {
    weekly_menu: Object.fromEntries(days.map((d) => [d, { ...day }])),
    shopping_list: [{
      name: overrides.shoppingName ?? "Quinoa",
      quantity: "500g",
      estimated_price_cop: 8000,
      category: "granos",
      store_id: "D1",
    }],
  };
}

const restrictionCases = [
  { id: "vegetarian", badMenu: "Pollo a la plancha", badList: "Pechuga de pollo", okMenu: "Ensalada de quinoa" },
  { id: "vegan", badMenu: "Huevos revueltos", badList: "Queso fresco", okMenu: "Ensalada de lechuga" },
  { id: "lactose", badMenu: "Avena con leche", badList: "Yogur natural", okMenu: "Avena con leche de almendras" },
  { id: "gluten", badMenu: "Pan integral tostado", badList: "Espagueti", okMenu: "Arroz con verduras" },
  { id: "pork", badMenu: "Chicharrón con yuca", badList: "Pernil", okMenu: "Pollo asado" },
  { id: "fish", badMenu: "Salmón al horno", badList: "Filete de atún", okMenu: "Pollo a la plancha" },
  { id: "shellfish", badMenu: "Camarones al ajillo", badList: "Langostinos", okMenu: "Ensalada verde" },
  { id: "peanut", badMenu: "Arepa con maní", badList: "Mantequilla de maní", okMenu: "Arepa con queso" },
  { id: "nuts", badMenu: "Ensalada con almendras", badList: "Nueces mixtas", okMenu: "Ensalada simple" },
  { id: "custom", restrictions: ["champiñones"], badMenu: "Risotto de champiñones", badList: "Champiñones frescos", okMenu: "Arroz con verduras" },
];

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.error(`FAIL: ${name}`); }
}

for (const c of restrictionCases) {
  const restrictions = c.restrictions ?? [c.id];
  const badMenuPlan = makeValidPlan({ almuerzo: [c.badMenu] });
  const badListPlan = makeValidPlan({ shoppingName: c.badList });
  const okPlan = makeValidPlan({
    desayuno: ["Fruta fresca"],
    almuerzo: [c.okMenu],
    cena: ["Sopa de lentejas"],
    snacks: ["Manzana"],
  });

  assert(`${restrictions.join("+")} menú prohibido (${c.badMenu})`, findDietaryViolation(badMenuPlan, restrictions)?.location === "weekly_menu");
  assert(`${restrictions.join("+")} lista prohibida (${c.badList})`, findDietaryViolation(badListPlan, restrictions)?.location === "shopping_list");
  assert(`${restrictions.join("+")} plan válido (${c.okMenu})`, findDietaryViolation(okPlan, restrictions) === null);
}

// Perfil real en producción: pork + nuts + tomate
const realUserRestrictions = ["pork", "nuts", "tomate"];
assert("perfil real bloquea chicharrón", findDietaryViolation(makeValidPlan({ almuerzo: ["Chicharrón con yuca"] }), realUserRestrictions) !== null);
assert("perfil real bloquea almendras", findDietaryViolation(makeValidPlan({ shoppingName: "Almendras tostadas" }), realUserRestrictions) !== null);
assert("perfil real bloquea tomate en menú", findDietaryViolation(makeValidPlan({ cena: ["Ensalada con tomate cherry"] }), realUserRestrictions) !== null);
assert("perfil real bloquea tomate en lista", findDietaryViolation(makeValidPlan({ shoppingName: "Tomate chonto" }), realUserRestrictions) !== null);
assert("perfil real permite pollo", findDietaryViolation(makeValidPlan({ almuerzo: ["Pollo asado"] }), realUserRestrictions) === null);

assert("sin restricciones permite pollo", findDietaryViolation(makeValidPlan({ almuerzo: ["Pollo asado"] }), []) === null);
assert("vegan no confunde lechuga con leche", findDietaryViolation(makeValidPlan({ desayuno: ["Ensalada de lechuga"] }), ["vegan"]) === null);
assert("vegetarian bloquea pescado", findDietaryViolation(makeValidPlan({ cena: ["Pescado frito"] }), ["vegetarian"]) !== null);
assert("vegetarian bloquea mariscos", findDietaryViolation(makeValidPlan({ cena: ["Sopa de mariscos"] }), ["vegetarian"]) !== null);
assert("vegan solo bloquea carne", findDietaryViolation(makeValidPlan({ almuerzo: ["Carne asada"] }), ["vegan"]) !== null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
