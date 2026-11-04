import {
  STATIC_CATALOG,
  type Catalog,
  type DietTag,
  type Ingredient,
} from "../catalog.ts";
import {
  FOOD_ALIASES,
  FOOD_GROUPS,
  GENERIC_WORDS,
  NOT_WORDS,
} from "../foodNames.ts";

/**
 * Turns the user's restrictions into catalog rules.
 *
 * Because the AI can only pick catalog ids, and forbidden ingredients are
 * removed from the list it sees, a restriction is enforced by construction
 * and checked again exactly (by tag / id), never by guessing from text.
 *
 * Free text is understood the way people in Colombia say it: regional names
 * ("auyama", "cuajada"), plural and singular, group words ("granos",
 * "verduras") and small typos. See foodNames.ts for the vocabulary.
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

/** A word and its likely singular, so "tomates" finds "tomate". */
function variants(word: string): string[] {
  const result = new Set([word]);

  if (word.endsWith("es") && word.length > 4) {
    result.add(word.slice(0, -2));
  }

  if (word.endsWith("s") && word.length > 3) {
    result.add(word.slice(0, -1));
  }

  return [...result];
}

function nameWords(ingredient: Ingredient): Set<string> {
  const tokens = new Set<string>();
  const skipped = new Set(NOT_WORDS[ingredient.id] ?? []);
  const catalogNames = [
    ingredient.name.es,
    ingredient.name.en,
    ingredient.id.replace(/_/g, " "),
  ];

  for (const source of catalogNames) {
    for (const word of words(source)) {
      if (!GENERIC_WORDS.has(word) && !skipped.has(word)) {
        variants(word).forEach((variant) => tokens.add(variant));
      }
    }
  }

  // Aliases are chosen on purpose, so they are never filtered.
  for (const alias of FOOD_ALIASES[ingredient.id] ?? []) {
    for (const word of words(alias)) {
      if (!skipped.has(word)) {
        variants(word).forEach((variant) => tokens.add(variant));
      }
    }
  }

  return tokens;
}

interface NameIndex {
  tokensById: Map<string, Set<string>>;
  allTokens: string[];
}

const NAME_INDEXES = new WeakMap<Catalog, NameIndex>();

/** Name words of every food, built once per catalog. */
function nameIndex(catalog: Catalog): NameIndex {
  let index = NAME_INDEXES.get(catalog);

  if (!index) {
    const tokensById = new Map(
      catalog.all.map((ingredient) => [ingredient.id, nameWords(ingredient)]),
    );

    index = {
      tokensById,
      allTokens: [
        ...new Set([...tokensById.values()].flatMap((tokens) => [...tokens])),
      ],
    };
    NAME_INDEXES.set(catalog, index);
  }

  return index;
}

/** Edit distance, stopping early once it is clearly above `limit`. */
function withinDistance(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) {
    return false;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > limit) {
      return false;
    }

    previous = current;
  }

  return previous[b.length] <= limit;
}

/** Fixes a misspelled word ("aguacte" -> "aguacate"), or returns null. */
function correctTypo(word: string, catalog: Catalog): string | null {
  if (word.length < 5) {
    return null;
  }

  const limit = word.length >= 8 ? 2 : 1;

  return (
    nameIndex(catalog).allTokens.find(
      (token) => token.length >= 5 && withinDistance(word, token, limit),
    ) ?? null
  );
}

export interface RestrictionRules {
  /** Tags no ingredient may carry. */
  excludedTags: Set<DietTag>;
  /** Ingredients excluded because the user named them in free text. */
  excludedIds: Set<string>;
  /** Free-text entries that matched nothing in the catalog (kept for the prompt). */
  unmatchedText: string[];
}

interface Match {
  tags: Set<DietTag>;
  ids: Set<string>;
  matched: boolean;
}

/** What one free-text entry means in catalog terms. */
function matchFreeText(
  raw: string,
  catalog: Catalog,
  retried = false,
): Match {
  const tags = new Set<DietTag>();
  const ids = new Set<string>();
  const text = normalizeText(raw);

  if (!text) {
    return { tags, ids, matched: false };
  }

  const group = variants(text)
    .map((variant) => FOOD_GROUPS[variant])
    .find(Boolean);

  if (group) {
    group.tags?.forEach((tag) => tags.add(tag));
    group.ids?.forEach((id) => ids.add(id));

    if (group.category) {
      catalog.all.filter(
        (ingredient) => ingredient.category === group.category,
      ).forEach((ingredient) => ids.add(ingredient.id));
    }
  }

  const textWords = words(text);
  const { tokensById } = nameIndex(catalog);

  // "cebolla larga" means the scallion, not every onion: prefer foods that
  // match all the words, and fall back to any word ("pollo asado").
  const hits = (word: string, id: string) =>
    variants(word).some((variant) => tokensById.get(id)?.has(variant));
  const byAll = catalog.all.filter(
    (ingredient) =>
      textWords.length > 0 &&
      textWords.every((word) => hits(word, ingredient.id)),
  );
  const byAny = catalog.all.filter((ingredient) =>
    textWords.some((word) => hits(word, ingredient.id)),
  );
  const exact = catalog.all.filter(
    (ingredient) =>
      normalizeText(ingredient.name.es) === text ||
      normalizeText(ingredient.name.en) === text,
  );

  [...(byAll.length > 0 ? byAll : byAny), ...exact].forEach((ingredient) =>
    ids.add(ingredient.id),
  );

  if (tags.size > 0 || ids.size > 0) {
    return { tags, ids, matched: true };
  }

  // Last resort: a typo. Retry once with each word corrected.
  if (!retried) {
    const corrected = textWords.map((word) => correctTypo(word, catalog) ?? word);

    if (corrected.some((word, index) => word !== textWords[index])) {
      return matchFreeText(corrected.join(" "), catalog, true);
    }
  }

  return { tags, ids, matched: false };
}

export function buildRestrictionRules(
  restrictions: string[],
  catalog: Catalog = STATIC_CATALOG,
): RestrictionRules {
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

    if (!normalizeText(key)) {
      continue;
    }

    const match = matchFreeText(key, catalog);
    match.tags.forEach((tag) => excludedTags.add(tag));
    match.ids.forEach((id) => excludedIds.add(id));

    if (!match.matched) {
      unmatchedText.push(key);
    }
  }

  return { excludedTags, excludedIds, unmatchedText };
}

/**
 * What one free-text entry will exclude, for showing the user how we
 * understood it before they generate a plan.
 */
export function explainRestriction(
  raw: string,
  catalog: Catalog = STATIC_CATALOG,
): {
  matched: boolean;
  ingredients: Ingredient[];
} {
  const match = matchFreeText(raw, catalog);

  return {
    matched: match.matched,
    ingredients: catalog.all.filter(
      (ingredient) =>
        match.ids.has(ingredient.id) ||
        ingredient.tags.some((tag) => match.tags.has(tag)),
    ),
  };
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
export function allowedCatalog(
  rules: RestrictionRules,
  catalog: Catalog = STATIC_CATALOG,
): Ingredient[] {
  return catalog.all.filter((ingredient) => isAllowed(ingredient, rules));
}
