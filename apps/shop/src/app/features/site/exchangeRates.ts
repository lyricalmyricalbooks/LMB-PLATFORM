// Exchange rates for showing prices in the shopper's currency (CAD, USD or EUR), from the shop's own currency
// (CAD, or USD for a shop that sells in US dollars: lib/shopProfile `shopCurrency`). Every rate is "one unit of the
// shop's currency in that currency", so the shop's own is always 1. The shop saves the day's rates in the public `settings/exchangeRates`
// document (a scheduled Function refreshes it every few hours, functions/exchangeRates.js) and checkout charges
// exactly those numbers, so the storefront reads the same copy first. Only when the shop has no usable copy does it
// ask the free feed directly. It must not hang on either, hammer them on every page load, or quietly show the old
// fixed rates without anyone being able to tell.
import { signalWithTimeout } from "./latestRequest";
import { shopCurrency } from "../../../lib/shopProfile";
import type { ShopCurrency } from "../../../shared/shopCurrency";

export type RateCurrency = "CAD" | "USD" | "EUR";
export type Rates = Record<RateCurrency, number>;
/** live = today's rates (the shop's saved copy or the feed) · cached = remembered earlier in this browser (within the
 *  hour) or an older saved copy while the feed is down · fallback = fixed numbers (nothing reachable). */
export type RatesSource = "live" | "cached" | "fallback";

type Bounds = Partial<Record<RateCurrency, [number, number]>>;
/** Per shop currency, the same as the server's (functions/exchangeRates.js BASES): the feed, the fixed last resort and
 *  the bounds a real rate stays inside (anything outside is a broken answer). */
const BASES: Record<ShopCurrency, { url: string; fallback: Rates; sane: Bounds }> = {
  CAD: { url: "https://open.er-api.com/v6/latest/CAD", fallback: { CAD: 1.0, USD: 0.73, EUR: 0.67 }, sane: { USD: [0.4, 1.2], EUR: [0.3, 1.1] } },
  USD: { url: "https://open.er-api.com/v6/latest/USD", fallback: { USD: 1.0, CAD: 1.37, EUR: 0.92 }, sane: { CAD: [0.83, 2.5], EUR: [0.5, 1.5] } },
};
export const FALLBACK_RATES: Rates = BASES.CAD.fallback;
export const RATES_URL = BASES.CAD.url;
/** The fixed last-resort rates for a shop currency (the shop's own, unless one is named). */
export const fallbackRatesFor = (base: ShopCurrency = shopCurrency()): Rates => BASES[base].fallback;
export const RATES_CACHE_KEY = "fm_fx_rates";
/** The browser re-reads the rates hourly (shared by its tabs), so a shopper who keeps the shop open sees the next day's rates. */
export const RATES_CACHE_MS = 60 * 60 * 1000;
/** Same as the server's FRESH_MS: a saved copy older than this is replaced by a live answer when one is reachable. */
export const SAVED_FRESH_MS = 36 * 60 * 60 * 1000;
export const RATES_FETCH_TIMEOUT_MS = 5000;

type Store = Pick<Storage, "getItem" | "setItem">;
/** The shop currency's other two rates, e.g. `{ USD, EUR }` for a Canadian shop. */
type Pair = Partial<Record<RateCurrency, number>>;

/** The rates `read` gives for this shop currency, or null when one is missing or outside its bounds. */
function sanePair(base: ShopCurrency, read: (code: RateCurrency) => unknown): Pair | null {
  const out: Pair = {};
  for (const [code, [lo, hi]] of Object.entries(BASES[base].sane) as [RateCurrency, [number, number]][]) {
    const n = Number(read(code));
    if (!(Number.isFinite(n) && n >= lo && n <= hi)) return null;
    out[code] = n;
  }
  return out;
}
const full = (base: ShopCurrency, pair: Pair): Rates => ({ [base]: 1, ...pair } as Rates);
/** A saved copy or cache entry with no `base` was made before shops had a currency: it is Canadian. */
const sameBase = (base: ShopCurrency, value: unknown) => String(value || "CAD").toUpperCase() === base;

