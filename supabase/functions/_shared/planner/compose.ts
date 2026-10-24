import { getIngredient, nutritionOf, type Ingredient } from "../catalog.ts";
import type { NutritionTargets } from "../nutrition.ts";
import {
  DAYS,
  ITEMS_PER_MEAL,
  SLOTS,
  type ComposedMeal,
  type ComposedWeek,
  type Day,
  type Slot,
} from "./types.ts";

/**
 * What the AI is asked for: only WHICH catalog ingredients go in each meal and
 * HOW MUCH. Everything numeric about the plan (calories, cost, shopping list)
 * is computed from the catalog afterwards.
 */

// ---------------------------------------------------------------- JSON schema

export function composerResponseFormat(allowedIds: string[]) {
  const item = {
    type: "object",
    additionalProperties: false,
    required: ["id", "qty"],
    properties: {
      id: { type: "string", enum: allowedIds },
      qty: { type: "number" },
    },
  };

  const meal = {
    type: "object",
    additionalProperties: false,
    required: ["name_es", "name_en", "items"],
    properties: {
      name_es: { type: "string" },
      name_en: { type: "string" },
      items: { type: "array", items: item },
    },
  };

  const day = {
    type: "object",
    additionalProperties: false,
    required: ["day", ...SLOTS],
    properties: {
      day: { type: "string", enum: [...DAYS] },
      desayuno: meal,
      almuerzo: meal,
      cena: meal,
      snacks: meal,
    },
  };

  return {
    type: "json_schema",
    json_schema: {
      name: "weekly_composition",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["days"],
        properties: { days: { type: "array", items: day } },
      },
    },
  };
}

// ------------------------------------------------------------------- parsing

interface RawMeal {
  name_es: string;
  name_en: string;
  items: { id: string; qty: number }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMeal(value: unknown): RawMeal | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  // Dish names are cosmetic: a missing or very long one is cleaned up, never
  // a reason to throw the whole week away (a name is rebuilt later if empty).
  const cleanName = (name: unknown): string =>
    typeof name === "string" ? name.trim().slice(0, 80) : "";

  const items: RawMeal["items"] = [];

  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.qty !== "number"
    ) {
      return null;
    }

    items.push({ id: item.id, qty: item.qty });
  }

  return {
    name_es: cleanName(value.name_es),
    name_en: cleanName(value.name_en),
    items,
  };
}

export type ComposeIssue =
  | { code: "invalid_format" }
  | { code: "wrong_days" }
  | { code: "item_count"; day: Day; slot: Slot }
  | { code: "unknown_ingredient"; id: string };

/**
 * Tidies one meal's lines: drops zero/negative/NaN amounts, merges repeated
 * ingredients, and keeps at most ITEMS_PER_MEAL.max lines (the ones that
 * contribute the most calories; seasonings go first).
 */
export function cleanItems(
  items: { id: string; qty: number }[],
): { id: string; qty: number }[] {
  const merged = new Map<string, number>();

  for (const item of items) {
    if (Number.isFinite(item.qty) && item.qty > 0) {
      merged.set(item.id, (merged.get(item.id) ?? 0) + item.qty);
    }
  }

  const lines = [...merged].map(([id, qty]) => ({ id, qty }));

  if (lines.length <= ITEMS_PER_MEAL.max) {
    return lines;
  }

  const weight = (line: { id: string; qty: number }) => {
    const ingredient = getIngredient(line.id);

    return ingredient ? nutritionOf(ingredient, line.qty).kcal : 0;
  };

  return lines
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, ITEMS_PER_MEAL.max);
}

/** Parses and structurally validates the AI answer. */
export function parseComposition(
  raw: unknown,
  allowedIds: ReadonlySet<string>,
): { week: ComposedWeek | null; issue: ComposeIssue | null } {
  if (!isRecord(raw) || !Array.isArray(raw.days)) {
    return { week: null, issue: { code: "invalid_format" } };
  }

  const byDay = new Map<string, Record<string, unknown>>();

  for (const entry of raw.days) {
    if (!isRecord(entry) || typeof entry.day !== "string") {
      return { week: null, issue: { code: "invalid_format" } };
    }

    byDay.set(entry.day, entry);
  }

  if (raw.days.length !== 7 || byDay.size !== 7) {
    return { week: null, issue: { code: "wrong_days" } };
  }

  const week = {} as ComposedWeek;

  for (const day of DAYS) {
    const entry = byDay.get(day);

    if (!entry) {
      return { week: null, issue: { code: "wrong_days" } };
    }

    const meals = {} as Record<Slot, ComposedMeal>;

    for (const slot of SLOTS) {
      const meal = readMeal(entry[slot]);

      if (!meal) {
        // Unreadable meal: repaired below like an empty one.
        continue;
      }

      // An ingredient that was never offered (forbidden by the user's
      // restrictions) must not slip through: reject so the retry can fix it.
      const unknown = meal.items.find((item) => !allowedIds.has(item.id));

      if (unknown) {
        return {
          week: null,
          issue: { code: "unknown_ingredient", id: unknown.id },
        };
      }

      const items = cleanItems(meal.items);

      if (items.length < ITEMS_PER_MEAL.min) {
        continue;
      }

      meals[slot] = {
        name: { es: meal.name_es, en: meal.name_en },
        items,
      };
    }

    week[day] = meals;
  }

  const gap = repairMissingMeals(week);

  if (gap) {
    return { week: null, issue: { code: "item_count", ...gap } };
  }

  return { week, issue: null };
}

