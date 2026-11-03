import { describe, expect, it } from "vitest";
import { lowestBeforeSale } from "./lowestPrice";

const now = new Date("2026-11-03T12:00:00Z");

describe("lowest price before a sale", () => {
  it("names a lower price from the 30 days before the sale", () => {
    // Raised from 25 to 40 a week ago, now on sale: the "was 40" overstates the saving.
    expect(lowestBeforeSale({ price: 40, priceHistory: [{ price: 25, until: "2026-10-27T00:00:00Z" }] }, now)).toBe(25);
  });

  it("says nothing when the regular price is already the lowest", () => {
    expect(lowestBeforeSale({ price: 40 }, now)).toBeNull();
    expect(lowestBeforeSale({ price: 40, priceHistory: [{ price: 50, until: "2026-10-27T00:00:00Z" }] }, now)).toBeNull();
    // Lower, but more than 30 days before the sale started.
    expect(lowestBeforeSale({ price: 40, priceHistory: [{ price: 25, until: "2026-09-01T00:00:00Z" }] }, now)).toBeNull();
  });

  it("counts back from a dated sale's first day", () => {
    const book = { price: 40, saleStartsAt: "2026-10-01", priceHistory: [{ price: 25, until: "2026-09-10T00:00:00Z" }] };
    expect(lowestBeforeSale(book, now)).toBe(25);
  });
});
