import { MIN_RECIPES_PER_SLOT } from "../recipes/eligibility.ts";
import { SLOTS, type Slot } from "./types.ts";

/**
 * Fields of the plan_budget_too_low and plan_restrictions_too_strict events.
 * Codes and coarse numbers only, like every logEvent: never the budget
 * itself, restrictions, profile or user data.
 */

/** Where budget_too_low was decided: the 130 000 COP floor, the optimizer or the last guard. */
export type BudgetStep = "floor" | "optimizer" | "assemble";

/** Households above this size are logged as this size (rare values could single someone out). */
const MAX_LOGGED_HOUSEHOLD = 6;

/** The budget as a share of the one needed, in quarters: "lt_0.25" … "0.75_1", "ge_1" or "unknown". */
export function budgetRatioBucket(current: number, required: number | null): string {
  if (required === null || !(required > 0) || !Number.isFinite(current)) return "unknown";
  const ratio = current / required;
  if (ratio >= 1) return "ge_1";
  if (ratio >= 0.75) return "0.75_1";
  if (ratio >= 0.5) return "0.5_0.75";
  if (ratio >= 0.25) return "0.25_0.5";
  return "lt_0.25";
}

export function budgetTooLowFields(
  step: BudgetStep,
  householdSize: number,
  current: number,
  required: number | null,
): Record<string, string | number> {
  return {
    step,
    household: Math.min(Math.max(Math.trunc(householdSize), 0), MAX_LOGGED_HOUSEHOLD),
    budget_ratio: budgetRatioBucket(current, required),
  };
}

/** Meals without enough weekday recipes (slot codes in order), how many, and the lowest count. */
export function restrictionsTooStrictFields(available: Record<Slot, number>): Record<string, string | number> {
  const short = SLOTS.filter((slot) => available[slot] < MIN_RECIPES_PER_SLOT);
  return {
    slots: short.join(","),
    short_slots: short.length,
    min_recipes: Math.min(...SLOTS.map((slot) => available[slot])),
  };
}