function readCache(store: Store | null, now: number, base: ShopCurrency): Rates | null {
  try {
    const saved = JSON.parse(store?.getItem(RATES_CACHE_KEY) || "null");
    // A stamp from the future (clock moved back) would otherwise pin the copy for longer than an hour.
    const age = saved ? now - Number(saved.at) : NaN;
    const pair = age >= 0 && age < RATES_CACHE_MS && sameBase(base, saved.base) ? sanePair(base, code => saved.rates?.[code]) : null;
    if (pair) return full(base, pair);
  } catch { /* unreadable cache: fetch again */ }
  return null;
}

function remember(store: Store | null, now: number, base: ShopCurrency, pair: Pair) {
  try { store?.setItem(RATES_CACHE_KEY, JSON.stringify({ at: now, ...(base === "CAD" ? {} : { base }), rates: pair })); } catch { /* not cached */ }
}

/** The shop's saved copy (`settings/exchangeRates`), read with the shopper Firestore Lite API. */
async function readShopRates(): Promise<any> {
  const { publicApi } = await import("../../lib/publicApi");
  return publicApi.getExchangeRates();
}

export async function loadRates(opts: {
  fetchImpl?: typeof fetch;
  readShop?: () => Promise<any>;
  store?: Store | null;
  now?: number;
  timeoutMs?: number;
  /** The shop's currency; left out, the shop profile's. */
  base?: ShopCurrency;
} = {}): Promise<{ rates: Rates; source: RatesSource }> {
  const base = opts.base ?? shopCurrency();
  const now = opts.now ?? Date.now();
  let store: Store | null = null;
  // Remembered for the whole browser (not per tab), so opening the shop in another tab within the hour reuses the
  // same rates instead of reading `settings/exchangeRates` again. Same 1-hour window and sane bounds as before.
  try { store = opts.store === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : opts.store; } catch { store = null; }
  const cached = readCache(store, now, base);
  if (cached) return { rates: cached, source: "cached" };

  // 1. The shop's saved copy: exactly what checkout charges.
  let saved: Pair | null = null;
  let savedFresh = false;
  const guard = signalWithTimeout(opts.timeoutMs ?? RATES_FETCH_TIMEOUT_MS);
  try {
    const timeout = new Promise<null>(resolve => guard.signal.addEventListener("abort", () => resolve(null), { once: true }));
    const doc = await Promise.race([(opts.readShop || readShopRates)().catch(() => null), timeout]);
    saved = doc && sameBase(base, doc.base) ? sanePair(base, code => doc[code.toLowerCase()]) : null;
    const fetchedAt = Date.parse(doc?.fetchedAt || "");
    savedFresh = !!saved && Number.isFinite(fetchedAt) && now - fetchedAt < SAVED_FRESH_MS;
  } catch { /* unreadable: ask the feed below */ }
  finally { guard.done(); }
  if (saved && savedFresh) {
    remember(store, now, base, saved);
    return { rates: full(base, saved), source: "live" };
  }

  // 2. No current saved copy: today's rates straight from the feed (the server does the same when charging).
  const feedGuard = signalWithTimeout(opts.timeoutMs ?? RATES_FETCH_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl || fetch)(BASES[base].url, { signal: feedGuard.signal });
    if (res.ok) {
      const data = await res.json();
      const pair = sanePair(base, code => data?.rates?.[code]);
      if (pair) {
        remember(store, now, base, pair);
        return { rates: full(base, pair), source: "live" };
      }
    }
  } catch { /* timed out, blocked or offline: fall back below */ }
  finally { feedGuard.done(); }

  // 3. The feed is down too: the last saved copy, which is also what checkout falls back to.
  if (saved) return { rates: full(base, saved), source: "cached" };
  return { rates: BASES[base].fallback, source: "fallback" };
}
