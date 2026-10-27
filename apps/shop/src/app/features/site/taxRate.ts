import { regionsFor } from "./postalRegion";

/**
 * Picks the tax rate for an address exactly like the server (`matchTaxRate` in
 * functions/index.js), so the tax shown at checkout is the tax charged:
 * country aliases ("CA"/"Canada", "US"/"USA"/"United States") and province or
 * state names vs codes ("Ontario" = "ON") are treated as the same place.
 * A rate for the region wins over a country-wide rate.
 */
const normalizeCountry = (value: unknown) => {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "ca" || clean === "canada") return "ca";
  if (["us", "usa", "united states", "united states of america"].includes(clean)) return "us";
  return clean;
};

const ALL_REGIONS = [...(regionsFor("Canada") || []), ...(regionsFor("United States") || [])];
const regionCode = (value: unknown) => {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return "";
  if (clean.length === 2) return clean.toUpperCase();
  const match = ALL_REGIONS.find(([, name]) => name.toLowerCase() === clean);
  return match ? match[0] : clean.toUpperCase();
};

export function matchTaxRate<T extends { country?: string; region?: string }>(rates: T[], country: unknown, state: unknown): T | null {
  const c = normalizeCountry(country);
  const countryRates = (rates || []).filter(r => normalizeCountry(r.country) === c);
  if (!countryRates.length) return null;
  const code = regionCode(state);
  const regional = code ? countryRates.find(r => String(r.region || "").trim() && regionCode(r.region) === code) : undefined;
  return regional || countryRates.find(r => !String(r.region || "").trim()) || null;
}

/**
 * Provinces/states of each country that has tax rates, where an address would
 * match no rate at all (no regional rate and no country-wide rate) and so be
 * charged no tax. An explicit 0% rate counts as covered.
 */
export function uncoveredTaxRegions(rates: { country?: string; region?: string }[]): { country: string; regions: string[] }[] {
  const out: { country: string; regions: string[] }[] = [];
  for (const [key, label] of [["ca", "Canada"], ["us", "United States"]] as const) {
    const countryRates = (rates || []).filter(r => normalizeCountry(r.country) === key);
    if (!countryRates.length) continue;
    const regions = (regionsFor(label) || []).filter(([code]) => !matchTaxRate(countryRates, label, code)).map(([, name]) => name);
    if (regions.length) out.push({ country: label, regions });
  }
  return out;
}

/** Settings › Taxes › "Collect sales tax". Missing = on (older shops); mirrors functions/index.js. */
export function taxCollectionOn(settings: any): boolean {
  return settings?.taxes?.collect !== false;
}

/** The rates checkout may charge: none while tax collection is switched off. */
export function activeTaxRates<T>(settings: any): T[] {
  return taxCollectionOn(settings) ? (settings?.taxes?.rates || []) : [];
}
