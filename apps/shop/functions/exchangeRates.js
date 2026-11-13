// Daily exchange rates: one saved copy that the storefront shows and checkout charges.
//
// `refreshExchangeRates` (scheduled, functions/index.js) fetches the shop currency's rates (CAD→USD/EUR, or USD→CAD/EUR for a shop that sells in US dollars) from the free feed and saves it in the
// public `settings/exchangeRates` document. Checkout reads that same document (`createRateReader`), so a USD/EUR
// shopper is charged the rate the shop showed them. The feed publishes new rates once a day; the job runs every
// few hours so a missed fetch is retried the same day.
//
// Safety: a rate outside SANE_RANGE is never saved or used (a broken feed must not reprice the shop). When the saved
// copy is older than FRESH_MS the reader fetches live; when that fails it keeps the last good saved rates rather than
// the old fixed numbers, and only a shop that has never saved a rate falls back to the fixed fallback rates.
//
// Every rate is "one unit of the shop's currency in that currency" (shopConfig.currency, shared/shopCurrency), so the
// shop's own currency is always 1. A saved copy made for another base currency is never used: it reads as missing.

const { shopCurrencyOf } = require("./shared/shopCurrency");

const RATES_COLLECTION = "settings";
const RATES_DOC = "exchangeRates";
/** Per shop currency: where today's rates come from, the fixed last resort, and the bounds a real rate stays inside. */
const BASES = Object.freeze({
  CAD: Object.freeze({
    feed: "https://open.er-api.com/v6/latest/CAD",
    fallback: Object.freeze({ cad: 1.0, usd: 0.73, eur: 0.67 }),
    /** One Canadian dollar has stayed well inside these for decades; anything outside is a broken answer. */
    sane: Object.freeze({ usd: [0.4, 1.2], eur: [0.3, 1.1] }),
  }),
  USD: Object.freeze({
    feed: "https://open.er-api.com/v6/latest/USD",
    fallback: Object.freeze({ usd: 1.0, cad: 1.37, eur: 0.92 }),
    /** The same history seen from one US dollar. */
    sane: Object.freeze({ cad: [0.83, 2.5], eur: [0.5, 1.5] }),
  }),
});
const FEED_URL = BASES.CAD.feed;
const FALLBACK_RATES = BASES.CAD.fallback;
const SANE_RANGE = BASES.CAD.sane;
/** Saved rates newer than this are used as they are; older ones trigger a live fetch first. */
const FRESH_MS = 36 * 60 * 60 * 1000;
/** How long one Functions instance reuses what it read, so a busy checkout isn't a read per request. */
const READ_CACHE_MS = 5 * 60 * 1000;

const baseOf = base => shopCurrencyOf(typeof base === "function" ? base() : base);
/** The fixed last-resort rates for a shop currency: `{ cad, usd, eur }` with the shop's own at 1. */
const fallbackRatesFor = base => BASES[baseOf(base)].fallback;

/** `{ usd, eur }` (or `{ cad, eur }` for a USD shop) from `read(code)`, or null when any is missing or not sane. */
function saneRates(base, read) {
  const out = {};
  for (const [code, [lo, hi]] of Object.entries(BASES[base].sane)) {
    const n = Number(read(code));
    if (!(Number.isFinite(n) && n >= lo && n <= hi)) return null;
    out[code] = n;
  }
  return out;
}

/** The feed's answer → `{ usd, eur, providerUpdatedAt }` (the shop currency's other two), or null when it is unusable. */
function parseFeed(data, base = "CAD") {
  const b = baseOf(base);
  if (!data || (data.result && data.result !== "success") || (data.base_code && data.base_code !== b)) return null;
  const rates = saneRates(b, code => data.rates && data.rates[code.toUpperCase()]);
  if (!rates) return null;
  const unix = Number(data.time_last_update_unix);
  return { ...rates, providerUpdatedAt: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : null };
}

