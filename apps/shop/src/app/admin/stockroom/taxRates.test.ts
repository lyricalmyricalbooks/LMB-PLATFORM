// The Tax centre's exchange rates, checked against the old stockroom app's rules (main.js refreshDailyRates,
// warmSaleFxHistory, healExpenseRates, resolveExpenseRate): the same rows need a rate, get the same value, and the same
// rows are left alone.
import { beforeEach, describe, expect, it } from "vitest";

import { saleCadAmounts } from "@stockroom/sale-fx.js";

import { datedRate, expenseRate, forgetLiveRates, keptRates } from "./datedRates";
import { sourcesOf } from "./moneyReports";
import type { StockroomRecords } from "./stockroomData";
import {
  expenseNeedsRate, expenseRatesFor, fetchDailyRates, fillExpenseRates, giftNeedsRate, healExpenseRates, refreshTaxRates, resetTaxRates,
  warmSaleRates, withDailyRates,
} from "./taxRates";

type Row = Record<string, any>;

function memoryStore() {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }, data };
}

/** A fake of the rate services: Frankfurter dated, range and latest; open.er-api latest. */
function rateServices(opts: { dated?: Record<string, number>; series?: Record<string, number>; live?: Record<string, number>; daily?: Record<string, number>; down?: boolean } = {}) {
  const asked: string[] = [];
  const answer = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });
  const fetch = (url: string) => {
    asked.push(url);
    if (opts.down) return Promise.reject(new Error("offline"));
    let m = url.match(/frankfurter\.dev\/v1\/(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\?from=(\w+)&to=(\w+)/);
    if (m) return answer({ rates: Object.fromEntries(Object.entries(opts.series || {}).map(([d, r]) => [d, { [m![4]]: r }])) });
    m = url.match(/frankfurter\.dev\/v1\/(\d{4}-\d{2}-\d{2})\?from=(\w+)&to=(\w+)/);
    if (m) { const r = opts.dated?.[`${m[2]}@${m[1]}`]; return r ? answer({ date: m[1], rates: { [m[3]]: r } }) : answer({}, false); }
    m = url.match(/frankfurter\.dev\/v1\/latest\?from=(\w+)&to=(\w+)/);
    if (m) { const r = opts.live?.[m[1]]; return r ? answer({ rates: { [m[2]]: r } }) : answer({}, false); }
    m = url.match(/open\.er-api\.com\/v6\/latest\/(\w+)/);
    if (m && m[1] === "CAD" && opts.daily) return answer({ rates: opts.daily });
    if (m) { const r = opts.live?.[m[1]]; return r ? answer({ rates: { CAD: r } }) : answer({}, false); }
    return answer({}, false); // the second dated service: not answering
  };
  return { fetch, asked };
}

const records = (over: Partial<StockroomRecords> = {}): StockroomRecords => ({ books: [], states: {}, taxCenter: {}, ...over } as unknown as StockroomRecords);

/** The stockroom writer, in memory: applies each change to the record it holds. */
function memoryWriter(start: { taxCenter?: Row; states?: Record<string, Row> }) {
  const db = { taxCenter: structuredClone(start.taxCenter || {}), states: structuredClone(start.states || {}) as Record<string, Row> };
  const saves: string[] = [];
  return {
    db, saves,
    updateSetting: (async (key: string, mutate: (c: unknown) => unknown) => {
      const before = JSON.stringify(db.taxCenter);
      db.taxCenter = (await mutate(structuredClone(db.taxCenter))) as Row;
      const changed = JSON.stringify(db.taxCenter) !== before;
      if (changed) saves.push(key);
      return { status: changed ? "saved" : "unchanged", value: db.taxCenter, merged: false, conflicts: [] };
    }) as any,
    saveBookState: (async (bookId: string, mutate: (s: Row) => Row) => {
      db.states[bookId] = await mutate(structuredClone(db.states[bookId] || {}));
      saves.push(bookId);
      return { status: "saved", state: db.states[bookId], merged: false, conflicts: [], written: ["expenses"] };
    }) as any,
  };
}

beforeEach(() => { forgetLiveRates(); resetTaxRates(); });

