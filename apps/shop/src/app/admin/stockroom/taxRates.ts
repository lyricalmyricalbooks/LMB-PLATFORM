// The exchange rates the Tax centre's figures wait on, fetched in the background as the old stockroom app did (main.js
// refreshDailyRates, warmSaleFxHistory, healExpenseRates, refreshTaxCentreRates):
//   1. today's rates into the Tax centre's settings (`settings.rates`, `lastRateSync`), once a day;
//   2. the published rate for the date of every foreign-currency sale and payout, kept in this browser (datedRates.ts),
//      so each sale is valued at its own date's rate instead of today's;
//   3. a value in dollars for expenses saved without one (`fxMissing`, or booked 1 to 1 by an older build), at the rate
//      for each expense's own date. Business expenses and gifted-copy book expenses only, as before.
// The page passes the records it shows; the saves go through the stockroom writer (WRITING.md) and the page swaps in
// what they returned. Throttled to once every five minutes, so a stretch offline doesn't retry on every visit.
import { useEffect, useState } from "react";

import { getBookCurrencyCode, roundCents } from "@stockroom/money.js";
import { datesNeedingRates, fillDatedRates } from "@stockroom/sale-fx.js";

import { expenseRate, keep, keptRates, rateSeries, type RateCache } from "./datedRates";
import type { StockroomRecords } from "./stockroomData";
import { stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
type Store = Pick<Storage, "getItem" | "setItem"> | null;

export type RateDeps = {
  fetch?: Fetch;
  store?: Store;
  now?: () => number;
  online?: () => boolean;
  updateSetting?: typeof stockroomWriteApi.updateSetting;
  saveBookState?: typeof stockroomWriteApi.saveBookState;
};

const code = (c: unknown) => String(c || "CAD").toUpperCase();
const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rateKey = (cur: string, day: string) => `${cur}@${day}`;

// ── 1. Today's rates ───────────────────────────────────────────────────────────────────────────────────────────────

/** Today's rates into dollars from one request, as the old app saved them (`USD_CAD` = dollars for one US dollar). */
export async function fetchDailyRates(get: Fetch): Promise<RateCache | null> {
  try {
    const res = await get("https://open.er-api.com/v6/latest/CAD");
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, unknown> } | null;
    if (!json?.rates) return null;
    const rates: RateCache = {};
    for (const [cur, v] of Object.entries(json.rates)) if (Number(v) > 0) rates[`${cur}_CAD`] = 1 / Number(v);
    rates.CAD_CAD = 1;
    return rates;
  } catch { return null; }
}

/** The Tax centre with today's rates in its settings, or as it was when they are already today's. */
export function withDailyRates(tc: Row | null, rates: RateCache, today: string): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  if (cur.settings?.lastRateSync === today && cur.settings?.rates) return cur;
  return { ...cur, settings: { ...(cur.settings || { baseCurrency: "CAD" }), rates, lastRateSync: today } };
}

// ── 2. Each sale's own date ────────────────────────────────────────────────────────────────────────────────────────

let retrySalesAt = 0;

/** Fetch the dated rates foreign-currency sales and payouts still need, one request per currency. True when any arrived. */
export async function warmSaleRates(records: StockroomRecords, deps: RateDeps = {}): Promise<boolean> {
  const now = (deps.now ?? Date.now)();
  if (now < retrySalesAt) return false;
  const cache = keptRates(deps.store);
  const books = Object.fromEntries(records.books.map((b) => [b.id, b as Row]));
  const wanted = datesNeedingRates(books, records.states as Record<string, Row>, cache, { currencyOf: getBookCurrencyCode });
  let filled = 0;
  for (const [cur, dates] of wanted) {
    try {
      // A week's lead so a sale on a weekend or holiday finds the rate before it.
      const series = await rateSeries(cur, "CAD", addDays(dates[0], -7), dates[dates.length - 1], { fetch: deps.fetch });
      filled += fillDatedRates(cache, cur, "CAD", series, dates);
    } catch {
      retrySalesAt = now + 10 * 60_000;
    }
  }
  if (filled) keep(cache, deps.store);
  return filled > 0;
}

