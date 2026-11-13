// Published exchange rates for a given day, as the old stockroom app fetched and kept them (main.js
// fetchHistoricalRate): asked of the same services in the same order (`@stockroom/fx-sources.js`), kept in this browser
// under the same key (`lm-fx-history`, `@stockroom/sale-fx.js`), so rates the old app already fetched on this computer
// are used as they are. A dated rate never changes once published, so a kept one is never asked for again.
import { DATED_RATE_SOURCES, frankfurterUrl } from "@stockroom/fx-sources.js";
import { FX_HISTORY_KEY, datedRateKey } from "@stockroom/sale-fx.js";
import { SHOP_CURRENCY } from "../moneySign";

const FETCH_TIMEOUT_MS = 8000;
const FAILURE_PAUSE_MS = 60_000;

export type RateCache = Record<string, number>;
type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const storage = () => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

/** The dated rates kept in this browser (`FROM_TO@YYYY-MM-DD` → rate). */
export function keptRates(store: Pick<Storage, "getItem"> | null = storage()): RateCache {
  try {
    const raw = store?.getItem(FX_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const out: RateCache = {};
    for (const [k, v] of Object.entries(parsed && typeof parsed === "object" ? parsed : {})) if (k.includes("@") && Number(v) > 0) out[k] = Number(v);
    return out;
  } catch { return {}; }
}

export function keep(cache: RateCache, store: Pick<Storage, "setItem"> | null = storage()) {
  try {
    const out: RateCache = {};
    for (const [k, v] of Object.entries(cache)) if (k.includes("@") && v > 0) out[k] = v;
    store?.setItem(FX_HISTORY_KEY, JSON.stringify(out));
  } catch { /* a full or blocked store only means asking again next time */ }
}

const failedUntil: Record<string, number> = {};

/**
 * The rate from `from` to `to` on `day`, from what this browser keeps or else from the services. `null` when no
 * service answered (asked again after a minute, as the old app did).
 */
export async function datedRate(from: string, to: string, day: string, opts: { fetch?: Fetch; cache?: RateCache; now?: number; store?: Pick<Storage, "getItem" | "setItem"> | null } = {}): Promise<number | null> {
  if (from === to) return 1;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const store = opts.store === undefined ? storage() : opts.store;
  const cache = opts.cache ?? keptRates(store);
  const key = datedRateKey(from, to, day);
  if (cache[key] > 0) return cache[key];
  const now = opts.now ?? Date.now();
  if ((failedUntil[key] ?? 0) > now) return null;
  const get: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  for (const source of DATED_RATE_SOURCES) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const res = await get(source.url(from, to, day), ctrl ? { signal: ctrl.signal } : undefined);
      const found = res.ok ? source.read(await res.json(), from, to) : null;
      if (found) {
        cache[key] = found.rate;
        // Kept in this browser too (a passed cache is only the caller's copy), so the old app and the next visit reuse it.
        keep({ ...keptRates(store), [key]: found.rate }, store);
        delete failedUntil[key];
        return found.rate;
      }
    } catch { /* ask the next service */ }
    finally { if (timer) clearTimeout(timer); }
  }
  failedUntil[key] = now + FAILURE_PAUSE_MS;
  return null;
}

async function timed(get: Fetch, url: string) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try { return await get(url, ctrl ? { signal: ctrl.signal } : undefined); }
  finally { if (timer) clearTimeout(timer); }
}

/** Published daily rates from `start` to `end` as { day: rate }: one request for every sale of a currency (main.js fetchHistoricalRateSeries). Throws when the service doesn't answer. */
export async function rateSeries(from: string, to: string, start: string, end: string, opts: { fetch?: Fetch } = {}): Promise<RateCache> {
  const get: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const res = await timed(get, frankfurterUrl(`${start}..${end}`, from, to));
  if (!res.ok) throw new Error("FX series not available");
  const json = (await res.json()) as { rates?: Record<string, Record<string, unknown>> } | null;
  const out: RateCache = {};
  for (const [day, rates] of Object.entries(json?.rates || {})) {
    const rate = Number(rates && rates[to]);
    if (rate > 0) out[day] = rate;
  }
  return out;
}

const liveRates: RateCache = {};
const liveFailedUntil: Record<string, number> = {};

/** Today's rate (main.js fetchLiveRate): open.er-api.com first, Frankfurter's latest second, kept for this visit. `null` when neither answered. */
export async function liveRate(from: string, to: string, opts: { fetch?: Fetch; now?: number } = {}): Promise<number | null> {
  if (from === to) return 1;
  if (!from || !to || from === "OTHER" || to === "OTHER") return null;
  const key = `${from}_${to}`;
  if (liveRates[key] > 0) return liveRates[key];
  const now = opts.now ?? Date.now();
  if ((liveFailedUntil[key] ?? 0) > now) return null;
  const get: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  for (const url of [`https://open.er-api.com/v6/latest/${from}`, frankfurterUrl("latest", from, to)]) {
    try {
      const res = await timed(get, url);
      const rate = res.ok ? Number(((await res.json()) as { rates?: Record<string, unknown> } | null)?.rates?.[to]) : 0;
      if (rate > 0) { liveRates[key] = rate; return rate; }
    } catch { /* ask the next service */ }
  }
  liveFailedUntil[key] = now + FAILURE_PAUSE_MS;
  return null;
}

/**
 * The rate to turn an expense into `target` (main.js resolveExpenseRate): the rate published for its date, else today's,
 * else the Tax centre's saved daily rate, else 0, never a silent 1 to 1. A 0 means the expense is saved with `fxMissing`
 * and filled in later (taxRates.ts healExpenseRates).
 */
export async function expenseRate(currency: string, date: string, target: string = SHOP_CURRENCY, opts: { fetch?: Fetch; saved?: RateCache | null; store?: Pick<Storage, "getItem" | "setItem"> | null; now?: number } = {}): Promise<number> {
  const cur = String(currency || target).toUpperCase();
  const to = String(target || SHOP_CURRENCY).toUpperCase();
  if (cur === to) return 1;
  const dated = await datedRate(cur, to, date, { fetch: opts.fetch, store: opts.store, now: opts.now });
  if (dated) return dated;
  const live = await liveRate(cur, to, { fetch: opts.fetch, now: opts.now });
  if (live) return live;
  return Number(opts.saved?.[`${cur}_${to}`]) > 0 ? Number(opts.saved![`${cur}_${to}`]) : 0;
}

/** For tests: forget this visit's live rates and pauses. */
export function forgetLiveRates() {
  for (const k of Object.keys(liveRates)) delete liveRates[k];
  for (const k of Object.keys(liveFailedUntil)) delete liveFailedUntil[k];
  for (const k of Object.keys(failedUntil)) delete failedUntil[k];
}
