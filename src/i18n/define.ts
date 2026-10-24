/**
 * Declares one block of translations. Both languages must have exactly the
 * same keys: a missing or extra key is a compile error, so the app can never
 * ship half-translated.
 */
export function defineMessages<const K extends string>(messages: {
  es: Record<K, string>;
  en: Record<K, string>;
}) {
  return messages;
}
