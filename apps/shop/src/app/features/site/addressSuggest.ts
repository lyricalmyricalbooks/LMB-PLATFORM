// Address suggestions while typing at checkout.
// 1. Google Places, through the shop's validateAddress Function, when the owner saved a key
//    (Settings › Shipping › Carrier & labels › Address finder): complete addresses with postal codes.
// 2. Otherwise Photon (OpenStreetMap data, free, no key). OpenStreetMap misses many house numbers and
//    postal codes, so the query is cleaned up first (units, "St"/"Ave"/"W" abbreviations) and results
//    are ranked by the house number the shopper typed.
import { COUNTRIES } from "./shippingZones";
import { provinceFromPostal, regionsFor } from "./postalRegion";
import { functionFetch } from "../../lib/functionsBase";

export type AddressSuggestion = {
  label: string;
  /** First line / second line for the list (Google gives both; Photon rows use `label`). */
  main?: string;
  secondary?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  /** Google rows carry only an id until picked: call `resolveAddress` to fill the fields. */
  placeId?: string;
  source: "google" | "osm";
};

export type CheckoutAddress = { street: string; unit: string; city: string; state: string; zip: string; country: string };

const PHOTON_URL = "https://photon.komoot.io/api/";

// Rough country centres: Photon has no country filter, so results are biased toward the chosen country.
const COUNTRY_CENTRES: Record<string, [number, number]> = {
  ca: [45.5, -79], us: [39.5, -98.35], gb: [52.5, -1.5], ie: [53.3, -7.7], au: [-33, 147],
  nz: [-40.9, 174.9], fr: [46.6, 2.4], de: [51.1, 10.4], nl: [52.2, 5.3], es: [40.4, -3.7],
  it: [42.8, 12.6], mx: [19.4, -99.1], jp: [35.7, 139.7],
};
// Where most people live in each province, for a tighter bias once the shopper picked one.
const PROVINCE_CENTRES: Record<string, [number, number]> = {
  ON: [43.7, -79.4], QC: [45.6, -73.6], BC: [49.25, -123.1], AB: [52.3, -113.8], MB: [49.9, -97.1],
  SK: [51.5, -105.5], NS: [44.65, -63.6], NB: [46.0, -66.0], NL: [47.56, -52.7], PE: [46.25, -63.1],
  YT: [60.7, -135.05], NT: [62.45, -114.37], NU: [63.75, -68.5],
};

// Street-type and direction abbreviations OpenStreetMap spells out ("Queen St W" is "Queen Street West").
const STREET_TYPES: Record<string, string> = {
  st: "street", str: "street", ave: "avenue", av: "avenue", rd: "road", dr: "drive", blvd: "boulevard",
  cres: "crescent", cr: "crescent", crt: "court", ct: "court", pl: "place", ln: "lane", pkwy: "parkway",
  hwy: "highway", sq: "square", ter: "terrace", terr: "terrace", cir: "circle", trl: "trail", gdns: "gardens",
  hts: "heights", pk: "park", mews: "mews", way: "way", gt: "gate", grv: "grove", hl: "hill", pt: "point",
  rte: "route", ch: "chemin", boul: "boulevard",
};
const DIRECTIONS: Record<string, string> = {
  n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};
const UNIT_WORD = "(?:apt\\.?|apartment|unit|suite|ste\\.?|app\\.?|appartement|bureau|#)";
// A unit is a number ("5", "5B", "1203") or a single letter: "Ste Anne" is Sainte-Anne, not suite Anne.
const UNIT_ID = "([0-9][0-9a-z-]{0,7}|[a-z])";

export type TypedAddress = { unit: string; number: string; street: string; tail: string };

/** Splits what the shopper typed into unit, house number, street and anything after a comma (city…).
 *  "12-456 Montrose Ave" (the Canadian unit-house form) → unit 12, number 456. Hyphenated house numbers
 *  are only read as a unit outside the US (Queens uses "12-34 31st Ave" as one house number). */
export function parseTypedAddress(input: string, countryCode = ""): TypedAddress {
  let s = String(input || "").replace(/\s+/g, " ").trim();
  let unit = "";
  const lead = s.match(new RegExp(`^${UNIT_WORD}\\s*${UNIT_ID}\\s*,?\\s+(?=\\d)`, "i"));
  if (lead) { unit = lead[1]; s = s.slice(lead[0].length); }
  if (!unit && countryCode !== "us") {
    const dash = s.match(/^([0-9]{1,6}[a-z]?)\s*-\s*(\d+[a-z]?\b.*)$/i);
    if (dash) { unit = dash[1]; s = dash[2]; }
  }
  const [first, ...rest] = s.split(",");
  let line = first.trim();
  if (!unit) {
    const trail = line.match(new RegExp(`\\s+${UNIT_WORD}\\s*${UNIT_ID}$`, "i"));
    if (trail) { unit = trail[1]; line = line.slice(0, trail.index).trim(); }
  }
  const tail = rest.join(",").trim();
  // A unit written after the street as its own part: "456 Main St, Unit 3, Toronto".
  const tailParts = tail ? tail.split(",").map(t => t.trim()) : [];
  if (!unit && tailParts.length) {
    const m = tailParts[0].match(new RegExp(`^${UNIT_WORD}\\s*${UNIT_ID}$`, "i"));
    if (m) { unit = m[1]; tailParts.shift(); }
  }
  const num = line.match(/^(\d+[a-z]?(?:-\d+[a-z]?)?(?:\s1\/2)?)\b\s*(.*)$/i);
  return { unit, number: num ? num[1] : "", street: num ? num[2] : line, tail: tailParts.join(", ") };
}

