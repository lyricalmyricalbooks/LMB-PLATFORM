import { findCountry } from "./shippingZones";
export type CartDestination = { country: string; postalCode: string };
const KEY = "lm-cart-destination-v1";
export function readCartDestination(): CartDestination | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved && typeof saved.country === "string" && saved.country.length <= 100 && typeof saved.postalCode === "string" && saved.postalCode.length <= 20 && saved.country.trim() && saved.postalCode.trim()) return saved;
  } catch { /* Storage can be unavailable. */ }
  return null;
}
export function saveCartDestination(destination: CartDestination) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ country: destination.country.trim(), postalCode: destination.postalCode.trim() })); } catch { /* Checkout still works without storage. */ }
}

/** Preserve the preview destination; reuse saved street details only for that destination. */
export function prefillCartAddress<T extends Record<string, string>>(current: T, source: any, destination: CartDestination | null): T {
  const address = source || {};
  if (destination) {
    const country = findCountry(address.country || "")?.code;
    const postal = (value: string) => String(value || "").replace(/\s/g, "").toUpperCase();
    if (!country || country !== findCountry(current.country || destination.country)?.code || postal(address.zip) !== postal(current.zip || destination.postalCode)) return current;
    return Object.fromEntries(Object.keys(current).map(key => [key, current[key] || address[key] || ""])) as T;
  }
  return Object.fromEntries(Object.keys(current).map(key => [key, address[key] || current[key] || ""])) as T;
}