describe("which expenses need a rate (as the old app decided)", () => {
  it("business expenses: missing, never valued, or booked 1 to 1", () => {
    expect(expenseNeedsRate({ currency: "USD", amount: 20, fxMissing: true, baseAmount: null })).toBe(true);
    expect(expenseNeedsRate({ currency: "USD", amount: 20 })).toBe(true);
    expect(expenseNeedsRate({ currency: "USD", amount: 20, fxRate: 1, baseAmount: 20 })).toBe(true);
    expect(expenseNeedsRate({ currency: "USD", amount: 20, fxRate: 1.37, baseAmount: 27.4 })).toBe(false);
    expect(expenseNeedsRate({ currency: "CAD", amount: 20 })).toBe(false);
    expect(expenseNeedsRate({ currency: "USD", amount: 20, amountUnknown: true })).toBe(false);
    expect(expenseNeedsRate({ currency: "USD", amount: 0 })).toBe(false);
  });
  it("gifted copies: only gratuity rows with no rate of their own, not voided", () => {
    expect(giftNeedsRate({ gratuity: true, currency: "EUR", amount: 12, baseAmount: 12 })).toBe(true);
    expect(giftNeedsRate({ gratuity: true, currency: "EUR", amount: 12 })).toBe(true);
    expect(giftNeedsRate({ gratuity: true, currency: "EUR", amount: 12, baseAmount: 18 })).toBe(false);
    expect(giftNeedsRate({ gratuity: true, currency: "EUR", amount: 12, fxRate: 1, baseAmount: 12 })).toBe(false);
    expect(giftNeedsRate({ gratuity: true, voided: true, currency: "EUR", amount: 12 })).toBe(false);
    expect(giftNeedsRate({ currency: "EUR", amount: 12 })).toBe(false);
  });
  it("fills in at the rate for each row's own date, rounded to the cent, and skips a rate of 1", () => {
    const rows = [
      { id: 1, currency: "USD", amount: 19.99, date: "2026-03-02", fxMissing: true, baseAmount: null },
      { id: 2, currency: "USD", amount: 5, date: "2026-03-03" },
      { id: 3, currency: "USD", amount: 5, date: "2026-03-04", fxRate: 1.3, baseAmount: 6.5 },
    ];
    const out = fillExpenseRates(rows, { "USD@2026-03-02": 1.3712, "USD@2026-03-03": 1 }, "2026-11-11", false);
    expect(out.fixed).toBe(1);
    expect(out.rows[0]).toMatchObject({ fxRate: 1.3712, baseAmount: 27.41, fxMissing: false });
    expect(out.rows[1]).toBe(rows[1]);
    expect(out.rows[2]).toBe(rows[2]);
  });
});

describe("rate lookups", () => {
  it("an expense's rate: its own date first, then today's, then the saved daily rate, then 0", async () => {
    const store = memoryStore();
    const dated = rateServices({ dated: { "USD@2026-03-02": 1.35 }, live: { USD: 1.4 } });
    expect(await expenseRate("USD", "2026-03-02", "CAD", { fetch: dated.fetch, store })).toBe(1.35);
    expect(keptRates(store)["USD_CAD@2026-03-02"]).toBe(1.35);
    expect(await expenseRate("USD", "2026-03-05", "CAD", { fetch: dated.fetch, store })).toBe(1.4);
    forgetLiveRates();
    const down = rateServices({ down: true });
    expect(await expenseRate("GBP", "2026-03-05", "CAD", { fetch: down.fetch, store, saved: { GBP_CAD: 1.8 } })).toBe(1.8);
    forgetLiveRates();
    expect(await expenseRate("GBP", "2026-03-05", "CAD", { fetch: down.fetch, store })).toBe(0);
    expect(await expenseRate("CAD", "2026-03-05", "CAD", { fetch: down.fetch, store })).toBe(1);
  });
  it("a kept dated rate is never asked for again", async () => {
    const store = memoryStore();
    const s = rateServices({ dated: { "EUR@2026-01-05": 1.5 } });
    await datedRate("EUR", "CAD", "2026-01-05", { fetch: s.fetch, store });
    await datedRate("EUR", "CAD", "2026-01-05", { fetch: s.fetch, store });
    expect(s.asked).toHaveLength(1);
  });
  it("the rates before a save are into the Tax centre's base currency, 0 when none", async () => {
    const s = rateServices({ dated: { "USD@2026-03-02": 1.35 } });
    const out = await expenseRatesFor([{ currency: "USD", date: "2026-03-02" }, { currency: "CAD", date: "2026-03-02" }, { currency: "JPY", date: "2026-03-02" }], { settings: { baseCurrency: "CAD" } }, { fetch: s.fetch, store: memoryStore() });
    expect(out).toEqual({ "USD@2026-03-02": 1.35, "JPY@2026-03-02": 0 });
  });
  it("today's rates are saved the old way: dollars for one unit, once a day", async () => {
    const daily = await fetchDailyRates(rateServices({ daily: { CAD: 1, USD: 0.8, EUR: 0.625 } }).fetch as any);
    expect(daily).toEqual({ CAD_CAD: 1, USD_CAD: 1.25, EUR_CAD: 1.6 });
    const tc = withDailyRates({ businessExpenses: [] }, daily!, "2026-11-11");
    expect(tc.settings).toEqual({ baseCurrency: "CAD", rates: daily, lastRateSync: "2026-11-11" });
    expect(withDailyRates(tc, { USD_CAD: 9 }, "2026-11-11")).toBe(tc);
  });
});