/** Spells out street-type and direction abbreviations at the end of a street name. */
export function expandStreet(street: string): string {
  const words = String(street || "").replace(/\./g, "").split(/\s+/).filter(Boolean);
  const out = words.map((w, i) => {
    const lower = w.toLowerCase();
    // A leading single-letter direction: "W 42nd St" → "West 42nd St".
    if (i === 0 && words.length > 1 && lower.length === 1 && DIRECTIONS[lower]) return DIRECTIONS[lower];
    if (i === 0) return w; // "St Clair" stays: a street name, not a type
    const after = words.slice(i + 1).map(x => x.toLowerCase());
    const onlyDirectionsAfter = after.every(x => DIRECTIONS[x]);
    if (STREET_TYPES[lower] && onlyDirectionsAfter) return STREET_TYPES[lower];
    if (DIRECTIONS[lower] && onlyDirectionsAfter) return DIRECTIONS[lower];
    return w;
  });
  return out.join(" ");
}

const countryCodeOf = (country: string) => COUNTRIES.find(c => c.name === country || c.code === country.toUpperCase())?.code?.toLowerCase();
const countryNameOf = (code: string, fallback: string) => COUNTRIES.find(c => c.code === code.toUpperCase())?.name || fallback;

/** The province/state the checkout drop-down uses for a provider's code or name. */
function regionValue(country: string, code: string, name: string): string {
  const regions = regionsFor(country);
  if (!regions) return name || code;
  const hit = regions.find(([c, n]) => c === code.toUpperCase() || n.toLowerCase() === name.toLowerCase() || n.toLowerCase() === code.toLowerCase());
  return hit?.[0] || "";
}

/** Turns one Photon feature into checkout fields; null when it isn't a street address.
 *  When the shopper typed a house number Photon doesn't know, the street match keeps their number and
 *  leaves the postal code for them to type (a neighbour's postal code is often a different one). */
export function toSuggestion(props: any, fallbackCountry: string, typedNumber = ""): AddressSuggestion | null {
  if (!props) return null;
  const streetName = props.street || (props.type === "street" ? props.name : "");
  if (!streetName) return null;
  const known = String(props.housenumber || "");
  const sameHouse = !typedNumber || !known || known.toLowerCase().startsWith(typedNumber.toLowerCase());
  const number = sameHouse ? known || typedNumber : typedNumber;
  const street = [number, streetName].filter(Boolean).join(" ");
  const code = String(props.countrycode || "").toUpperCase();
  const country = countryNameOf(code, props.country || fallbackCountry);
  // Only a matched house has a postal code worth filling: a street often spans several.
  const zip = known && sameHouse ? String(props.postcode || "") : "";
  const rawState = String(props.state || "");
  const state = regionValue(country, rawState, rawState) || provinceFromPostal(country, zip);
  const city = props.city || props.town || props.village || props.locality || props.district || props.county || "";
  return {
    label: [street, city, state, zip].filter(Boolean).join(", "),
    street, city, state, zip, country, source: "osm",
  };
}

