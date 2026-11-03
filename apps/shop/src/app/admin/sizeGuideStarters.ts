// A starting size guide for clothing and shoes (3 November 2026). The owner edits it; it is only offered when the guide
// is empty, in the product editor next to the Size guide box. Other kinds have none. Measurements in inches with
// centimetres alongside: typical adult sizes, a starting point and not a promise about how the shop's own pieces fit.
import type { ProductKind } from "../../shared/productOptions";

const CLOTHING = [
  "Size · Chest · Length",
  "XS · 32–34 in (81–86 cm) · 26 in (66 cm)",
  "S · 35–37 in (89–94 cm) · 27 in (69 cm)",
  "M · 38–40 in (97–102 cm) · 28 in (71 cm)",
  "L · 41–43 in (104–109 cm) · 29 in (74 cm)",
  "XL · 44–46 in (112–117 cm) · 30 in (76 cm)",
  "Measured flat. If you are between sizes, choose the larger one.",
].join("\n");

const SHOES = [
  "US · UK · EU · Foot length",
  "6 · 5.5 · 39 · 9.4 in (24 cm)",
  "7 · 6.5 · 40 · 9.7 in (24.7 cm)",
  "8 · 7.5 · 41 · 10 in (25.4 cm)",
  "9 · 8.5 · 42 · 10.3 in (26.2 cm)",
  "10 · 9.5 · 43 · 10.6 in (27 cm)",
  "11 · 10.5 · 44 · 11 in (27.9 cm)",
  "Measure your foot from heel to longest toe and match it to the foot length.",
].join("\n");

/** The starter text for a kind, or "" when it has none (a book, for one). */
export function sizeGuideStarter(kind: ProductKind | string | undefined): string {
  if (kind === "clothing") return CLOTHING;
  if (kind === "shoes") return SHOES;
  return "";
}
