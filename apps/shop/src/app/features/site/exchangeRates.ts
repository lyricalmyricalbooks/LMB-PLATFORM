// Exchange rates for showing USD/EUR prices. The shop saves the day's rates in the public `settings/exchangeRates`
// document (a scheduled Function refreshes it every few hours, functions/exchangeRates.js) and checkout charges
// exactly those numbers, so the storefront reads the same copy first. Only when the shop has no usable copy does it
// ask the free feed directly. It must not hang on either, hammer them on every page load, or quietly show the old
// fixed rates without anyone being able to tell.
import { signalWithTimeout } from "./latestRequest";

export type RateCurrency = "CAD" | "USD" | "EUR";
export type Rates = Record<RateCurrency, number>;
/** live = today's rates (the shop's saved copy or the feed) · cached = remembered earlier in this browser (within the
 *  hour) or an older saved copy while the feed is down · fallback = fixed numbers (nothing reachable). */
export type RatesSource = "live" | "cached" | "fallback";

export const FALLBACK_RATES: Rates = { CAD: 1.0, USD: 0.73, EUR: 0.67 };
export const RATES_URL = "https://open.er-api.com/v6/latest/CAD";
export const RATES_CACHE_KEY = "fm_fx_rates";
/** The browser re-reads the rates hourly (shared by its tabs), so a shopper who keeps the shop open sees the next day's rates. */
export const RATES_CACHE_MS = 60 * 60 * 1000;
/** Same as the server's FRESH_MS: a saved copy older than this is replaced by a live answer when one is reachable. */
export const SAVED_FRESH_MS = 36 * 60 * 60 * 1000;
export const RATES_FETCH_TIMEOUT_MS = 5000;
/** Same bounds as the server (functions/exchangeRates.js SANE_RANGE): anything outside is a broken answer. */
const SANE: Record<"USD" | "EUR", [number, number]> = { USD: [0.4, 1.2], EUR: [0.3, 1.1] };

type Store = Pick<Storage, "getItem" | "setItem">;
type Pair = { USD: number; EUR: number };

function sanePair(usd: unknown, eur: unknown): Pair | null {
  const u = Number(usd), e = Number(eur);
  const ok = (n: number, [lo, hi]: [number, number]) => Number.isFinite(n) && n >= lo && n <= hi;
  return ok(u, SANE.USD) && ok(e, SANE.EUR) ? { USD: u, EUR: e } : null;
}

function readCache(store: Store | null, now: number): Rates | null {
  try {
    const saved = JSON.parse(store?.getItem(RATES_CACHE_KEY) || "null");
    // A stamp from the future (clock moved back) would otherwise pin the copy for longer than an hour.
    const age = saved ? now - Number(saved.at) : NaN;
    const pair = age >= 0 && age < RATES_CACHE_MS ? sanePair(saved.rates?.USD, saved.rates?.EUR) : null;
    if (pair) return { CAD: 1, ...pair };
  } catch { /* unreadable cache: fetch again */ }
  return null;
}

function remember(store: Store | null, now: number, pair: Pair) {
  try { store?.setItem(RATES_CACHE_KEY, JSON.stringify({ at: now, rates: pair })); } catch { /* not cached */ }
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
} = {}): Promise<{ rates: Rates; source: RatesSource }> {
  const now = opts.now ?? Date.now();
  let store: Store | null = null;
  // Remembered for the whole browser (not per tab), so opening the shop in another tab within the hour reuses the
  // same rates instead of reading `settings/exchangeRates` again. Same 1-hour window and sane bounds as before.
  try { store = opts.store === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : opts.store; } catch { store = null; }
  const cached = readCache(store, now);
  if (cached) return { rates: cached, source: "cached" };

  // 1. The shop's saved copy: exactly what checkout charges.
  let saved: Pair | null = null;
  let savedFresh = false;
  const guard = signalWithTimeout(opts.timeoutMs ?? RATES_FETCH_TIMEOUT_MS);
  try {
    const timeout = new Promise<null>(resolve => guard.signal.addEventListener("abort", () => resolve(null), { once: true }));
    const doc = await Promise.race([(opts.readShop || readShopRates)().catch(() => null), timeout]);
    saved = doc ? sanePair(doc.usd, doc.eur) : null;
    const fetchedAt = Date.parse(doc?.fetchedAt || "");
    savedFresh = !!saved && Number.isFinite(fetchedAt) && now - fetchedAt < SAVED_FRESH_MS;
  } catch { /* unreadable: ask the feed below */ }
  finally { guard.done(); }
  if (saved && savedFresh) {
    remember(store, now, saved);
    return { rates: { CAD: 1, ...saved }, source: "live" };
  }

  // 2. No current saved copy: today's rates straight from the feed (the server does the same when charging).
  const feedGuard = signalWithTimeout(opts.timeoutMs ?? RATES_FETCH_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl || fetch)(RATES_URL, { signal: feedGuard.signal });
    if (res.ok) {
      const data = await res.json();
      const pair = sanePair(data?.rates?.USD, data?.rates?.EUR);
      if (pair) {
        remember(store, now, pair);
        return { rates: { CAD: 1, ...pair }, source: "live" };
      }
    }
  } catch { /* timed out, blocked or offline: fall back below */ }
  finally { feedGuard.done(); }

  // 3. The feed is down too: the last saved copy, which is also what checkout falls back to.
  if (saved) return { rates: { CAD: 1, ...saved }, source: "cached" };
  return { rates: FALLBACK_RATES, source: "fallback" };
}
