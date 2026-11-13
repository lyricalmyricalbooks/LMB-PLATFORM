import { shopCountry } from "../../../lib/shopProfile";

const HOME_CARRIER = { CA: /^canada\s*post\b/i, US: /^(usps|us postal|united states postal)\b/i };

/**
 * Keep up to five distinct methods of the shop's own post office (Canada Post, or USPS for an American shop) at their
 * cheapest quoted amounts.
 */
export function canadaPostRates<T extends { name: string; price: number }>(rates: T[], country: "CA" | "US" = "CA"): T[] {
  return rates
    .filter(rate => HOME_CARRIER[country].test(rate.name.trim()) && Number.isFinite(rate.price) && rate.price >= 0)
    .sort((a, b) => a.price - b.price)
    .filter((rate, index, sorted) => sorted.findIndex(other => other.name === rate.name) === index)
    .slice(0, 5);
}

// The shop's own post office first; when it has no service for the address (e.g. some US
// destinations), offer the cheapest other live carriers rather than nothing.
// The server accepts any live carrier quote it re-fetches, so these still charge correctly.
export function liveCheckoutRates<T extends { name: string; price: number }>(rates: T[], country: "CA" | "US" = shopCountry()): T[] {
  const preferred = canadaPostRates(rates, country);
  if (preferred.length) return preferred;
  return rates
    .filter(rate => String(rate.name || "").trim() && Number.isFinite(rate.price) && rate.price >= 0)
    .sort((a, b) => a.price - b.price)
    .filter((rate, index, sorted) => sorted.findIndex(other => other.name === rate.name) === index)
    .slice(0, 5);
}