async function fetchPhoton(q: string, code: string | undefined, state: string, signal?: AbortSignal): Promise<any[]> {
  const near = (code === "ca" && PROVINCE_CENTRES[state.toUpperCase()]) || undefined;
  const centre = near || (code ? COUNTRY_CENTRES[code] : undefined);
  const bias = centre ? `&lat=${centre[0]}&lon=${centre[1]}&location_bias_scale=${near ? 0.3 : 0.1}&zoom=${near ? 7 : 4}` : "";
  const res = await fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=25&lang=en&layer=house&layer=street${bias}`, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map((f: any) => f.properties);
}

async function searchPhoton(query: string, country: string, state: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const code = countryCodeOf(country);
  const typed = parseTypedAddress(query, code);
  if (!/[a-z]/i.test(typed.street)) return [];
  const line = [typed.number, expandStreet(typed.street)].filter(Boolean).join(" ");
  const cleaned = [line, typed.tail].filter(Boolean).join(", ");
  const plain = [typed.number, typed.street].filter(Boolean).join(" ") + (typed.tail ? `, ${typed.tail}` : "");
  const queries = [cleaned, cleaned !== plain ? plain : "", code && country && !typed.tail ? `${cleaned}, ${country}` : ""].filter(Boolean);

  const found = new Map<string, { s: AddressSuggestion; score: number; order: number }>();
  let order = 0;
  for (const q of queries) {
    const props = await fetchPhoton(q, code, state, signal);
    for (const p of props) {
      if (code && String(p?.countrycode || "").toLowerCase() !== code) continue;
      const s = toSuggestion(p, country, typed.number);
      if (!s) continue;
      const known = String(p.housenumber || "").toLowerCase();
      const score = (typed.number && known === typed.number.toLowerCase() ? 4 : 0)
        + (typed.number && known && known.startsWith(typed.number.toLowerCase()) ? 1 : 0)
        + (s.zip ? 1 : 0)
        + (state && s.state === state ? 2 : 0);
      const key = `${s.street}|${s.city}`.toLowerCase();
      const prev = found.get(key);
      if (!prev || score > prev.score) found.set(key, { s, score, order: prev?.order ?? order++ });
    }
    if (found.size >= 3) break;
  }
  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 5)
    .map(({ s }) => (typed.unit ? { ...s, unit: typed.unit } : s));
}

// ─── Google Places through the shop's Function ────────────────────────────────

// After "no key saved" or a failure, the free finder is used for a while instead of asking again.
let googleOffUntil = 0;
export function resetAddressFinder() { googleOffUntil = 0; }

async function callFinder(body: Record<string, unknown>, signal?: AbortSignal): Promise<any | null> {
  if (Date.now() < googleOffUntil) return null;
  try {
    const res = await functionFetch("validateAddress", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
    });
    const data = await res.json().catch(() => null);
    if (data?.fallback || !res.ok || !data) {
      googleOffUntil = Date.now() + (data?.provider === "none" ? 30 : 2) * 60 * 1000;
      return null;
    }
    return data;
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    googleOffUntil = Date.now() + 2 * 60 * 1000;
    return null;
  }
}

/** A fresh token for one address search (Google bills the typing + the pick as one session). */
export function newAddressSession(): string {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID(); } catch { /* old browser */ }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/** Looks up addresses matching what the shopper typed, limited to their chosen country. */
export async function searchAddresses(query: string, country: string, signal?: AbortSignal,
  opts: { state?: string; sessionToken?: string } = {}): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  const code = countryCodeOf(country) || "";
  const google = await callFinder({ action: "addressSuggest", query: q, country: code, sessionToken: opts.sessionToken }, signal);
  if (google && Array.isArray(google.items)) {
    const unit = parseTypedAddress(q, code).unit;
    return google.items.slice(0, 5).map((i: any) => ({
      label: String(i.label || ""), main: String(i.main || i.label || ""), secondary: String(i.secondary || ""),
      placeId: String(i.placeId || ""), street: "", unit, city: "", state: "", zip: "", country, source: "google" as const,
    })).filter((s: AddressSuggestion) => s.label && s.placeId);
  }
  return searchPhoton(q, country, opts.state || "", signal);
}

/** Fills a picked suggestion's fields (Google rows are looked up now; Photon rows are already full). */
export async function resolveAddress(s: AddressSuggestion, typed: string, sessionToken?: string): Promise<AddressSuggestion> {
  if (!s.placeId) return s;
  const fallback = { ...s, street: s.main || s.label };
  const data = await callFinder({ action: "addressDetails", placeId: s.placeId, sessionToken });
  const a = data?.address;
  if (!a) return fallback;
  const country = countryNameOf(String(a.country || ""), s.country);
  const typedAddress = parseTypedAddress(typed, String(a.country || "").toLowerCase());
  // Google matched the street but not the house: keep the number the shopper typed.
  const street = a.hasNumber || !typedAddress.number ? a.street : [typedAddress.number, a.street].filter(Boolean).join(" ");
  if (!street) return fallback;
  const zip = String(a.zip || "");
  return {
    ...s, street, country, zip,
    unit: String(a.unit || "") || s.unit || "",
    city: String(a.city || ""),
    state: regionValue(country, String(a.stateCode || ""), String(a.stateName || "")) || provinceFromPostal(country, zip),
  };
}

/** The checkout address after picking a suggestion. Empty suggestion fields never leave the previous
 *  address's postal code or province behind for a different town (a mixed address ships nowhere). */
export function applySuggestion(prev: CheckoutAddress, s: AddressSuggestion, opts: { unitField?: boolean } = {}): CheckoutAddress {
  const country = s.country || prev.country;
  const sameCountry = country === prev.country;
  const sameTown = sameCountry && (!s.city || !prev.city || s.city.trim().toLowerCase() === prev.city.trim().toLowerCase());
  const unit = s.unit || "";
  const unitField = opts.unitField !== false;
  const street = unit && !unitField && !prev.unit
    ? (countryCodeOf(country) === "ca" ? `${unit}-${s.street}` : `${s.street} #${unit}`)
    : s.street;
  return {
    street,
    unit: unitField && unit && !prev.unit ? unit : prev.unit,
    city: s.city || (sameTown ? prev.city : ""),
    state: s.state || (sameTown ? prev.state : ""),
    zip: s.zip || (sameTown ? prev.zip : ""),
    country,
  };
}
