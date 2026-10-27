import { beforeEach, describe, expect, it } from "vitest";
import { SITE_CACHE_KEY } from "./constants";
import { readSiteCache } from "./siteCache";

describe("readSiteCache", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  it("returns a complete storefront snapshot", () => {
    const payload = { books: [], pages: [], settings: { design: {} }, cachedAt: "2026-10-01T00:00:00.000Z" };
    values.set(SITE_CACHE_KEY, JSON.stringify(payload));
    expect(readSiteCache()).toEqual(payload);
  });

  it.each([
    "not-json",
    "null",
    JSON.stringify({ books: {}, pages: [], settings: {} }),
    JSON.stringify({ books: [], pages: null, settings: {} }),
    JSON.stringify({ books: [], pages: [], settings: [] }),
  ])("ignores a corrupt or obsolete snapshot instead of crashing a route", (cached) => {
    values.set(SITE_CACHE_KEY, cached);
    expect(readSiteCache()).toBeNull();
  });
});
