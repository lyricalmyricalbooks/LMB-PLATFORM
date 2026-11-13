// Orders › Bring past orders over (plan 23.14): a suggested rate for orders sold in another currency. The Bank of
// Canada publishes a daily average rate for the main currencies against the Canadian dollar (its free Valet service,
// no key). This answers each currency's average over the dates in the old shop's order file, rounded to 4 places, so
// the owner starts from a sensible number and can still type their own. Nothing is saved here. The read goes through
// the old-shop fetch (moving/safeFetch.mjs: public https only, pinned to the checked address, 15 seconds, 5 MB).
"use strict";

/** The Bank of Canada's daily series for each currency it publishes against the Canadian dollar. */
const SERIES = Object.freeze({
  USD: "FXUSDCAD", EUR: "FXEURCAD", GBP: "FXGBPCAD", AUD: "FXAUDCAD", NZD: "FXNZDCAD", JPY: "FXJPYCAD", CHF: "FXCHFCAD",
  CNY: "FXCNYCAD", HKD: "FXHKDCAD", INR: "FXINRCAD", MXN: "FXMXNCAD", NOK: "FXNOKCAD", SEK: "FXSEKCAD", SGD: "FXSGDCAD",
  ZAR: "FXZARCAD", KRW: "FXKRWCAD", BRL: "FXBRLCAD", TWD: "FXTWDCAD", IDR: "FXIDRCAD", PEN: "FXPENCAD", SAR: "FXSARCAD",
  TRY: "FXTRYCAD",
});
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_YEARS = 15;

/**
 * { rates: { USD: 1.3712 }, from, to } for the currencies the bank publishes; others are left out. `base` is the
 * shop's own currency: each rate is what one unit was worth in it. The bank publishes against the Canadian dollar
 * only, so a shop that sells in US dollars gets each day's rate divided by that day's US dollar rate (and the
 * Canadian dollar itself as one over it).
 */
async function averageRates({ currencies, from, to, base = "CAD" }, { getJson }) {
  const usBase = base === "USD";
  const wanted = [...new Set(currencies)].filter((c) => c !== base && (SERIES[c] || (usBase && c === "CAD")));
  if (!wanted.length) return { rates: {}, from, to };
  const series = [...new Set([...(usBase ? ["USD"] : []), ...wanted.filter((c) => SERIES[c])].map((c) => SERIES[c]))];
  const url = `https://www.bankofcanada.ca/valet/observations/${series.join(",")}/json?start_date=${from}&end_date=${to}`;
  const data = await getJson(url);
  const rows = Array.isArray(data?.observations) ? data.observations : [];
  const good = (v) => Number.isFinite(v) && v > 0;
  const rates = {};
  for (const c of wanted) {
    const values = rows.map((r) => {
      const inCad = c === "CAD" ? 1 : Number(r?.[SERIES[c]]?.v);
      if (!usBase) return inCad;
      const usd = Number(r?.[SERIES.USD]?.v);
      return good(usd) ? inCad / usd : NaN;
    }).filter(good);
    if (values.length) rates[c] = Math.round((values.reduce((x, y) => x + y, 0) / values.length) * 10000) / 10000;
  }
  return { rates, from, to };
}

/** { status, body } for one request: `{ currencies: ["USD"], from: "2025-01-01", to: "2025-06-30" }`. */
async function handleExchangeRates(body, { allow, getJson, now = new Date(), base = "CAD" }) {
  const currencies = Array.isArray(body?.currencies) ? body.currencies.filter((c) => typeof c === "string" && /^[A-Z]{3}$/.test(c)) : [];
  const from = typeof body?.from === "string" && DAY.test(body.from) ? body.from : "";
  const today = now.toISOString().slice(0, 10);
  const to = typeof body?.to === "string" && DAY.test(body.to) ? (body.to > today ? today : body.to) : "";
  if (!currencies.length || currencies.length > 10 || !from || !to || from > to || Date.parse(to) - Date.parse(from) > MAX_YEARS * 366 * 86400000) {
    return { status: 400, body: { error: "Choose the order file again so we know which dates to look up." } };
  }
  if (!(await allow())) return { status: 429, body: { error: "That's a lot of look-ups in a short time. Wait a few minutes and try again." } };
  return { status: 200, body: await averageRates({ currencies, from, to, base }, { getJson }) };
}

/** The old-shop fetch, loaded on first use (the server is CommonJS; the copy is an ES module). */
const getBankJson = async (url) => (await import("./moving/safeFetch.mjs")).getPublicJson(url);

module.exports = { SERIES, averageRates, handleExchangeRates, getBankJson };
