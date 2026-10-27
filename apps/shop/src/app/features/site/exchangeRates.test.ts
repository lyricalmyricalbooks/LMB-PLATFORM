import { describe, expect, test, vi } from "vitest";
import { FALLBACK_RATES, RATES_CACHE_KEY, RATES_CACHE_MS, SAVED_FRESH_MS, loadRates } from "./exchangeRates";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const noShop = async () => null;
const feed = (usd: number, eur: number) => vi.fn(async () => new Response(JSON.stringify({ rates: { USD: usd, EUR: eur } }), { status: 200 }));

describe("#88 exchange rates", () => {
  test("a live answer is used, marked live and remembered for the session", async () => {
    const store = memory();
    const fetchImpl = feed(0.71, 0.65);
    expect(await loadRates({ readShop: noShop, fetchImpl: fetchImpl as any, store, now: 1000 })).toEqual({ rates: { CAD: 1, USD: 0.71, EUR: 0.65 }, source: "live" });
    // The next page load asks nobody.
    const again = await loadRates({ readShop: noShop, fetchImpl: fetchImpl as any, store, now: 2000 });
    expect(again.source).toBe("cached");
    expect(again.rates.USD).toBe(0.71);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a stale cache is refreshed", async () => {
    const store = memory();
    store.setItem(RATES_CACHE_KEY, JSON.stringify({ at: 0, rates: { USD: 0.5, EUR: 0.5 } }));
    const res = await loadRates({ readShop: noShop, fetchImpl: feed(0.7, 0.6) as any, store, now: 7 * 60 * 60 * 1000 });
    expect(res.source).toBe("live");
  });

  test("a feed that never answers times out and is reported as fallback, not left hanging", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const res = await loadRates({ readShop: noShop, fetchImpl: hang as any, store: memory(), timeoutMs: 20 });
    expect(res).toEqual({ rates: FALLBACK_RATES, source: "fallback" });
  });

  test("an error status, bad numbers or a blocked storage still end in an honest fallback", async () => {
    expect((await loadRates({ readShop: noShop, fetchImpl: (async () => new Response("", { status: 429 })) as any, store: memory() })).source).toBe("fallback");
    expect((await loadRates({ readShop: noShop, fetchImpl: feed(0, 0) as any, store: null })).source).toBe("fallback");
    expect((await loadRates({ readShop: noShop, fetchImpl: (async () => { throw new TypeError("blocked"); }) as any, store: null })).source).toBe("fallback");
  });
});

describe("the shop's saved daily rates", () => {
  const t0 = Date.parse("2026-10-12T12:00:00Z");
  const savedAt = (ms: number, usd = 0.71, eur = 0.62) => async () => ({ usd, eur, fetchedAt: new Date(ms).toISOString() });

  test("are shown first, so the shop shows exactly what checkout charges", async () => {
    const fetchImpl = feed(0.5, 0.5);
    const res = await loadRates({ readShop: savedAt(t0 - 3600_000), fetchImpl: fetchImpl as any, store: memory(), now: t0 });
    expect(res).toEqual({ rates: { CAD: 1, USD: 0.71, EUR: 0.62 }, source: "live" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a tab re-reads them after an hour, so the next day's rates arrive without a reload", async () => {
    const store = memory();
    await loadRates({ readShop: savedAt(t0), store, now: t0 });
    expect((await loadRates({ readShop: savedAt(t0 + 1, 0.72, 0.63), store, now: t0 + RATES_CACHE_MS - 1 })).rates.USD).toBe(0.71);
    expect((await loadRates({ readShop: savedAt(t0 + 1, 0.72, 0.63), store, now: t0 + RATES_CACHE_MS })).rates.USD).toBe(0.72);
  });

  test("an out-of-date copy gives way to the live feed, and is kept only while the feed is down", async () => {
    const stale = savedAt(t0 - SAVED_FRESH_MS - 1);
    expect((await loadRates({ readShop: stale, fetchImpl: feed(0.72, 0.63) as any, store: memory(), now: t0 })).rates.USD).toBe(0.72);
    const down = (async () => { throw new TypeError("offline"); }) as any;
    expect(await loadRates({ readShop: stale, fetchImpl: down, store: memory(), now: t0 })).toEqual({ rates: { CAD: 1, USD: 0.71, EUR: 0.62 }, source: "cached" });
  });

  test("a broken or unreadable copy is ignored", async () => {
    const res = await loadRates({ readShop: async () => ({ usd: 71, eur: 0.6, fetchedAt: new Date(t0).toISOString() }), fetchImpl: feed(0.72, 0.63) as any, store: memory(), now: t0 });
    expect(res.rates.USD).toBe(0.72);
    const fails = await loadRates({ readShop: async () => { throw new Error("denied"); }, fetchImpl: feed(0.72, 0.63) as any, store: memory(), now: t0 });
    expect(fails.source).toBe("live");
  });
});

describe("rates are remembered for the whole browser (cost saving)", () => {
  test("by default the copy lives in localStorage, so another tab within the hour reads nothing", async () => {
    const local = memory();
    const session = memory();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    try {
      const t0 = Date.parse("2026-10-20T12:00:00Z");
      const readShop = vi.fn(async () => ({ usd: 0.71, eur: 0.62, fetchedAt: new Date(t0).toISOString() }));
      expect((await loadRates({ readShop, now: t0 })).source).toBe("live");
      expect(local.getItem(RATES_CACHE_KEY)).not.toBeNull();
      expect(session.getItem(RATES_CACHE_KEY)).toBeNull();
      // "Another tab": a fresh call within the hour answers from the shared copy without reading the shop.
      expect(await loadRates({ readShop, now: t0 + RATES_CACHE_MS - 1 })).toEqual({ rates: { CAD: 1, USD: 0.71, EUR: 0.62 }, source: "cached" });
      expect(readShop).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  test("a copy stamped in the future is not trusted", async () => {
    const store = memory();
    const t0 = Date.parse("2026-10-20T12:00:00Z");
    store.setItem(RATES_CACHE_KEY, JSON.stringify({ at: t0 + 10 * RATES_CACHE_MS, rates: { USD: 0.5, EUR: 0.5 } }));
    const res = await loadRates({ readShop: async () => ({ usd: 0.71, eur: 0.62, fetchedAt: new Date(t0).toISOString() }), store, now: t0 });
    expect(res).toEqual({ rates: { CAD: 1, USD: 0.71, EUR: 0.62 }, source: "live" });
  });
  test("storage that throws never breaks loading", async () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const res = await loadRates({ readShop: noShop, fetchImpl: feed(0.72, 0.63) as any, store: broken as any });
    expect(res.source).toBe("live");
  });
});