describe("each sale at its own date's rate", () => {
  const book = { id: "b1", title: "Salt Hours", currency: "EUR" };
  const states = { b1: { hist: [{ date: "2026-02-07", qty: 2, price: 20 }, { date: "2026-02-10", qty: 1, price: 20, cadRate: 1.45 }, { date: "2026-02-11", qty: 1, price: 20, voided: true }], artistPayouts: [{ date: "2026-02-12", amount: 5 }] } };

  it("fetches one range per currency for the dates still estimated, weekends taking the day before", async () => {
    const store = memoryStore();
    const s = rateServices({ series: { "2026-02-06": 1.51, "2026-02-12": 1.53 } });
    const warmed = await warmSaleRates(records({ books: [book], states } as any), { fetch: s.fetch, store });
    expect(warmed).toBe(true);
    expect(s.asked).toEqual(["https://api.frankfurter.dev/v1/2026-01-31..2026-02-12?from=EUR&to=CAD"]);
    // Saturday the 7th takes Friday's rate; the stamped and voided sales are not asked for.
    expect(keptRates(store)).toEqual({ "EUR_CAD@2026-02-07": 1.51, "EUR_CAD@2026-02-12": 1.53 });
  });

  it("the Tax centre then values the sale exactly as the old app did", async () => {
    const store = memoryStore();
    await warmSaleRates(records({ books: [book], states } as any), { fetch: rateServices({ series: { "2026-02-06": 1.51 } }).fetch, store });
    const sources = sourcesOf(records({ books: [book], states, taxCenter: { settings: { rates: { EUR_CAD: 1.6 } } } } as any), keptRates(store));
    const old = saleCadAmounts(states.b1.hist[0], "EUR", sources.fxRateCache);
    expect(old).toMatchObject({ merchandiseCad: 40 * 1.51, estimated: false });
  });

  it("a failed range waits ten minutes before asking again", async () => {
    const down = rateServices({ down: true });
    const now = Date.parse("2026-11-11T12:00:00Z");
    expect(await warmSaleRates(records({ books: [book], states } as any), { fetch: down.fetch, store: memoryStore(), now: () => now })).toBe(false);
    expect(await warmSaleRates(records({ books: [book], states } as any), { fetch: down.fetch, store: memoryStore(), now: () => now + 60_000 })).toBe(false);
    expect(down.asked).toHaveLength(1);
  });
});

describe("filling in missing expense values", () => {
  it("saves the Tax centre and each gifted-copy book once, and reports how many", async () => {
    const taxCenter = { businessExpenses: [
      { id: 1, currency: "USD", amount: 10, date: "2026-03-02", fxMissing: true, baseAmount: null },
      { id: 2, currency: "USD", amount: 10, date: "2026-03-02", fxRate: 1, baseAmount: 10 },
      { id: 3, currency: "CAD", amount: 10, date: "2026-03-02" },
    ] };
    const states = { b1: { expenses: [{ id: 9, gratuity: true, currency: "EUR", amount: 12, date: "2026-03-02", baseAmount: 12 }, { id: 10, currency: "EUR", amount: 3, date: "2026-03-02" }] }, b2: { expenses: [] } };
    const w = memoryWriter({ taxCenter, states });
    const s = rateServices({ dated: { "USD@2026-03-02": 1.35, "EUR@2026-03-02": 1.5 } });
    const out = await healExpenseRates(records({ taxCenter, states } as any), { fetch: s.fetch, store: memoryStore(), updateSetting: w.updateSetting, saveBookState: w.saveBookState });
    expect(out.fixed).toBe(3);
    expect(w.saves).toEqual(["taxCenter", "b1"]);
    expect(w.db.taxCenter.businessExpenses.map((e: Row) => e.baseAmount)).toEqual([13.5, 13.5, undefined]);
    expect(w.db.states.b1.expenses[0]).toMatchObject({ baseAmount: 18, fxMissing: false });
    expect(w.db.states.b1.expenses[0].fxRate).toBeUndefined();
    expect(w.db.states.b1.expenses[1]).toEqual(states.b1.expenses[1]);
  });

  it("offline, nothing is saved and the rows stay as they were", async () => {
    const taxCenter = { businessExpenses: [{ id: 1, currency: "USD", amount: 10, date: "2026-03-02", fxMissing: true, baseAmount: null }] };
    const w = memoryWriter({ taxCenter });
    const out = await healExpenseRates(records({ taxCenter } as any), { fetch: rateServices({ down: true }).fetch, store: memoryStore(), updateSetting: w.updateSetting, saveBookState: w.saveBookState });
    expect(out.fixed).toBe(0);
    expect(w.saves).toEqual([]);
  });
});

describe("the background refresh", () => {
  it("runs at most once every five minutes, and not offline", async () => {
    const w = memoryWriter({});
    const s = rateServices({ daily: { CAD: 1, USD: 0.8 } });
    const deps = { fetch: s.fetch, store: memoryStore(), updateSetting: w.updateSetting, saveBookState: w.saveBookState };
    const now = Date.parse("2026-11-11T12:00:00Z");
    expect(await refreshTaxRates(records(), { ...deps, online: () => false, now: () => now })).toBeNull();
    const first = await refreshTaxRates(records(), { ...deps, online: () => true, now: () => now });
    expect(first).toMatchObject({ changed: true, healed: 0 });
    expect(first!.taxCenter!.settings.rates.USD_CAD).toBe(1.25);
    expect(await refreshTaxRates(records(), { ...deps, online: () => true, now: () => now + 60_000 })).toBeNull();
  });
});
