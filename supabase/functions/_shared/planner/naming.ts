import { getIngredient, nutritionOf } from "../catalog.ts";
import type { ModelCall } from "../openai.ts";
import {
  DAYS,
  SLOTS,
  type ComposedMeal,
  type ComposedWeek,
  type Day,
  type Slot,
} from "./types.ts";

/**
 * Dish names that match what is actually on the plate.
 *
 * The AI names each meal while it composes the week, but the budget fitter may
 * later swap an ingredient (beef for lentils, say). A name that still says
 * "beef" would be wrong, so changed meals are renamed from their final
 * ingredients, with a deterministic fallback if the model is unavailable.
 */

export const mealKey = (day: Day, slot: Slot): string => `${day}.${slot}`;

function idSet(meal: ComposedMeal): string {
  return meal.items
    .map((item) => item.id)
    .sort()
    .join(",");
}

/** Keys of meals whose ingredients differ between two versions of the week. */
export function changedMeals(
  before: ComposedWeek,
  after: ComposedWeek,
): string[] {
  const keys: string[] = [];

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      if (idSet(before[day][slot]) !== idSet(after[day][slot])) {
        keys.push(mealKey(day, slot));
      }
    }
  }

  return keys;
}

/** Keys of meals that have no usable name. */
export function unnamedMeals(week: ComposedWeek): string[] {
  const keys: string[] = [];

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const { name } = week[day][slot];

      if (!name.es.trim() || !name.en.trim()) {
        keys.push(mealKey(day, slot));
      }
    }
  }

  return keys;
}

function sentence(parts: string[], and: string): string {
  const lower = parts.map((part, index) =>
    index === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1),
  );

  if (lower.length <= 1) {
    return lower[0] ?? "";
  }

  return `${lower.slice(0, -1).join(", ")} ${and} ${lower[lower.length - 1]}`;
}

/** "Lentejas, arroz blanco y aguacate": the three biggest components. */
export function fallbackName(meal: ComposedMeal): { es: string; en: string } {
  const main = meal.items
    .map((item) => ({ ingredient: getIngredient(item.id), qty: item.qty }))
    .filter(
      (entry) =>
        entry.ingredient !== undefined &&
        entry.ingredient.category !== "condimentos",
    )
    .sort(
      (a, b) =>
        nutritionOf(b.ingredient!, b.qty).kcal -
        nutritionOf(a.ingredient!, a.qty).kcal,
    )
    .slice(0, 3);

  if (main.length === 0) {
    return { es: "Comida", en: "Meal" };
  }

  return {
    es: sentence(
      main.map((entry) => entry.ingredient!.name.es),
      "y",
    ),
    en: sentence(
      main.map((entry) => entry.ingredient!.name.en),
      "and",
    ),
  };
}

// ----------------------------------------------------------------- model call

export const NAMING_SYSTEM_PROMPT = `You name meals for a Colombian meal-planning app.
For each meal you get its exact ingredient list. Give it a short, appetising dish name in Spanish (name_es) and in English (name_en), the way a person would call that plate in Colombia.
The name must describe only the ingredients listed: never mention a food that is not in the list. Respond only with JSON that matches the schema.`;

export function namingResponseFormat(keys: string[]) {
  return {
    type: "json_schema",
    json_schema: {
      name: "meal_names",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["meals"],
        properties: {
          meals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "name_es", "name_en"],
              properties: {
                key: { type: "string", enum: keys },
                name_es: { type: "string" },
                name_en: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

export function buildNamingPrompt(week: ComposedWeek, keys: string[]): string {
  const entries = keys.map((key) => {
    const [day, slot] = key.split(".") as [Day, Slot];
    const meal = week[day][slot];

    return {
      key,
      meal: slot,
      ingredients: meal.items
        .map((item) => getIngredient(item.id)?.name.es)
        .filter(Boolean),
    };
  });

  return JSON.stringify(entries);
}

export function parseNaming(
  raw: unknown,
  keys: ReadonlySet<string>,
): Map<string, { es: string; en: string }> {
  const names = new Map<string, { es: string; en: string }>();

  if (typeof raw !== "object" || raw === null || !("meals" in raw)) {
    return names;
  }

  const { meals } = raw as { meals: unknown };

  if (!Array.isArray(meals)) {
    return names;
  }

  for (const entry of meals) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const { key, name_es, name_en } = entry as Record<string, unknown>;

    if (
      typeof key === "string" &&
      keys.has(key) &&
      typeof name_es === "string" &&
      typeof name_en === "string" &&
      name_es.trim() &&
      name_en.trim()
    ) {
      names.set(key, {
        es: name_es.trim().slice(0, 80),
        en: name_en.trim().slice(0, 80),
      });
    }
  }

  return names;
}

/**
 * Renames the given meals from their final ingredients. Any meal the model
 * cannot name gets the deterministic fallback, so this never fails.
 */
export async function renameMeals(
  week: ComposedWeek,
  keys: string[],
  callModel: ModelCall,
): Promise<ComposedWeek> {
  if (keys.length === 0) {
    return week;
  }

  let fromModel = new Map<string, { es: string; en: string }>();

  const response = await callModel({
    system: NAMING_SYSTEM_PROMPT,
    user: buildNamingPrompt(week, keys),
    responseFormat: namingResponseFormat(keys),
  });

  if (response.content) {
    try {
      fromModel = parseNaming(JSON.parse(response.content), new Set(keys));
    } catch {
      fromModel = new Map();
    }
  }

  const renamed: ComposedWeek = JSON.parse(JSON.stringify(week));

  for (const key of keys) {
    const [day, slot] = key.split(".") as [Day, Slot];
    const meal = renamed[day][slot];

    meal.name = fromModel.get(key) ?? fallbackName(meal);
  }

  return renamed;
}