// ── 3. Expenses saved without a value in dollars ───────────────────────────────────────────────────────────────────

/** A business expense in another currency with no value in dollars, or one an older build booked at 1 to 1. */
export function expenseNeedsRate(e: Row | null | undefined): boolean {
  if (!e) return false;
  if (code(e.currency) === "CAD" || e.amountUnknown || !(Number(e.amount) > 0)) return false;
  if (e.fxMissing === true || e.baseAmount == null) return true;
  return Number(e.fxRate) === 1 && Math.abs(Number(e.baseAmount) - Number(e.amount)) < 0.005;
}

/** A gifted-copy expense on a foreign-currency book with no value in dollars (it never carries an fxRate). */
export function giftNeedsRate(e: Row | null | undefined): boolean {
  if (!e || e.gratuity !== true || e.voided) return false;
  if (code(e.currency) === "CAD" || !(Number(e.amount) > 0) || e.fxRate != null) return false;
  if (e.fxMissing === true || e.baseAmount == null) return true;
  return Math.abs(Number(e.baseAmount) - Number(e.amount)) < 0.005;
}

/** The rows with their value filled in from `rates` (currency@day → rate). A rate of 0 or 1 is left out, as before. */
export function fillExpenseRates(rows: Row[], rates: RateCache, today: string, gift: boolean): { rows: Row[]; fixed: number } {
  let fixed = 0;
  const out = rows.map((e) => {
    if (!(gift ? giftNeedsRate(e) : expenseNeedsRate(e))) return e;
    const rate = rates[rateKey(code(e.currency), e.date || today)];
    if (!rate || rate === 1) return e;
    fixed++;
    const base = roundCents((Number(e.amount) || 0) * rate);
    return gift ? { ...e, baseAmount: base, fxMissing: false } : { ...e, fxRate: rate, baseAmount: base, fxMissing: false };
  });
  return { rows: out, fixed };
}

async function ratesFor(rows: Row[], needs: (e: Row) => boolean, today: string, saved: RateCache | null, deps: RateDeps, into: RateCache) {
  for (const e of rows) {
    if (!needs(e)) continue;
    const key = rateKey(code(e.currency), e.date || today);
    if (key in into) continue;
    into[key] = await expenseRate(code(e.currency), e.date || today, "CAD", { fetch: deps.fetch, saved, store: deps.store, now: deps.now?.() });
  }
}

export type HealResult = { fixed: number; taxCenter?: Row; states: Record<string, Row> };

/** Fill in the value in dollars of expenses that lack one, saving the Tax centre and each book that changed. */
export async function healExpenseRates(records: StockroomRecords, deps: RateDeps = {}): Promise<HealResult> {
  const updateSetting = deps.updateSetting ?? stockroomWriteApi.updateSetting;
  const saveBookState = deps.saveBookState ?? stockroomWriteApi.saveBookState;
  const today = localDay((deps.now ?? Date.now)());
  const tc = (records.taxCenter || {}) as Row;
  const saved = (tc.settings?.rates as RateCache) || null;
  const rates: RateCache = {};
  const out: HealResult = { fixed: 0, states: {} };

  const business: Row[] = Array.isArray(tc.businessExpenses) ? tc.businessExpenses : [];
  await ratesFor(business, expenseNeedsRate, today, saved, deps, rates);
  if (fillExpenseRates(business, rates, today, false).fixed) {
    let fixed = 0;
    const result = await updateSetting("taxCenter", (current) => {
      const cur = (current && typeof current === "object" ? current : {}) as Row;
      const filled = fillExpenseRates(Array.isArray(cur.businessExpenses) ? cur.businessExpenses : [], rates, today, false);
      fixed = filled.fixed;
      return filled.fixed ? { ...cur, businessExpenses: filled.rows } : cur;
    });
    if (result.status === "saved" || result.status === "unchanged") { out.fixed += fixed; out.taxCenter = (result.value as Row) || undefined; }
  }

  for (const [bookId, state] of Object.entries(records.states || {})) {
    const expenses: Row[] = Array.isArray((state as Row)?.expenses) ? (state as Row).expenses : [];
    await ratesFor(expenses, giftNeedsRate, today, saved, deps, rates);
    if (!fillExpenseRates(expenses, rates, today, true).fixed) continue;
    let fixed = 0;
    const result = await saveBookState(bookId, (st) => {
      const filled = fillExpenseRates(Array.isArray((st as Row).expenses) ? (st as Row).expenses : [], rates, today, true);
      fixed = filled.fixed;
      return filled.fixed ? ({ ...st, expenses: filled.rows } as typeof st) : st;
    });
    if (result.status === "saved" || result.status === "unchanged") { out.fixed += fixed; out.states[bookId] = result.state as Row; }
  }
  return out;
}

