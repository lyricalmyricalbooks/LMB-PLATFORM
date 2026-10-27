import { describe, expect, it } from "vitest";
import { displayPrice, editionPrices, salePercentOff, showsSale } from "./displayPrice";

describe("displayPrice", () => {
  it("uses the book's own (sale) price when it has one", () => {
    expect(displayPrice({ retailPrice: 20 })).toBe(20);
    expect(displayPrice({ retailPrice: 20, isOnSale: true, salePrice: 15 })).toBe(15);
    expect(displayPrice({ retailPrice: 20, isOnSale: true, salePrice: 15 }, true)).toBe(20);
    expect(displayPrice({ retailPrice: 20, isOnSale: true, salePrice: "0" })).toBe(20);
  });
  it("shows the cheapest edition for a book sold only in editions instead of 0.00", () => {
    const book = { retailPrice: 0, variants: [{ id: "h", price: 35 }, { id: "p", price: "18" }, { id: "x", price: "" }] };
    expect(editionPrices(book)).toEqual([35, 18]);
    expect(displayPrice(book)).toBe(18);
    expect(displayPrice({ variants: [{ price: null }] })).toBe(0);
    expect(displayPrice(null)).toBe(0);
  });
});

describe("books sold in editions", () => {
  it("show the cheapest edition, never the book's own sale price that is never charged", () => {
    const book = { retailPrice: 20, isOnSale: true, salePrice: 15, variants: [{ id: "p", price: 20 }, { id: "h", price: 35 }] };
    expect(displayPrice(book)).toBe(20);
    expect(showsSale(book)).toBe(false);
  });
  it("other books show a sale only when it is below the regular price", () => {
    expect(showsSale({ retailPrice: 20, isOnSale: true, salePrice: 15 })).toBe(true);
    expect(showsSale({ retailPrice: 20, isOnSale: true, salePrice: 25 })).toBe(false);
    expect(showsSale({ retailPrice: 20, isOnSale: false, salePrice: 15 })).toBe(false);
  });
});

describe("scheduled sales", () => {
  const now = new Date("2026-10-08T16:00:00Z");
  it("shows the sale price and badge only inside the sale's dates, like the charge", () => {
    const ended = { retailPrice: 20, isOnSale: true, salePrice: 15, saleEndsAt: "2026-10-07" };
    const upcoming = { retailPrice: 20, isOnSale: true, salePrice: 15, saleStartsAt: "2026-10-09" };
    const running = { retailPrice: 20, isOnSale: true, salePrice: 15, saleStartsAt: "2026-10-01", saleEndsAt: "2026-10-08" };
    expect(displayPrice(ended, false, now)).toBe(20);
    expect(showsSale(ended, now)).toBe(false);
    expect(displayPrice(upcoming, false, now)).toBe(20);
    expect(showsSale(upcoming, now)).toBe(false);
    expect(displayPrice(running, false, now)).toBe(15);
    expect(showsSale(running, now)).toBe(true);
  });
});

describe("salePercentOff", () => {
  it("rounds the saving to whole percent and ignores non-sales", () => {
    expect(salePercentOff({ isOnSale: true, retailPrice: 20, salePrice: 16 })).toBe(20);
    expect(salePercentOff({ isOnSale: true, retailPrice: 20, salePrice: 20 })).toBe(0);
    expect(salePercentOff({ retailPrice: 20 })).toBe(0);
    expect(salePercentOff({ isOnSale: true, retailPrice: 20, salePrice: 10, variants: [{ price: 20 }] })).toBe(0);
  });
});
