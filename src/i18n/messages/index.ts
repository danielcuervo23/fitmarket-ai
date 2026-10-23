import { app } from "./app";
import { auth } from "./auth";
import { common } from "./common";
import { errors } from "./errors";
import { setup } from "./setup";

// Add each new feature block here: it is merged into both languages and the
// MessageKey type is derived from the Spanish dictionary.
export const es = {
  ...common.es,
  ...errors.es,
  ...auth.es,
  ...setup.es,
  ...app.es,
} as const;
export const en = {
  ...common.en,
  ...errors.en,
  ...auth.en,
  ...setup.en,
  ...app.en,
} as const;

export type MessageKey = keyof typeof es;

/** Keys that have `_one` and `_other` variants, used by `plural()`. */
export type PluralBase = "plural.product";
