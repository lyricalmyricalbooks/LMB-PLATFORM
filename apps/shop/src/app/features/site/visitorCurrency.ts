// The storefront's starting currency from the visitor's country, as Google's front end saw their IP address
// (validateDiscountCode `action: "visitorCountry"` → functions/rateLimit.js `serverGeoCountry`). The shop never
// sends the address to a third-party lookup. A currency the shopper picks themselves always wins
// (CurrencyContext keeps it in `fm_currency`); this only decides where a first visit starts.
import { signalWithTimeout } from "./latestRequest";

export type VisitorCurrency = "CAD" | "USD" | "EUR";

export const COUNTRY_CACHE_KEY = "fm_geo_country";
/** A known country is remembered for a week, "the platform didn't say" for a day, so it isn't asked on every page. */
export const COUNTRY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const UNKNOWN_CACHE_MS = 24 * 60 * 60 * 1000;
export const COUNTRY_FETCH_TIMEOUT_MS = 4000;

// Places that price in euros, including French overseas departments in the Americas and Africa.
const EURO_OVERSEAS = new Set(["GF", "GP", "MQ", "MF", "BL", "PM", "RE", "YT"]);
const EUROPE = new Set([
  "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FO", "FR", "GB",
  "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT",
  "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SJ", "SK", "SM", "UA", "VA", "XK",
]);
// The rest of the Americas plus US territories and the Pacific states that use the US dollar.
const DOLLAR = new Set([
  "US", "PR", "GU", "VI", "AS", "MP", "UM", "FM", "MH", "PW", "TL",
  "AG", "AI", "AR", "AW", "BB", "BM", "BO", "BQ", "BR", "BS", "BZ", "CL", "CO", "CR", "CU", "CW", "DM", "DO", "EC",
  "FK", "GD", "GL", "GT", "GY", "HN", "HT", "JM", "KN", "KY", "LC", "MS", "MX", "NI", "PA", "PE", "PY", "SR", "SV",
  "SX", "TC", "TT", "UY", "VC", "VE", "VG",
]);

/**
 * Starting currency for a country code. Same regions as the time-zone guess (`currencyForTimeZone`):
 * Canada and everywhere else outside the Americas and Europe start in CAD, which is what the shop charges in.
 * Null for anything that isn't a two-letter code.
 */
export function currencyForCountry(code: unknown): VisitorCurrency | null {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === "ZZ") return null;
  if (EURO_OVERSEAS.has(cc) || EUROPE.has(cc)) return "EUR";
  if (DOLLAR.has(cc)) return "USD";
  return "CAD";
}

type Store = Pick<Storage, "getItem" | "setItem">;
type Saved = { country: string | null; at: number };

/** The remembered answer, if still fresh: `{ country }` (null = the platform didn't say), else undefined. */
export function cachedCountry(store: Store | null, now = Date.now()): { country: string | null } | undefined {
  try {
    const saved = JSON.parse(store?.getItem(COUNTRY_CACHE_KEY) || "null") as Saved | null;
    if (!saved || typeof saved.at !== "number") return undefined;
    const country = typeof saved.country === "string" && /^[A-Z]{2}$/.test(saved.country) ? saved.country : null;
    const age = now - saved.at;
    if (age < 0 || age >= (country ? COUNTRY_CACHE_MS : UNKNOWN_CACHE_MS)) return undefined;
    return { country };
  } catch {
    return undefined;
  }
}

/** Asks the shop's own server which country this connection comes from. Never throws; null when unknown. */
export async function loadVisitorCountry(opts: {
  ask?: (signal: AbortSignal) => Promise<Response>;
  store?: Store | null;
  now?: number;
  timeoutMs?: number;
} = {}): Promise<string | null> {
  const now = opts.now ?? Date.now();
  let store: Store | null = null;
  try { store = opts.store === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : opts.store; } catch { store = null; }
  const cached = cachedCountry(store, now);
  if (cached) return cached.country;

  const guard = signalWithTimeout(opts.timeoutMs ?? COUNTRY_FETCH_TIMEOUT_MS);
  try {
    const ask = opts.ask || (async (signal: AbortSignal) => {
      const { functionFetch } = await import("../../lib/functionsBase");
      return functionFetch("validateDiscountCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "visitorCountry" }),
        signal,
      });
    });
    const res = await ask(guard.signal);
    if (!res.ok) return null; // A server hiccup isn't remembered: the next visit asks again.
    const data = await res.json().catch(() => null);
    const raw = String(data?.country || "").toUpperCase();
    const country = /^[A-Z]{2}$/.test(raw) && raw !== "ZZ" ? raw : null;
    try { store?.setItem(COUNTRY_CACHE_KEY, JSON.stringify({ country, at: now } satisfies Saved)); } catch { /* not remembered */ }
    return country;
  } catch {
    return null; // Timed out, offline or blocked: the time-zone guess stays.
  } finally {
    guard.done();
  }
}
