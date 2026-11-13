// Daily exchange rates: checkout charges the saved copy the storefront shows, refreshed by a scheduled job.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FALLBACK_RATES, FRESH_MS, READ_CACHE_MS, parseFeed, parseStored, fallbackRatesFor, refreshStoredRates, createRateReader } = require("./exchangeRates.js");

const HOUR = 60 * 60 * 1000;
const fakeDb = (initial = null) => {
  const state = { data: initial, writes: [] };
  const ref = {
    get: async () => ({ data: () => state.data ?? undefined }),
    set: async (value, opts) => { state.writes.push({ value, opts }); state.data = opts?.merge ? { ...(state.data || {}), ...value } : value; },
  };
  return { state, collection: (name) => ({ doc: (id) => { expect(`${name}/${id}`).toBe("settings/exchangeRates"); return ref; } }) };
};
const feed = (usd, eur, extra = {}) => vi.fn(async () => new Response(JSON.stringify({ result: "success", base_code: "CAD", time_last_update_unix: 1760227200, rates: { USD: usd, EUR: eur }, ...extra }), { status: 200 }));
const down = () => vi.fn(async () => { throw new Error("offline"); });
const quiet = { warn: () => {} };

describe("parseFeed", () => {
  it("takes CAD→USD/EUR and the feed's own update time", () => {
    expect(parseFeed({ result: "success", base_code: "CAD", time_last_update_unix: 1760227200, rates: { USD: 0.71, EUR: 0.62 } }))
      .toEqual({ usd: 0.71, eur: 0.62, providerUpdatedAt: "2025-10-12T00:00:00.000Z" });
  });
  it("refuses an error answer, another base currency or a rate no Canadian dollar has had", () => {
    expect(parseFeed({ result: "error", rates: { USD: 0.7, EUR: 0.6 } })).toBeNull();
    expect(parseFeed({ base_code: "USD", rates: { USD: 1, EUR: 0.9 } })).toBeNull();
    expect(parseFeed({ rates: { USD: 71, EUR: 0.6 } })).toBeNull();
    expect(parseFeed({ rates: { USD: 0.7 } })).toBeNull();
    expect(parseFeed(null)).toBeNull();
  });
});

describe("refreshStoredRates (the scheduled job)", () => {
  it("saves today's rates for the storefront and checkout", async () => {
    const db = fakeDb();
    const saved = await refreshStoredRates({ db, fetchImpl: feed(0.71, 0.62), now: () => Date.parse("2026-10-12T12:00:00Z") });
    expect(saved).toMatchObject({ base: "CAD", usd: 0.71, eur: 0.62, fetchedAt: "2026-10-12T12:00:00.000Z", lastError: null });
    expect(db.state.data.usd).toBe(0.71);
  });
  it("a failed fetch keeps the last good rates and records the miss", async () => {
    const db = fakeDb({ usd: 0.7, eur: 0.6, fetchedAt: "2026-10-11T12:00:00.000Z" });
    expect(await refreshStoredRates({ db, fetchImpl: down() })).toBeNull();
    expect(db.state.data).toMatchObject({ usd: 0.7, eur: 0.6, fetchedAt: "2026-10-11T12:00:00.000Z" });
    expect(db.state.data.lastError).toMatch(/feed/);
  });
  it("a broken answer never reprices the shop", async () => {
    const db = fakeDb({ usd: 0.7, eur: 0.6, fetchedAt: "2026-10-11T12:00:00.000Z" });
    expect(await refreshStoredRates({ db, fetchImpl: feed(7.1, 0.6) })).toBeNull();
    expect(db.state.data.usd).toBe(0.7);
  });
});

