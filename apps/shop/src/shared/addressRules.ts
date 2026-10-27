// Which address boxes a destination really needs, one copy for the shop, the checkout form, the admin
// and the server (src/shared/CLAUDE.md). Many countries have no state/province list and some have no
// postal code at all; demanding them turned valid addresses away from the address check and the label
// tool. Canada and the US need a province/state; elsewhere the box is optional free text.
import { findCountry } from "./shippingZones";

/** Countries whose addresses have no postal code (the checkout form uses the same list). */
export const NO_POSTAL_CODE = new Set([
  "AO", "AG", "AW", "BS", "BZ", "BJ", "BW", "BF", "BI", "CM", "CF", "KM", "CG", "CD", "CK", "CI", "DJ", "DM", "ER", "FJ",
  "GM", "GH", "GD", "GY", "HK", "KI", "MO", "ML", "MR", "NR", "NU", "QA", "RW", "KN", "LC", "ST", "SC", "SL", "SB", "SR",
  "SY", "TL", "TG", "TK", "TO", "TT", "TV", "UG", "VU", "YE", "ZW", "AE",
]);
/** Only these have a fixed state/province list (regionsFor). */
export const REGION_COUNTRIES = new Set(["CA", "US"]);

export function countryCodeOf(country: unknown): string {
  const found = findCountry(String(country || ""));
  if (found) return found.code;
  const clean = String(country || "").trim();
  return /^[a-z]{2}$/i.test(clean) ? clean.toUpperCase() : "";
}
export const regionRequired = (country: unknown) => REGION_COUNTRIES.has(countryCodeOf(country));
export const postalRequired = (country: unknown) => !NO_POSTAL_CODE.has(countryCodeOf(country));
const blank = (value: unknown) => !String(value ?? "").trim();

/** The boxes still empty that this country needs (street, city, country, state for CA/US, postal unless none). */
export function addressMissing(address: any): string[] {
  const a = address || {};
  const missing: string[] = [];
  if (blank(a.street)) missing.push("street");
  if (blank(a.city)) missing.push("city");
  if (blank(a.country)) missing.push("country");
  if (regionRequired(a.country) && blank(a.state)) missing.push("state");
  if (postalRequired(a.country) && blank(a.zip)) missing.push("zip");
  return missing;
}
