import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const promo = require("./shared/promotions");
const { catalogUnitPrice } = require("./catalogPrice");
const { stockChanges } = require("./inventory");
const { linesByBook } = require("./stockHolds");
const { returnRestockItems } = require("./returns");

// Noon in Toronto on 2026-10-09.
const NOW = new Date("2026-10-09T16:00:00Z");

describe("scheduled sales", () => {
  const book = { isOnSale: true, salePrice: 12, retailPrice: 20 };
  it("charges the sale price only inside its shop-day window (both ends inclusive)", () => {
    expect(catalogUnitPrice(book, undefined, NOW)).toBe(12);
    expect(catalogUnitPrice({ ...book, saleStartsAt: "2026-10-09", saleEndsAt: "2026-10-09" }, undefined, NOW)).toBe(12);
    expect(catalogUnitPrice({ ...book, saleStartsAt: "2026-10-10" }, undefined, NOW)).toBe(20);
    expect(catalogUnitPrice({ ...book, saleEndsAt: "2026-10-08" }, undefined, NOW)).toBe(20);
  });
  it("uses the Toronto day, not UTC (8pm Toronto on the last day is still on sale)", () => {
    const evening = new Date("2026-10-10T00:30:00Z"); // 20:30 on Oct 9 in Toronto
    expect(promo.saleActive({ ...book, saleEndsAt: "2026-10-09" }, evening)).toBe(true);
  });
  it("ignores malformed dates and never sells at 0", () => {
    expect(promo.saleActive({ ...book, saleEndsAt: "soon" }, NOW)).toBe(true);
    expect(promo.saleActive({ ...book, salePrice: 0 }, NOW)).toBe(false);
  });
});

describe("paid add-ons", () => {
  const book = { title: "Poems", addOns: [
    { id: "signed", label: "Signed by the author", price: 5 },
    { id: "inscription", label: "Personal inscription", price: 8, kind: "text", maxLength: 10 },
    { id: "off", label: "Hidden", price: 1, enabled: false },
    { id: "bad", label: "", price: 3 },
  ] };
  it("prices picked add-ons per copy from the catalog", () => {
    const picked = promo.addOnSelection(book, [{ id: "signed", price: 0 }, { id: "inscription", text: "  For  Sam, with love " }]);
    expect(picked.price).toBe(13);
    expect(picked.addOns).toEqual([
      { id: "signed", label: "Signed by the author", price: 5 },
      { id: "inscription", label: "Personal inscription", price: 8, text: "For Sam, w" },
    ]);
  });
  it("refuses an add-on that is not offered and an inscription without words", () => {
    expect(() => promo.addOnSelection(book, [{ id: "off" }])).toThrow(/no longer offered/);
    expect(() => promo.addOnSelection(book, [{ id: "inscription", text: "   " }])).toThrow(/wording/);
  });
  it("ignores duplicate picks and offers nothing on gift cards or box sets", () => {
    expect(promo.addOnSelection(book, [{ id: "signed" }, { id: "signed" }]).price).toBe(5);
    expect(promo.bookAddOns({ ...book, productType: "giftCard" })).toEqual([]);
    expect(promo.bookAddOns({ ...book, bundleItems: [{ bookId: "a" }] })).toEqual([]);
  });
});

describe("box sets", () => {
  const set = { bundleItems: [{ bookId: "a", quantity: 2 }, { bookId: "b", variantId: "hc" }, { bookId: "" }] };
  it("normalises its parts", () => {
    expect(promo.bundleComponents(set)).toEqual([{ id: "a", variantId: null, quantity: 2 }, { id: "b", variantId: "hc", quantity: 1 }]);
  });
  it("counts how many sets the parts' stock allows", () => {
    const books = { a: { trackInventory: true, stockLevel: 5 }, b: { trackInventory: true, variants: [{ id: "hc", stock: 9 }] } };
    expect(promo.bundleAvailable(set, id => books[id])).toBe(2);
    expect(promo.bundleAvailable(set, id => ({ ...books, a: { trackInventory: false } })[id])).toBe(9);
    expect(promo.bundleAvailable(set, () => undefined)).toBe(0);
  });
  it("takes stock from every book inside it, holds and decrements alike", () => {
    const line = { id: "set", quantity: 2, components: [{ id: "a", variantId: null, quantity: 2 }, { id: "b", variantId: "hc", quantity: 1 }] };
    const books = { set: { trackInventory: false }, a: { trackInventory: true, stockLevel: 5 }, b: { trackInventory: true, stockLevel: 3, variants: [{ id: "hc", stock: 3 }] } };
    const { updates, oversold } = stockChanges([line], books, -1);
    expect(oversold).toBe(false);
    expect(updates.find(u => u.id === "a").data.stockLevel).toBe(1);
    expect(updates.find(u => u.id === "b").data.variants[0].stock).toBe(1);
    expect(updates.find(u => u.id === "set")).toBeUndefined();
    expect(Object.fromEntries(linesByBook([line]))).toEqual({ a: { _: 4 }, b: { hc: 2 } });
  });
  it("puts an inspected box-set return back as its books", () => {
    const order = { customerRequest: { type: "return", status: "open" }, returnProgress: { state: "inspected" }, items: [{ id: "set", quantity: 1, components: [{ id: "a", quantity: 2 }] }] };
    const rows = returnRestockItems(order, { state: "inspected", inspection: [{ index: 0, id: "set", quantity: 1, condition: "resellable" }] });
    expect(stockChanges(rows, { a: { trackInventory: true, stockLevel: 0 } }, 1).updates[0].data.stockLevel).toBe(2);
  });
});

describe("gift card details", () => {
  it("keeps short, clean recipient details and refuses a broken email", () => {
    expect(promo.giftCardDetails({ recipientEmail: " Sam@Example.com ", message: "x".repeat(400) })).toMatchObject({ recipientEmail: "sam@example.com", message: "x".repeat(300) });
    expect(() => promo.giftCardDetails({ recipientEmail: "sam@" })).toThrow(/email/);
  });
});
