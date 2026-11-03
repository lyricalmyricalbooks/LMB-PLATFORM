import { describe, expect, it } from "vitest";
const { nextPriceHistory, KEEP_ENTRIES } = require("./priceHistory");

const now = new Date("2026-11-03T12:00:00Z");

describe("a book's earlier regular prices", () => {
  it("adds the old price when the price changes, and nothing otherwise", () => {
    expect(nextPriceHistory({ price: 30 }, { price: 40 }, now)).toEqual([{ price: 30, until: "2026-11-03T12:00:00.000Z" }]);
    expect(nextPriceHistory({ price: 30 }, { price: 30, title: "New title" }, now)).toBeNull();
    expect(nextPriceHistory(undefined, { price: 30 }, now)).toBeNull();
    expect(nextPriceHistory({ price: 30 }, undefined, now)).toBeNull();
    expect(nextPriceHistory({ price: "30" }, { price: 40 }, now)).toBeNull();
  });

  it("forgets prices older than 90 days and keeps at most twelve", () => {
    const old = { price: 10, until: "2026-07-01T00:00:00Z" };
    const recent = { price: 20, until: "2026-10-20T00:00:00Z" };
    expect(nextPriceHistory({ price: 30 }, { price: 40, priceHistory: [old, recent, { junk: true }] }, now))
      .toEqual([recent, { price: 30, until: "2026-11-03T12:00:00.000Z" }]);
    const many = Array.from({ length: 20 }, (_, i) => ({ price: i, until: "2026-11-01T00:00:00Z" }));
    expect(nextPriceHistory({ price: 30 }, { price: 40, priceHistory: many }, now)).toHaveLength(KEEP_ENTRIES);
  });
});
