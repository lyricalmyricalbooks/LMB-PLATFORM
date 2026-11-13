// A Canadian shop shows and saves every weight metric: grams, and kilograms from 1 kg up.
// An American shop (shopCountry "US") keeps ounces and pounds as typed and shows weights that way.
// Older catalog values typed in lb/oz still parse (parseWeightGrams), so shipping prices
// stay the same; they are only shown, and re-saved, in grams.
import { parseWeightGrams } from "./shippingEngine";
import { shopCountry } from "../../../lib/shopProfile";

const trim = (n: number, places: number) => String(Number(n.toFixed(places)));

/** 450 → "450 g", 1250 → "1.25 kg" (an American shop: "15.9 oz", "2.76 lb"); "" for no weight. */
export function formatGrams(grams: number | null | undefined, country: string = shopCountry()): string {
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) return "";
  if (country === "US") {
    const oz = g / 28.3495;
    return oz >= 16 ? `${trim(oz / 16, 2)} lb` : `${trim(oz, 1)} oz`;
  }
  if (g >= 1000) return `${trim(g / 1000, 2)} kg`;
  return `${trim(g, g < 10 ? 1 : 0)} g`;
}

/** A stored catalog weight shown metric: "1 lb" → "454 g", "0.5 kg" stays. Unreadable text is returned unchanged. */
export function metricWeight(raw: unknown, country: string = shopCountry()): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const grams = parseWeightGrams(text);
  if (grams === null) return text;
  if (country === "US") {
    const typed = text.toLowerCase().match(/^([\d.]+)\s*(lb|oz)/);
    return typed ? `${trim(parseFloat(typed[1]), 3)} ${typed[2]}` : formatGrams(grams, country);
  }
  if (/^[\d.]+\s*(kg|g)?$/i.test(text)) return /k/i.test(text) ? `${trim(grams / 1000, 3)} kg` : `${trim(grams, 1)} g`;
  return formatGrams(grams);
}

/** Lb/oz values converted to whole grams for saving ("1 lb" → "454 g"); metric and unreadable values unchanged. */
export function metricWeightValue(raw: unknown, country: string = shopCountry()): string {
  const text = String(raw ?? "").trim();
  if (country === "US" || !/(lb|oz)/i.test(text)) return text;
  const grams = parseWeightGrams(text);
  return grams === null ? text : `${Math.round(grams)} g`;
}
