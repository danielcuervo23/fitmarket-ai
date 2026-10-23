import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type DietaryRestrictionId =
  | "lactose"
  | "gluten"
  | "pork"
  | "fish"
  | "shellfish"
  | "peanut"
  | "nuts"
  | "vegetarian"
  | "vegan";

export const DIETARY_RESTRICTION_IDS: readonly DietaryRestrictionId[] = [
  "lactose",
  "gluten",
  "pork",
  "fish",
  "shellfish",
  "peanut",
  "nuts",
  "vegetarian",
  "vegan",
] as const;

export const DIETARY_RESTRICTION_OPTIONS: {
  id: DietaryRestrictionId;
  emoji: string;
  label: string;
  color: string;
  bg: string;
}[] = [
  { id: "lactose", emoji: "🥛", label: "Lactosa", color: "#2563EB", bg: "#EFF6FF" },
  { id: "gluten", emoji: "🌾", label: "Gluten", color: "#D97706", bg: "#FFFBEB" },
  { id: "pork", emoji: "🐷", label: "Cerdo", color: "#EC4899", bg: "#FDF2F8" },
  { id: "fish", emoji: "🐟", label: "Pescado", color: "#0891B2", bg: "#F0F9FF" },
  {
    id: "shellfish",
    emoji: "🦐",
    label: "Mariscos",
    color: "#DC2626",
    bg: "#FEF2F2",
  },
  { id: "peanut", emoji: "🥜", label: "Maní", color: "#92400E", bg: "#FFFBEB" },
  { id: "nuts", emoji: "🌰", label: "Nueces", color: "#78350F", bg: "#FFFBEB" },
  {
    id: "vegetarian",
    emoji: "🥗",
    label: "Vegetariano",
    color: "#16A34A",
    bg: "#F0FDF4",
  },
  { id: "vegan", emoji: "🌱", label: "Vegano", color: "#15803D", bg: "#DCFCE7" },
];

const PREDEFINED_IDS = new Set<string>(DIETARY_RESTRICTION_IDS);

export function isDietaryRestrictionId(value: string): value is DietaryRestrictionId {
  return PREDEFINED_IDS.has(value);
}

/** Parsea el campo libre "Otros alimentos" (coma-separado). */
export function parseOtherFoodsText(otherText: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of otherText.split(",")) {
    const normalized = part.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function dedupeDietaryRestrictions(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = isDietaryRestrictionId(item)
      ? item
      : item.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(isDietaryRestrictionId(item) ? item : normalized);
  }

  return result;
}

export function normalizeDietaryRestrictionsFromDb(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const expanded: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();

    if (!trimmed) {
      continue;
    }

    if (isDietaryRestrictionId(trimmed)) {
      expanded.push(trimmed);
      continue;
    }

    expanded.push(...parseOtherFoodsText(trimmed));
  }

  return dedupeDietaryRestrictions(expanded);
}

export function parseStoredDietaryRestrictions(stored: string[]): {
  selectedIds: DietaryRestrictionId[];
  otherText: string;
} {
  const selectedIds: DietaryRestrictionId[] = [];
  const customParts: string[] = [];

  for (const item of stored) {
    if (isDietaryRestrictionId(item)) {
      selectedIds.push(item);
      continue;
    }

    customParts.push(...parseOtherFoodsText(item));
  }

  return {
    selectedIds: [...new Set(selectedIds)],
    otherText: [...new Set(customParts)].join(", "),
  };
}

export function buildStoredDietaryRestrictions(
  selectedIds: string[],
  otherText: string,
): string[] {
  const restrictions: string[] = [
    ...new Set(selectedIds.filter(isDietaryRestrictionId)),
  ];

  for (const item of parseOtherFoodsText(otherText)) {
    restrictions.push(item);
  }

  return dedupeDietaryRestrictions(restrictions);
}

function getDietaryRestrictionsErrorMessage(error: PostgrestError): string {
  const message = error.message.toLowerCase();

  if (error.code === "42501" || message.includes("row-level security")) {
    return "No tienes permiso para guardar tus restricciones. Inicia sesión e intenta de nuevo.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return "No pudimos guardar tus restricciones. Intenta de nuevo en unos segundos.";
}

export async function saveDietaryRestrictions(
  restrictions: string[],
): Promise<{ error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Debes iniciar sesión para guardar tus restricciones." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ dietary_restrictions: restrictions })
    .eq("id", user.id);

  if (error) {
    return { error: getDietaryRestrictionsErrorMessage(error) };
  }

  return { error: null };
}
