// Published exchange rates for a given day, as the old stockroom app fetched and kept them (main.js
// fetchHistoricalRate): asked of the same services in the same order (`@stockroom/fx-sources.js`), kept in this browser
// under the same key (`lm-fx-history`, `@stockroom/sale-fx.js`), so rates the old app already fetched on this computer
// are used as they are. A dated rate never changes once published, so a kept one is never asked for again.
import { DATED_RATE_SOURCES } from "@stockroom/fx-sources.js";
import { FX_HISTORY_KEY, datedRateKey } from "@stockroom/sale-fx.js";

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

function keep(cache: RateCache, store: Pick<Storage, "setItem"> | null = storage()) {
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
