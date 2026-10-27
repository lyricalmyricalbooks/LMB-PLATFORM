import { describe, expect, it } from "vitest";
import { COUNTRY_CACHE_KEY, COUNTRY_CACHE_MS, UNKNOWN_CACHE_MS, cachedCountry, currencyForCountry, loadVisitorCountry } from "./visitorCurrency";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const answer = (body: unknown, ok = true) => async () => ({ ok, json: async () => body }) as Response;

describe("currencyForCountry", () => {
  it("prices Canada in CAD, the US and the Americas in USD, Europe in EUR", () => {
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("us")).toBe("USD");
    expect(currencyForCountry("PR")).toBe("USD");
    expect(currencyForCountry("MX")).toBe("USD");
    expect(currencyForCountry("FR")).toBe("EUR");
    expect(currencyForCountry("GB")).toBe("EUR");
    expect(currencyForCountry("MQ")).toBe("EUR"); // Martinique uses the euro
  });
  it("starts the rest of the world in the shop's own currency, like the time-zone guess", () => {
    expect(currencyForCountry("JP")).toBe("CAD");
    expect(currencyForCountry("AU")).toBe("CAD");
  });
  it("ignores anything that isn't a country code", () => {
    for (const bad of ["", "ZZ", "USA", "<x>", null, undefined, 5]) expect(currencyForCountry(bad)).toBeNull();
  });
});

describe("loadVisitorCountry", () => {
  it("asks the shop's server once and remembers the country for a week", async () => {
    const store = memory();
    let asks = 0;
    const ask = async () => { asks++; return answer({ country: "US" })(); };
    expect(await loadVisitorCountry({ ask, store, now: 1000 })).toBe("US");
    expect(await loadVisitorCountry({ ask, store, now: 1000 + COUNTRY_CACHE_MS - 1 })).toBe("US");
    expect(asks).toBe(1);
    expect(await loadVisitorCountry({ ask, store, now: 1000 + COUNTRY_CACHE_MS })).toBe("US");
    expect(asks).toBe(2);
  });
  it("remembers 'the platform didn't say' for a day only", async () => {
    const store = memory();
    expect(await loadVisitorCountry({ ask: answer({ country: null }), store, now: 0 })).toBeNull();
    expect(cachedCountry(store, UNKNOWN_CACHE_MS - 1)).toEqual({ country: null });
    expect(cachedCountry(store, UNKNOWN_CACHE_MS)).toBeUndefined();
  });
  it("never throws and remembers nothing when the server fails or hangs", async () => {
    const store = memory();
    expect(await loadVisitorCountry({ ask: answer({}, false), store })).toBeNull();
    expect(await loadVisitorCountry({ ask: async () => { throw new Error("offline"); }, store })).toBeNull();
    const hang = (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await loadVisitorCountry({ ask: hang, store, timeoutMs: 5 })).toBeNull();
    expect(store.data.has(COUNTRY_CACHE_KEY)).toBe(false);
  });
  it("drops a malformed answer or cache entry", async () => {
    const store = memory();
    expect(await loadVisitorCountry({ ask: answer({ country: "<script>" }), store, now: 0 })).toBeNull();
    store.setItem(COUNTRY_CACHE_KEY, "{not json");
    expect(cachedCountry(store, 0)).toBeUndefined();
  });
});
