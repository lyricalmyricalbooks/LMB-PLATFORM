/** Keep up to five distinct Canada Post methods at their cheapest quoted amounts. */
export function canadaPostRates<T extends { name: string; price: number }>(rates: T[]): T[] {
  return rates
    .filter(rate => /^canada\s*post\b/i.test(rate.name.trim()) && Number.isFinite(rate.price) && rate.price >= 0)
    .sort((a, b) => a.price - b.price)
    .filter((rate, index, sorted) => sorted.findIndex(other => other.name === rate.name) === index)
    .slice(0, 5);
}

// Canada Post first; when it has no service for the address (e.g. some US
// destinations), offer the cheapest other live carriers rather than nothing.
// The server accepts any live carrier quote it re-fetches, so these still charge correctly.
export function liveCheckoutRates<T extends { name: string; price: number }>(rates: T[]): T[] {
  const preferred = canadaPostRates(rates);
  if (preferred.length) return preferred;
  return rates
    .filter(rate => String(rate.name || "").trim() && Number.isFinite(rate.price) && rate.price >= 0)
    .sort((a, b) => a.price - b.price)
    .filter((rate, index, sorted) => sorted.findIndex(other => other.name === rate.name) === index)
    .slice(0, 5);
}
