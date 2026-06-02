type DietaryPredefinedId =
  | "lactose"
  | "gluten"
  | "pork"
  | "fish"
  | "shellfish"
  | "peanut"
  | "nuts"
  | "vegetarian"
  | "vegan";

export const DIETARY_PREDEFINED_IDS = new Set<string>([
  "lactose",
  "gluten",
  "pork",
  "fish",
  "shellfish",
  "peanut",
  "nuts",
  "vegetarian",
  "vegan",
]);

export interface PlanForDietaryValidation {
  weekly_menu: Record<string, Record<string, string[]>>;
  shopping_list: { name: string }[];
}

const MEAT_TERMS = [
  "pollo",
  "carne",
  "res",
  "cerdo",
  "churrasco",
  "bistec",
  "costilla",
] as const;

const FISH_TERMS = [
  "pescado",
  "salmon",
  "salmones",
  "atun",
  "atunes",
  "trucha",
  "truchas",
  "tilapia",
  "tilapias",
  "bacalao",
  "sardina",
  "sardinas",
  "bagre",
  "merluza",
  "cazon",
  "robalo",
] as const;

const SHELLFISH_TERMS = [
  "mariscos",
  "marisco",
  "camaron",
  "camarones",
  "langostino",
  "langostinos",
  "langosta",
  "langostas",
  "cangrejo",
  "cangrejos",
  "pulpo",
  "pulpos",
  "calamar",
  "calamares",
  "mejillon",
  "mejillones",
  "ostras",
] as const;

const DAIRY_TERMS = [
  "leche",
  "queso",
  "yogur",
  "yogurt",
  "mantequilla",
  "lacteo",
  "lacteos",
  "suero",
  "ricotta",
  "mascarpone",
] as const;

const GLUTEN_TERMS = [
  "trigo",
  "avena",
  "cebada",
  "espagueti",
  "espaguetis",
  "gluten",
  "bulgur",
  "couscous",
  "pan",
  "fideos",
] as const;

const PORK_TERMS = [
  "cerdo",
  "chicharron",
  "pernil",
  "tocino",
  "panceta",
  "chorizo",
] as const;

const PEANUT_TERMS = ["mani", "cacahuate", "cacahuates"] as const;

const NUT_TERMS = [
  "nueces",
  "nuez",
  "almendra",
  "almendras",
  "avellana",
  "avellanas",
  "castana",
  "pistacho",
  "anacardo",
  "macadamia",
  "pecana",
] as const;

const EGG_TERMS = ["huevo", "huevos"] as const;

const HONEY_TERMS = ["miel"] as const;

const PLANT_DAIRY_EXCEPTIONS = [
  "leche de almendras",
  "leche de almendra",
  "leche de soya",
  "leche de soy",
  "leche de coco",
  "leche de avena",
  "leche vegetal",
  "bebida de almendras",
  "bebida vegetal",
  "yogur de coco",
  "queso vegano",
] as const;

const DAIRY_MATCH_TERMS = new Set(["leche", "queso", "yogur", "yogurt", "mantequilla"]);

const PREDEFINED_ID_TERMS: Record<DietaryPredefinedId, readonly string[]> = {
  lactose: DAIRY_TERMS,
  gluten: GLUTEN_TERMS,
  pork: PORK_TERMS,
  fish: FISH_TERMS,
  shellfish: SHELLFISH_TERMS,
  peanut: PEANUT_TERMS,
  nuts: NUT_TERMS,
  vegetarian: [...MEAT_TERMS, ...FISH_TERMS, ...SHELLFISH_TERMS],
  vegan: [
    ...MEAT_TERMS,
    ...FISH_TERMS,
    ...SHELLFISH_TERMS,
    ...DAIRY_TERMS,
    ...EGG_TERMS,
    ...HONEY_TERMS,
  ],
};

function isPredefinedId(value: string): value is DietaryPredefinedId {
  return DIETARY_PREDEFINED_IDS.has(value);
}

function normalizeForMatching(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlantDairyException(text: string, term: string): boolean {
  if (!DAIRY_MATCH_TERMS.has(normalizeForMatching(term))) {
    return false;
  }

  const normalized = normalizeForMatching(text);

  return PLANT_DAIRY_EXCEPTIONS.some((phrase) =>
    normalized.includes(normalizeForMatching(phrase))
  );
}

function getTermVariants(term: string): string[] {
  const normalized = normalizeForMatching(term.trim());
  const variants = new Set<string>([normalized]);

  if (!normalized.includes(" ") && !normalized.endsWith("s")) {
    variants.add(`${normalized}s`);
    variants.add(`${normalized}es`);
  }

  return [...variants];
}

function matchesProhibitedTerm(text: string, term: string): boolean {
  if (isPlantDairyException(text, term)) {
    return false;
  }

  return getTermVariants(term).some((variant) => {
    const normalized = normalizeForMatching(text);
    const normalizedTerm = normalizeForMatching(variant);

    if (!normalizedTerm) {
      return false;
    }

    if (normalizedTerm.includes(" ")) {
      return normalized.includes(normalizedTerm);
    }

    const pattern = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?:[^a-z0-9]|$)`,
    );

    return pattern.test(normalized);
  });
}

/** Coincidencia por palabra completa (evita leche ⊂ lechuga, res ⊂ fresas). */
export function textContainsProhibitedTerm(text: string, term: string): boolean {
  return matchesProhibitedTerm(text, term);
}

export function buildProhibitedFoodTerms(restrictions: string[]): string[] {
  const terms = new Set<string>();

  for (const restriction of restrictions) {
    if (isPredefinedId(restriction)) {
      for (const term of PREDEFINED_ID_TERMS[restriction]) {
        terms.add(term);
      }
      continue;
    }

    const custom = restriction.trim().toLowerCase();

    if (custom) {
      terms.add(custom);
    }
  }

  return [...terms];
}

export interface DietaryViolation {
  location: "weekly_menu" | "shopping_list";
  day?: string;
  meal?: string;
  text: string;
  matchedTerm: string;
}

export function findDietaryViolation(
  plan: PlanForDietaryValidation,
  dietaryRestrictions: string[],
): DietaryViolation | null {
  const prohibitedTerms = buildProhibitedFoodTerms(dietaryRestrictions);

  if (prohibitedTerms.length === 0) {
    return null;
  }

  for (const [day, dayMenu] of Object.entries(plan.weekly_menu)) {
    for (const [meal, items] of Object.entries(dayMenu)) {
      for (const item of items) {
        for (const term of prohibitedTerms) {
          if (textContainsProhibitedTerm(item, term)) {
            return {
              location: "weekly_menu",
              day,
              meal,
              text: item,
              matchedTerm: term,
            };
          }
        }
      }
    }
  }

  for (const item of plan.shopping_list) {
    for (const term of prohibitedTerms) {
      if (textContainsProhibitedTerm(item.name, term)) {
        return {
          location: "shopping_list",
          text: item.name,
          matchedTerm: term,
        };
      }
    }
  }

  return null;
}

export function validateDietaryRestrictions(
  plan: PlanForDietaryValidation,
  dietaryRestrictions: string[],
): string | null {
  const violation = findDietaryViolation(plan, dietaryRestrictions);

  if (!violation) {
    return null;
  }

  console.log({
    source: "validateDietaryRestrictions",
    ...violation,
    dietary_restrictions: dietaryRestrictions,
  });

  return "El plan incluye alimentos prohibidos por tus restricciones dietéticas.";
}
