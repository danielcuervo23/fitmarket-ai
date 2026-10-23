import { auth } from "./auth";
import { common } from "./common";
import { errors } from "./errors";

// Add each new feature block here: it is merged into both languages and the
// MessageKey type is derived from the Spanish dictionary.
export const es = { ...common.es, ...errors.es, ...auth.es } as const;
export const en = { ...common.en, ...errors.en, ...auth.en } as const;

export type MessageKey = keyof typeof es;
