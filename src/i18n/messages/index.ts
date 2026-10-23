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
} as const;
export const en = {
  ...common.en,
  ...errors.en,
  ...auth.en,
  ...setup.en,
} as const;

export type MessageKey = keyof typeof es;
