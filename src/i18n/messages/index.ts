import { common } from "./common";

// Add each new feature block here: it is merged into both languages and the
// MessageKey type is derived from the Spanish dictionary.
export const es = { ...common.es } as const;
export const en = { ...common.en } as const;

export type MessageKey = keyof typeof es;
