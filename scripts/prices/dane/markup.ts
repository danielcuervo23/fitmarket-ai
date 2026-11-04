// Retail markup over the DANE SIPSA wholesale price (Centroabastos).
//
// APPROXIMATIONS, not measurements. SIPSA publishes what wholesalers charge;
// a supermarket shelf is dearer. The factors below are rough, rounded margins
// of a Colombian supermarket over wholesale, chosen so the result sits next to
// the shelf prices we sampled (data/price-samples). Every figure shown to a
// user from this source is labelled "Aproximado" and later replaced by real
// shelf prices (store readers, user reports) when they exist. Calibrate with
// those samples; do not read these numbers as official statistics.
export const RETAIL_MARKUP = {
  /** Fruit, vegetables and tubers: high waste and handling, the widest margin. */
  fresco: 1.35,
  /** Eggs and fish (fresh or canned): moderate margin. */
  proteina: 1.2,
  /** Packaged staples (grains, pasta, sugar, salt, panela): the thinnest margin. */
  abarrotes: 1.15,
} as const;

export type MarkupGroup = keyof typeof RETAIL_MARKUP;

export const retailPrice = (wholesale: number, group: MarkupGroup): number => wholesale * RETAIL_MARKUP[group];
