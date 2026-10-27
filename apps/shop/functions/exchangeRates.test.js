// Daily exchange rates: checkout charges the saved copy the storefront shows, refreshed by a scheduled job.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FALLBACK_RATES, FRESH_MS, READ_CACHE_MS, parseFeed, refreshStoredRates, createRateReader } = require("./exchangeRates.js");

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
    expect(source).toContain("const getExchangeRates = createRateReader({ db });");
    expect(source).toMatch(/exports\.refreshExchangeRates = onSchedule\(\{ schedule: "every 3 hours"/);
    // No second, private copy of the feed that could disagree with what shoppers are shown.
    expect(source).not.toContain("open.er-api.com");
  });
});
