// Suggested wording for the Material and Care boxes, by kind of product (plan 12.17, 3 November 2026).
// The two boxes stay the same for every product that is not a book; what changes is the label and example the owner
// sees (a ring asks for metal and stones, a record for its pressing) and, for clothing, shoes and jewellery, a few
// one-click starters for the care line. Starters only fill an empty box. The owner edits all of it.
import type { ProductKind } from "../../shared/productOptions";

type Hint = { materialLabel: string; materialExample: string; careExample: string; careStarters: string[] };

const HINTS: Partial<Record<ProductKind, Hint>> = {
  clothing: {
    materialLabel: "Fabric", materialExample: "e.g. 100% organic cotton", careExample: "e.g. Machine wash cold",
    careStarters: [
      "Machine wash cold with like colours. Tumble dry low. Cool iron if needed.",
      "Hand wash cold, do not wring. Lay flat to dry.",
      "Dry clean only.",
    ],
  },
  shoes: {
    materialLabel: "Upper and sole", materialExample: "e.g. Leather upper, rubber sole", careExample: "e.g. Wipe clean with a damp cloth",
    careStarters: [
      "Wipe clean with a damp cloth. Air dry away from heat.",
      "Brush off dirt, then treat with a leather conditioner now and then.",
    ],
  },
  jewelry: {
    materialLabel: "Metal and stones", materialExample: "e.g. Sterling silver, freshwater pearl", careExample: "e.g. Keep dry and store in a pouch",
    careStarters: [
      "Keep dry and remove before swimming or bathing. Store in a pouch.",
      "Polish gently with a soft cloth. Avoid perfume and harsh cleaners.",
    ],
  },
  art: { materialLabel: "Medium", materialExample: "e.g. Risograph print on 120 gsm paper", careExample: "e.g. Keep out of direct sunlight", careStarters: [] },
  music: { materialLabel: "Format and pressing", materialExample: "e.g. 12 inch vinyl, 33 rpm, 140 g", careExample: "e.g. Store upright, away from heat", careStarters: [] },
};

const DEFAULT: Hint = { materialLabel: "Material", materialExample: "e.g. 100% organic cotton", careExample: "e.g. Machine wash cold", careStarters: [] };

export const kindHint = (kind: ProductKind | string | undefined): Hint => HINTS[kind as ProductKind] || DEFAULT;
