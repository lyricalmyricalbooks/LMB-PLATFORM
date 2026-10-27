// Weight text → grams, for the shop and the Functions (src/shared/CLAUDE.md). Lives on its own so the bag
// (promotions.ts, box-set weights) can use it without pulling the shipping engine and its country list into the
// shop's first download. shippingEngine.ts re-exports it.

// "0.5kg" | "300 g" | "1.2lb" | "8oz" | 300 -> grams (null when unparseable).
export function parseWeightGrams(raw: any): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const m = String(raw).trim().toLowerCase().match(/^([\d.]+)\s*(kg|g|lbs?|oz)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const unit = m[2] || "g";
  if (unit === "kg") return v * 1000;
  if (unit.startsWith("lb")) return v * 453.592;
  if (unit === "oz") return v * 28.3495;
  return v;
}