describe("createRateReader (what checkout charges)", () => {
  const t0 = Date.parse("2026-10-12T12:00:00Z");
  it("uses the saved copy while it is fresh, without asking the feed", async () => {
    const db = fakeDb({ usd: 0.71, eur: 0.62, fetchedAt: new Date(t0 - 2 * HOUR).toISOString() });
    const fetchImpl = feed(0.5, 0.5);
    const read = createRateReader({ db, fetchImpl, now: () => t0, log: quiet });
    expect(await read()).toEqual({ cad: 1, usd: 0.71, eur: 0.62 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("re-reads after its short cache, so a new day's rates reach checkout", async () => {
    let clock = t0;
    const db = fakeDb({ usd: 0.71, eur: 0.62, fetchedAt: new Date(t0).toISOString() });
    const read = createRateReader({ db, fetchImpl: down(), now: () => clock, log: quiet });
    expect((await read()).usd).toBe(0.71);
    db.state.data = { usd: 0.72, eur: 0.63, fetchedAt: new Date(t0 + HOUR).toISOString() };
    clock = t0 + READ_CACHE_MS - 1;
    expect((await read()).usd).toBe(0.71);
    clock = t0 + READ_CACHE_MS + 1;
    expect((await read()).usd).toBe(0.72);
  });
  it("fetches live when the saved copy is stale, and saves what it got", async () => {
    const db = fakeDb({ usd: 0.7, eur: 0.6, fetchedAt: new Date(t0 - FRESH_MS - 1).toISOString() });
    const read = createRateReader({ db, fetchImpl: feed(0.72, 0.63), now: () => t0, log: quiet });
    expect(await read()).toEqual({ cad: 1, usd: 0.72, eur: 0.63 });
    await new Promise(r => setTimeout(r, 0));
    expect(db.state.data).toMatchObject({ usd: 0.72, eur: 0.63 });
  });
  it("keeps the last saved rates when the feed is down, rather than the old fixed numbers", async () => {
    const db = fakeDb({ usd: 0.7, eur: 0.6, fetchedAt: new Date(t0 - 5 * 24 * HOUR).toISOString() });
    const read = createRateReader({ db, fetchImpl: down(), now: () => t0, log: quiet });
    expect(await read()).toEqual({ cad: 1, usd: 0.7, eur: 0.6 });
  });
  it("falls back to the fixed rates only when nothing was ever saved, and tries again next time", async () => {
    const db = fakeDb();
    const fetchImpl = down();
    const read = createRateReader({ db, fetchImpl, now: () => t0, log: quiet });
    expect(await read()).toBe(FALLBACK_RATES);
    await read();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("survives an unreadable database", async () => {
    const db = { collection: () => { throw new Error("db down"); } };
    const read = createRateReader({ db, fetchImpl: feed(0.72, 0.63), now: () => t0, log: quiet });
    expect(await read()).toEqual({ cad: 1, usd: 0.72, eur: 0.63 });
  });
});

describe("wiring", () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js"), "utf8");
  it("checkout reads the shared reader and a scheduled job refreshes it", () => {
    // The shop's currency is read when the rates are asked for, never kept: one server runs every shop.
    expect(source).toContain("const getExchangeRates = createRateReader({ db, base: () => shopConfig.currency });");
    expect(source).toContain("refreshStoredRates({ db, base: shopConfig.currency })");
    expect(source).toMatch(/exports\.refreshExchangeRates = onSchedule\(\{ schedule: "every 3 hours"/);
    // No second, private copy of the feed that could disagree with what shoppers are shown.
    expect(source).not.toContain("open.er-api.com");
  });
});

describe("a shop that sells in US dollars", () => {
  const usFeed = (cad, eur) => vi.fn(async (url) => {
    expect(String(url)).toBe("https://open.er-api.com/v6/latest/USD");
    return new Response(JSON.stringify({ result: "success", base_code: "USD", time_last_update_unix: 1760227200, rates: { CAD: cad, EUR: eur, USD: 1 } }), { status: 200 });
  });
  it("reads the feed from the US dollar and refuses a Canadian answer or a broken rate", () => {
    expect(parseFeed({ base_code: "USD", rates: { CAD: 1.4, EUR: 0.9 } }, "USD")).toEqual({ cad: 1.4, eur: 0.9, providerUpdatedAt: null });
    expect(parseFeed({ base_code: "CAD", rates: { USD: 0.71, EUR: 0.62, CAD: 1 } }, "USD")).toBeNull();
    expect(parseFeed({ base_code: "USD", rates: { CAD: 0.71, EUR: 0.9 } }, "USD")).toBeNull();
    expect(parseFeed({ base_code: "USD", rates: { CAD: 1.4 } }, "USD")).toBeNull();
  });
  it("saves the day's rates marked as from the US dollar", async () => {
    const db = fakeDb();
    const saved = await refreshStoredRates({ db, base: "USD", fetchImpl: usFeed(1.4, 0.9), now: () => Date.parse("2026-11-13T12:00:00Z") });
    expect(saved).toMatchObject({ base: "USD", cad: 1.4, eur: 0.9, lastError: null });
    expect(saved.usd).toBeUndefined();
  });
  it("a saved copy counts only for the currency it was saved from", () => {
    const at = { fetchedAt: "2026-11-13T12:00:00.000Z" };
    expect(parseStored({ base: "USD", cad: 1.4, eur: 0.9, ...at }, "USD")).toMatchObject({ cad: 1.4, eur: 0.9 });
    expect(parseStored({ base: "CAD", usd: 0.71, eur: 0.62, ...at }, "USD")).toBeNull();
    expect(parseStored({ usd: 0.71, eur: 0.62, ...at }, "USD")).toBeNull();
    expect(parseStored({ base: "USD", cad: 1.4, eur: 0.9, ...at }, "CAD")).toBeNull();
    expect(parseStored({ usd: 0.71, eur: 0.62, ...at }, "CAD")).toMatchObject({ usd: 0.71, eur: 0.62 });
  });
  it("checkout gets the US dollar at 1, and the fixed rates are from the US dollar too", async () => {
    const now = () => Date.parse("2026-11-13T12:00:00Z");
    const db = fakeDb({ base: "USD", cad: 1.4, eur: 0.9, fetchedAt: "2026-11-13T09:00:00.000Z" });
    expect(await createRateReader({ db, base: () => "USD", fetchImpl: down(), now, log: quiet })()).toEqual({ usd: 1, cad: 1.4, eur: 0.9 });
    expect(await createRateReader({ db: fakeDb(), base: "USD", fetchImpl: down(), now, log: quiet })()).toEqual({ usd: 1, cad: 1.37, eur: 0.92 });
    expect(fallbackRatesFor("USD").usd).toBe(1);
    expect(fallbackRatesFor("CAD")).toBe(FALLBACK_RATES);
    expect(fallbackRatesFor("GBP")).toBe(FALLBACK_RATES);
  });
  it("one server, two shops: what was read for a Canadian shop is never handed to a US one", async () => {
    const now = () => Date.parse("2026-11-13T12:00:00Z");
    let currency = "CAD";
    let data = { usd: 0.71, eur: 0.62, fetchedAt: "2026-11-13T09:00:00.000Z" };
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ data: () => data }), set: async () => {} }) }) };
    const read = createRateReader({ db, base: () => currency, fetchImpl: down(), now, log: quiet });
    expect(await read()).toEqual({ cad: 1, usd: 0.71, eur: 0.62 });
    currency = "USD";
    data = { base: "USD", cad: 1.4, eur: 0.9, fetchedAt: "2026-11-13T09:00:00.000Z" };
    expect(await read()).toEqual({ usd: 1, cad: 1.4, eur: 0.9 });
    currency = "CAD";
    expect(await read()).toEqual({ cad: 1, usd: 0.71, eur: 0.62 });
  });
});
