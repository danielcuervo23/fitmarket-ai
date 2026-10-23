import { CATALOG, type DietTag, type Ingredient } from "../catalog.ts";

/**
 * Turns the user's restrictions into catalog rules.
 *
 * Because the AI can only pick catalog ids, and forbidden ingredients are
 * removed from the list it sees, a restriction is enforced by construction
 * and checked again exactly (by tag / id), never by guessing from text.
 */

const MEAT_TAGS: DietTag[] = ["meat", "pork", "fish", "shellfish"];

const PREDEFINED: Record<string, DietTag[]> = {
  lactose: ["lactose"],
  gluten: ["gluten"],
  pork: ["pork"],
  fish: ["fish"],
  shellfish: ["shellfish"],
  peanut: ["peanut"],
  nuts: ["tree_nut"],
  vegetarian: MEAT_TAGS,
  vegan: [...MEAT_TAGS, "egg", "dairy", "lactose", "honey"],
};

/** Common free-text words that mean a whole group of foods. */
const GROUP_SYNONYMS: Record<string, DietTag[]> = {
  lacteos: ["dairy", "lactose"],
  lacteo: ["dairy", "lactose"],
  dairy: ["dairy", "lactose"],
  huevos: ["egg"],
  egg: ["egg"],
  eggs: ["egg"],
  "frutos secos": ["tree_nut", "peanut"],
  nueces: ["tree_nut"],
  carne: ["meat"],
  carnes: ["meat"],
  meat: ["meat"],
  cerdo: ["pork"],
  pescado: ["fish"],
  mariscos: ["shellfish"],
  trigo: ["gluten"],
  wheat: ["gluten"],
  miel: ["honey"],
  honey: ["honey"],
};

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function words(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

function nameWords(ingredient: Ingredient): Set<string> {
  return new Set([
    ...words(ingredient.name.es),
    ...words(ingredient.name.en),
    ...words(ingredient.id.replace(/_/g, " ")),
  ]);
}

export interface RestrictionRules {
  /** Tags no ingredient may carry. */
  excludedTags: Set<DietTag>;
  /** Ingredients excluded because the user named them in free text. */
  excludedIds: Set<string>;
  /** Free-text entries that matched nothing in the catalog (kept for the prompt). */
  unmatchedText: string[];
}

export function buildRestrictionRules(restrictions: string[]): RestrictionRules {
  const excludedTags = new Set<DietTag>();
  const excludedIds = new Set<string>();
  const unmatchedText: string[] = [];

  for (const raw of restrictions) {
    const key = raw.trim();
    const predefined = PREDEFINED[key];

    if (predefined) {
      predefined.forEach((tag) => excludedTags.add(tag));
      continue;
    }

    const text = normalizeText(key);

    if (!text) {
      continue;
    }

    let matched = false;

    const group = GROUP_SYNONYMS[text];

    if (group) {
      group.forEach((tag) => excludedTags.add(tag));
      matched = true;
    }

    const textWords = words(text);

    for (const ingredient of CATALOG) {
      const tokens = nameWords(ingredient);
      const hit =
        textWords.some((word) => tokens.has(word)) ||
        normalizeText(ingredient.name.es) === text ||
        normalizeText(ingredient.name.en) === text;

      if (hit) {
        excludedIds.add(ingredient.id);
        matched = true;
      }
    }

    if (!matched) {
      unmatchedText.push(key);
    }
  }

  return { excludedTags, excludedIds, unmatchedText };
}

export function isAllowed(
  ingredient: Ingredient,
  rules: RestrictionRules,
): boolean {
  return (
    !rules.excludedIds.has(ingredient.id) &&
    !ingredient.tags.some((tag) => rules.excludedTags.has(tag))
  );
}

/** Catalog the AI may use for this user. */
export function allowedCatalog(rules: RestrictionRules): Ingredient[] {
  return CATALOG.filter((ingredient) => isAllowed(ingredient, rules));
}
