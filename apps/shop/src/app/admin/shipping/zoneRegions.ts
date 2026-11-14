// State and province picks for shipping zones (pure). Zones store ISO 3166-2 codes ("US-AK", "CA-ON"); checkout's
// matchShippingZone puts a state or province ahead of its country, so "United States $10" plus "Alaska & Hawaii $25" works.
import { REGION_COUNTRIES, findCountry, regionCode, regionList } from "../../features/site/shippingZones";

export type RegionCountry = (typeof REGION_COUNTRIES)[number];
export type ZoneWithRegions = { id?: string; regions?: string[] };

/** Ready-made groups shown as one-tap picks. Codes are the part after "US-" / "CA-". */
export const REGION_GROUPS: Record<RegionCountry, Array<{ id: string; label: string; codes: string[] }>> = {
  US: [
    { id: "lower48", label: "Lower 48 + DC", codes: regionList("US").map(([c]) => c).filter((c) => !["AK", "HI", "PR"].includes(c)) },
    { id: "akhi", label: "Alaska & Hawaii", codes: ["AK", "HI"] },
    { id: "pr", label: "Puerto Rico", codes: ["PR"] },
  ],
  CA: [
    { id: "atlantic", label: "Atlantic", codes: ["NB", "NL", "NS", "PE"] },
    { id: "central", label: "Ontario & Quebec", codes: ["ON", "QC"] },
    { id: "prairies", label: "Prairies", codes: ["AB", "MB", "SK"] },
    { id: "bc", label: "British Columbia", codes: ["BC"] },
    { id: "north", label: "The territories", codes: ["NT", "NU", "YT"] },
  ],
};

/** Clean, de-duplicated "CC-RR" codes in list order; anything unrecognised is dropped. */
export function cleanRegions(values: unknown): string[] {
  const out: string[] = [];
  for (const v of Array.isArray(values) ? values : []) {
    const code = regionCode(String(v).split("-")[0], v);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Codes another zone of the same profile already holds (each state or province lives in one zone). */
export function regionsTakenElsewhere(zones: ZoneWithRegions[], activeZoneId?: string): Set<string> {
  return new Set(zones.filter((z) => z.id !== activeZoneId).flatMap((z) => cleanRegions(z.regions)));
}

export function toggleRegion(regions: string[], code: string): string[] {
  return regions.includes(code) ? regions.filter((c) => c !== code) : [...regions, code];
}

/** Adds a whole group, skipping places another zone holds; a group already fully picked is taken off instead. */
export function toggleGroup(regions: string[], country: RegionCountry, codes: string[], taken: Set<string>): string[] {
  const full = codes.map((c) => `${country}-${c}`).filter((c) => !taken.has(c));
  if (full.length && full.every((c) => regions.includes(c))) return regions.filter((c) => !full.includes(c));
  return [...regions, ...full.filter((c) => !regions.includes(c))];
}

export function groupState(regions: string[], country: RegionCountry, codes: string[], taken: Set<string>): "all" | "some" | "none" {
  const open = codes.map((c) => `${country}-${c}`).filter((c) => !taken.has(c));
  const on = open.filter((c) => regions.includes(c)).length;
  return open.length && on === open.length ? "all" : on ? "some" : "none";
}

/** "Alaska, Hawaii" / "3 provinces" for a zone list line. */
export function regionsSummary(regions: unknown): string {
  const codes = cleanRegions(regions);
  if (!codes.length) return "";
  const byCountry = new Map<string, string[]>();
  for (const code of codes) {
    const [cc, rc] = code.split("-");
    byCountry.set(cc, [...(byCountry.get(cc) || []), regionList(cc).find(([c]) => c === rc)?.[1] || rc]);
  }
  return [...byCountry].map(([cc, names]) => {
    const country = findCountry(cc)?.name || cc;
    if (names.length === regionList(cc).length) return `All of ${country} (by ${cc === "CA" ? "province" : "state"})`;
    if (names.length <= 3) return names.join(", ");
    return `${names.length} ${cc === "CA" ? "provinces" : "states"} in ${country}`;
  }).join(" · ");
}

export const regionNoun = (country: RegionCountry, many = false) =>
  country === "CA" ? (many ? "provinces and territories" : "province") : (many ? "states" : "state");