/**
 * The rate for each expense's own date into the Tax centre's base currency, looked up before a save (main.js
 * resolveExpenseRate): `CUR@YYYY-MM-DD` → rate, 0 when none could be found.
 */
export async function expenseRatesFor(items: Array<{ currency: string; date: string }>, taxCenter: Row | null, deps: RateDeps = {}): Promise<RateCache> {
  const base = code((taxCenter?.settings?.baseCurrency as string) || "CAD");
  const saved = (taxCenter?.settings?.rates as RateCache) || null;
  const out: RateCache = {};
  for (const { currency, date } of items) {
    const cur = code(currency);
    const key = rateKey(cur, date);
    if (cur === base || key in out) continue;
    out[key] = await expenseRate(cur, date, base, { fetch: deps.fetch, saved, store: deps.store, now: deps.now?.() });
  }
  return out;
}

// ── All three, in the background ───────────────────────────────────────────────────────────────────────────────────

let checkedAt = -Infinity;

/** For tests: let the next refresh run at once. */
export function resetTaxRates() { checkedAt = -Infinity; retrySalesAt = 0; }

export type RatesRefresh = { changed: boolean; healed: number; taxCenter?: Row; states: Record<string, Row> };

/** Today's rates, each sale's own date's rate and the missing expense values. `null` when it ran less than five minutes ago or offline. */
export async function refreshTaxRates(records: StockroomRecords, deps: RateDeps = {}): Promise<RatesRefresh | null> {
  const now = (deps.now ?? Date.now)();
  const online = deps.online ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  if (now - checkedAt < 5 * 60_000 || !online()) return null;
  checkedAt = now;
  const today = localDay(now);
  const updateSetting = deps.updateSetting ?? stockroomWriteApi.updateSetting;
  let current = records;
  let taxCenter: Row | undefined;
  const settings = (records.taxCenter as Row | null)?.settings;
  if (!(settings?.lastRateSync === today && settings?.rates)) {
    const daily = await fetchDailyRates(deps.fetch ?? ((url, init) => fetch(url, init)));
    if (daily) {
      const result = await updateSetting("taxCenter", (cur) => withDailyRates(cur as Row | null, daily, today));
      if (result.status === "saved" || result.status === "unchanged") {
        taxCenter = (result.value as Row) || undefined;
        if (taxCenter) current = { ...records, taxCenter };
      }
    }
  }
  const [warmed, healed] = await Promise.all([warmSaleRates(current, deps), healExpenseRates(current, deps)]);
  taxCenter = healed.taxCenter ?? taxCenter;
  return { changed: Boolean(warmed || taxCenter || healed.fixed), healed: healed.fixed, taxCenter, states: healed.states };
}

/** The records a money page shows, refreshed once the background rates come in (a new object, so the figures are worked out again). */
export function useRatedRecords(initial: StockroomRecords) {
  const [records, setRecords] = useState(initial);
  useEffect(() => {
    let live = true;
    taxRatesApi.refreshTaxRates(initial).then((r) => {
      if (!live || !r?.changed) return;
      setRecords((cur) => ({ ...cur, ...(r.taxCenter ? { taxCenter: r.taxCenter } : {}), states: { ...cur.states, ...r.states } }));
    }, (error) => console.warn("Exchange rates could not be brought up to date", error));
    return () => { live = false; };
  }, [initial]);
  return [records, setRecords] as const;
}

/** What the pages call, so the admin fixture and tests can stand in for the rate services. */
export const taxRatesApi = { expenseRatesFor, refreshTaxRates };