/** A saved document → `{ usd, eur, fetchedAtMs }`, or null when it is missing, not sane or saved for another currency. */
function parseStored(data, base = "CAD") {
  const b = baseOf(base);
  // A copy saved before shops had a currency has no `base`: it is Canadian.
  if (!data || String(data.base || "CAD").toUpperCase() !== b) return null;
  const rates = saneRates(b, code => data[code]);
  const fetchedAtMs = Date.parse(data.fetchedAt || "");
  if (!rates || !Number.isFinite(fetchedAtMs)) return null;
  return { ...rates, fetchedAtMs };
}

const onlyRates = (base, value) => Object.fromEntries(Object.keys(BASES[base].sane).map(code => [code, value[code]]));
const withBase = (base, value) => ({ [base.toLowerCase()]: 1.0, ...onlyRates(base, value) });

async function fetchFeed(fetchImpl, timeoutMs, base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(BASES[base].feed, { signal: controller.signal });
    if (!res.ok) return null;
    return parseFeed(await res.json(), base);
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
async function refreshStoredRates({ db, base = "CAD", fetchImpl = fetch, now = () => Date.now(), timeoutMs = 10000 } = {}) {
  const b = baseOf(base);
  const fresh = await fetchFeed(fetchImpl, timeoutMs, b);
  const at = new Date(now()).toISOString();
  if (!fresh) {
    // Record the miss without touching the rates: shoppers keep the last good numbers.
    await Promise.resolve().then(() => ratesDoc(db).set({ lastAttemptAt: at, lastError: "The exchange-rate feed did not give usable rates." }, { merge: true })).catch(() => {});
    return null;
  }
  const record = { base: b, ...onlyRates(b, fresh), fetchedAt: at, lastAttemptAt: at, lastError: null,
    providerUpdatedAt: fresh.providerUpdatedAt, source: "open.er-api.com" };
  await ratesDoc(db).set(record);
  return record;
}

/**
 * `getExchangeRates()` for checkout: `{ cad, usd, eur }` (the shop's own currency at 1) from the saved copy, refreshed
 * live when it is stale, keeping the last good copy when the feed is down. Never throws. `base` is the shop's currency,
 * or a function that reads it when asked: one server runs every shop, so what was read is remembered per currency and
 * per shop folder is not needed (two shops in the same currency are charged the same day's rates).
 */
function createRateReader({ db, base = "CAD", fetchImpl = fetch, now = () => Date.now(), cacheMs = READ_CACHE_MS, liveTimeoutMs = 3000, log = console } = {}) {
  const cache = new Map();
  return async function getExchangeRates() {
    const b = baseOf(base);
    const hit = cache.get(b);
    if (hit && now() - hit.at < cacheMs) return hit.rates;
    let stored = null;
    try { stored = parseStored((await ratesDoc(db).get()).data(), b); } catch (err) { log.warn("Could not read saved exchange rates:", err && err.message); }
    let rates = null;
    if (stored && now() - stored.fetchedAtMs < FRESH_MS) {
      rates = withBase(b, stored);
    } else {
      const live = await fetchFeed(fetchImpl, liveTimeoutMs, b);
      if (live) {
        rates = withBase(b, live);
        // Share it with the storefront too; a failed write only means the next job saves it.
        const at = new Date(now()).toISOString();
        Promise.resolve().then(() => ratesDoc(db).set({ base: b, ...onlyRates(b, live), fetchedAt: at,
          lastAttemptAt: at, lastError: null, providerUpdatedAt: live.providerUpdatedAt, source: "open.er-api.com" })).catch(() => {});
      } else if (stored) {
        log.warn("Exchange-rate feed unreachable: using the last saved rates from", new Date(stored.fetchedAtMs).toISOString());
        rates = withBase(b, stored);
      }
    }
    if (!rates) {
      log.warn("No saved or live exchange rates: using the fixed fallback rates.");
      return BASES[b].fallback; // Not cached: the next request tries again.
    }
    cache.set(b, { rates, at: now() });
    return rates;
  };
}

module.exports = { FEED_URL, RATES_COLLECTION, RATES_DOC, FALLBACK_RATES, FRESH_MS, READ_CACHE_MS, SANE_RANGE, BASES,
  fallbackRatesFor, parseFeed, parseStored, refreshStoredRates, createRateReader };