/**
 * A meal the AI left empty (or with only invalid amounts) is filled with the
 * same meal of the nearest day that has one, so a single slip never costs the
 * user the whole plan. Quality checks still judge the repaired week. Returns
 * the first slot that cannot be repaired because no day has it.
 */
function repairMissingMeals(week: ComposedWeek): { day: Day; slot: Slot } | null {
  for (const slot of SLOTS) {
    for (let index = 0; index < DAYS.length; index += 1) {
      const day = DAYS[index];

      if (week[day][slot]) {
        continue;
      }

      let donor: ComposedMeal | undefined;

      for (let offset = 1; offset < DAYS.length && !donor; offset += 1) {
        donor =
          week[DAYS[(index + offset) % DAYS.length]][slot] ??
          week[DAYS[(index - offset + DAYS.length) % DAYS.length]][slot];
      }

      if (!donor) {
        return { day, slot };
      }

      week[day][slot] = { name: { ...donor.name }, items: donor.items.map((item) => ({ ...item })) };
    }
  }

  return null;
}

// -------------------------------------------------------------------- prompt

export interface ComposerInput {
  targets: NutritionTargets;
  /** Weekly budget for ONE person, COP. */
  budgetPerPersonCop: number;
  goals: string[];
  allowed: Ingredient[];
  /** Free-text foods to avoid that are not in the catalog (informational). */
  unmatchedText: string[];
  /** What went wrong last time, so the retry can fix it. */
  feedback?: string;
}

export const COMPOSER_SYSTEM_PROMPT = `You are a nutritionist and meal planner for people in Colombia.
You compose a 7-day meal plan for ONE person using ONLY the ingredient ids you are given. Never invent ids.

Rules:
- Return 7 days (lun, mar, mie, jue, vie, sab, dom). Each day has four meals: desayuno (breakfast), almuerzo (lunch), cena (dinner), snacks.
- Each meal lists its ingredients with a quantity: the main components plus any small seasonings, at most 8 lines (snacks 1-3). Quantities are DRY / RAW weights as bought: grams for "g" foods, millilitres for "ml" foods, and a whole count for "unit" foods (eggs, fruit).
- The dish name (name_es / name_en) must describe exactly the ingredients you list for that meal: never name an ingredient that is not in the list.
- Aim for the daily calorie and protein targets. Quantities will be fine-tuned automatically, so focus on a good, realistic combination of foods.
- Cook like people do in Colombia: arepas, rice with lentils or beans, eggs with tomato and onion, sancocho-style soups, potato, plantain, fruit with oatmeal, etc. Give each meal a short, appetising dish name in Spanish (name_es) and English (name_en).
- Use a sensible variety (roughly 20-35 different ingredients in the week), reusing staples across meals to keep the shopping list short and cheap. Do not repeat the exact same dinner more than twice.
- Respect the weekly budget: prefer cheap sources of protein and calories (legumes, eggs, rice, potato, oats, seasonal fruit and vegetables) and use expensive items (salmon, nuts, olive oil, quinoa) sparingly or not at all when the budget is tight.
- Small seasoning amounts (garlic, cilantro, salt, oil) belong in the meals that use them; keep them small (oil 5-15 ml, salt 1-3 g, garlic 3-10 g).
- Respond only with JSON that matches the schema.`;

function formatCatalogLine(ingredient: Ingredient): string {
  const per = ingredient.unit === "unit" ? "unit" : `100${ingredient.unit}`;
  const cost =
    ingredient.unit === "unit"
      ? ingredient.price
      : Math.round(ingredient.price * 100);

  return [
    ingredient.id,
    ingredient.name.es,
    ingredient.unit,
    `${ingredient.per100.kcal}kcal/100`,
    `${ingredient.per100.protein}gP/100`,
    `${cost}COP/${per}`,
  ].join(" | ");
}

export function buildComposerUserPrompt(input: ComposerInput): string {
  const { targets } = input;
  const lines = [
    `Daily targets for one person: about ${targets.kcal} kcal and at least ${targets.proteinG} g of protein.`,
    `Weekly food budget for one person: ${input.budgetPerPersonCop} COP.`,
    `Goals: ${input.goals.join(", ") || "eat healthy"}.`,
    ...(input.goals.includes("save")
      ? [
          "The user wants to SAVE MONEY: keep the cost per meal as low as possible, build most meals on legumes, eggs, rice, potato, plantain, oats and seasonal produce, and avoid premium items.",
        ]
      : []),
    "",
    "Allowed ingredients (id | name | unit | kcal per 100 | protein per 100 | price):",
    ...input.allowed.map(formatCatalogLine),
  ];

  if (input.unmatchedText.length > 0) {
    lines.push(
      "",
      `The user also dislikes: ${input.unmatchedText.join(", ")}. Do not build any meal around these.`,
    );
  }

  if (input.feedback) {
    lines.push("", `Fix this problem from your previous answer: ${input.feedback}`);
  }

  return lines.join("\n");
}
