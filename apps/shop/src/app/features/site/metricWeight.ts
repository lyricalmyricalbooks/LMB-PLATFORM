// Every weight the shop shows or saves is metric: grams, and kilograms from 1 kg up.
// Older catalog values typed in lb/oz still parse (parseWeightGrams), so shipping prices
// stay the same; they are only shown, and re-saved, in grams.
import { parseWeightGrams } from "./shippingEngine";

const trim = (n: number, places: number) => String(Number(n.toFixed(places)));

/** 450 → "450 g", 1250 → "1.25 kg"; "" for no weight. */
export function formatGrams(grams: number | null | undefined): string {
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) return "";
  if (g >= 1000) return `${trim(g / 1000, 2)} kg`;
  return `${trim(g, g < 10 ? 1 : 0)} g`;
}

/** A stored catalog weight shown metric: "1 lb" → "454 g", "0.5 kg" stays. Unreadable text is returned unchanged. */
export function metricWeight(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const grams = parseWeightGrams(text);
  if (grams === null) return text;
  if (/^[\d.]+\s*(kg|g)?$/i.test(text)) return /k/i.test(text) ? `${trim(grams / 1000, 3)} kg` : `${trim(grams, 1)} g`;
  return formatGrams(grams);
}

/** Lb/oz values converted to whole grams for saving ("1 lb" → "454 g"); metric and unreadable values unchanged. */
export function metricWeightValue(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!/(lb|oz)/i.test(text)) return text;
  const grams = parseWeightGrams(text);
  return grams === null ? text : `${Math.round(grams)} g`;
}
