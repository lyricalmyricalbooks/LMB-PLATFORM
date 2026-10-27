// Daily exchange rates: one saved copy that the storefront shows and checkout charges.
//
// `refreshExchangeRates` (scheduled, functions/index.js) fetches CAD→USD/EUR from the free feed and saves it in the
// public `settings/exchangeRates` document. Checkout reads that same document (`createRateReader`), so a USD/EUR
// shopper is charged the rate the shop showed them. The feed publishes new rates once a day; the job runs every
// few hours so a missed fetch is retried the same day.
//
// Safety: a rate outside SANE_RANGE is never saved or used (a broken feed must not reprice the shop). When the saved
// copy is older than FRESH_MS the reader fetches live; when that fails it keeps the last good saved rates rather than
// the old fixed numbers, and only a shop that has never saved a rate falls back to FALLBACK_RATES.

const FEED_URL = "https://open.er-api.com/v6/latest/CAD";
const RATES_COLLECTION = "settings";
const RATES_DOC = "exchangeRates";
const FALLBACK_RATES = Object.freeze({ cad: 1.0, usd: 0.73, eur: 0.67 });
/** Saved rates newer than this are used as they are; older ones trigger a live fetch first. */
const FRESH_MS = 36 * 60 * 60 * 1000;
/** How long one Functions instance reuses what it read, so a busy checkout isn't a read per request. */
const READ_CACHE_MS = 5 * 60 * 1000;
/** One Canadian dollar has stayed well inside these for decades; anything outside is a broken answer. */
const SANE_RANGE = Object.freeze({ usd: [0.4, 1.2], eur: [0.3, 1.1] });

function saneRate(code, value) {
  const n = Number(value);
  const [lo, hi] = SANE_RANGE[code];
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

/** The feed's answer → `{ usd, eur, providerUpdatedAt }`, or null when it is unusable. */
function parseFeed(data) {
  if (!data || (data.result && data.result !== "success") || (data.base_code && data.base_code !== "CAD")) return null;
  const usd = saneRate("usd", data.rates && data.rates.USD);
  const eur = saneRate("eur", data.rates && data.rates.EUR);
  if (usd == null || eur == null) return null;
  const unix = Number(data.time_last_update_unix);
  return { usd, eur, providerUpdatedAt: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : null };
}

/** A saved document → `{ usd, eur, fetchedAtMs }`, or null when it is missing or not sane. */
function parseStored(data) {
  if (!data) return null;
  const usd = saneRate("usd", data.usd);
  const eur = saneRate("eur", data.eur);
  const fetchedAtMs = Date.parse(data.fetchedAt || "");
  if (usd == null || eur == null || !Number.isFinite(fetchedAtMs)) return null;
  return { usd, eur, fetchedAtMs };
}

async function fetchFeed(fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(FEED_URL, { signal: controller.signal });
    if (!res.ok) return null;
    return parseFeed(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function ratesDoc(db) {
  return db.collection(RATES_COLLECTION).doc(RATES_DOC);
}

/** Fetches today's rates and saves them. Returns the saved record, or null (the last good copy is kept). */
async function refreshStoredRates({ db, fetchImpl = fetch, now = () => Date.now(), timeoutMs = 10000 } = {}) {
  const fresh = await fetchFeed(fetchImpl, timeoutMs);
  const at = new Date(now()).toISOString();
  if (!fresh) {
    // Record the miss without touching the rates: shoppers keep the last good numbers.
    await Promise.resolve().then(() => ratesDoc(db).set({ lastAttemptAt: at, lastError: "The exchange-rate feed did not give usable rates." }, { merge: true })).catch(() => {});
    return null;
  }
  const record = { base: "CAD", usd: fresh.usd, eur: fresh.eur, fetchedAt: at, lastAttemptAt: at, lastError: null,
    providerUpdatedAt: fresh.providerUpdatedAt, source: "open.er-api.com" };
  await ratesDoc(db).set(record);
  return record;
}

/**
 * `getExchangeRates()` for checkout: `{ cad, usd, eur }` from the saved copy, refreshed live when it is stale,
 * keeping the last good copy when the feed is down. Never throws.
 */
function createRateReader({ db, fetchImpl = fetch, now = () => Date.now(), cacheMs = READ_CACHE_MS, liveTimeoutMs = 3000, log = console } = {}) {
  let cached = null;
  let cachedAt = 0;
  return async function getExchangeRates() {
    if (cached && now() - cachedAt < cacheMs) return cached;
    let stored = null;
    try { stored = parseStored((await ratesDoc(db).get()).data()); } catch (err) { log.warn("Could not read saved exchange rates:", err && err.message); }
    let rates = null;
    if (stored && now() - stored.fetchedAtMs < FRESH_MS) {
      rates = { cad: 1.0, usd: stored.usd, eur: stored.eur };
    } else {
      const live = await fetchFeed(fetchImpl, liveTimeoutMs);
      if (live) {
        rates = { cad: 1.0, usd: live.usd, eur: live.eur };
        // Share it with the storefront too; a failed write only means the next job saves it.
        const at = new Date(now()).toISOString();
        Promise.resolve().then(() => ratesDoc(db).set({ base: "CAD", usd: live.usd, eur: live.eur, fetchedAt: at,
          lastAttemptAt: at, lastError: null, providerUpdatedAt: live.providerUpdatedAt, source: "open.er-api.com" })).catch(() => {});
      } else if (stored) {
        log.warn("Exchange-rate feed unreachable: using the last saved rates from", new Date(stored.fetchedAtMs).toISOString());
        rates = { cad: 1.0, usd: stored.usd, eur: stored.eur };
      }
    }
    if (!rates) {
      log.warn("No saved or live exchange rates: using the fixed fallback rates.");
      return FALLBACK_RATES; // Not cached: the next request tries again.
    }
    cached = rates;
    cachedAt = now();
    return rates;
  };
}

module.exports = { FEED_URL, RATES_COLLECTION, RATES_DOC, FALLBACK_RATES, FRESH_MS, READ_CACHE_MS, SANE_RANGE,
  parseFeed, parseStored, refreshStoredRates, createRateReader };
