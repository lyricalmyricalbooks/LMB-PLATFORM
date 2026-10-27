import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dm = require("./shared/discountMath");

const items = [{ id: "a", price: 20, quantity: 2 }, { id: "b", price: 10, quantity: 1 }];
const books = { a: { categories: ["poetry"] }, b: { categories: ["essays"] } };

describe("automatic discounts", () => {
  it("pick the biggest saving, ties to the oldest id", () => {
    const pick = dm.pickAutomaticDiscount([
      { id: "z", type: "percentage", value: 10 },
      { id: "y", type: "fixed", value: 5 },
      { id: "x", type: "fixed", value: 5 },
    ], items, books);
    expect(pick).toMatchObject({ amount: 5, freeShipping: false, discount: { id: "x" } });
  });
  it("skip offers whose conditions aren't met", () => {
    expect(dm.pickAutomaticDiscount([{ id: "a", type: "percentage", value: 50, minOrderAmount: 100 }], items, books)).toBeNull();
    expect(dm.pickAutomaticDiscount([{ id: "a", type: "percentage", value: 50, appliesTo: "categories", selectedCategories: ["none"] }], items, books)).toBeNull();
  });
  it("use free shipping only when no money-off offer applies", () => {
    const ship = { id: "s", type: "freeship", minOrderAmount: 40 };
    expect(dm.pickAutomaticDiscount([ship], items, books)).toMatchObject({ freeShipping: true, discount: { id: "s" } });
    expect(dm.pickAutomaticDiscount([ship, { id: "p", type: "fixed", value: 1 }], items, books)).toMatchObject({ discount: { id: "p" } });
    expect(dm.pickAutomaticDiscount([{ ...ship, minOrderAmount: 100 }], items, books)).toBeNull();
  });
  it("value a free gift at its price, only when it can be given", () => {
    const gift = { id: "g", type: "gift", minOrderAmount: 30, giftBookId: "tote" };
    expect(dm.pickAutomaticDiscount([gift], items, books, () => 15)).toMatchObject({ amount: 15, discount: { id: "g" } });
    expect(dm.pickAutomaticDiscount([gift], items, books, () => NaN)).toBeNull();
    expect(dm.pickAutomaticDiscount([{ ...gift, minOrderAmount: 60 }], items, books, () => 15)).toBeNull();
  });
  it("never discount gift-card lines or the free gift itself", () => {
    expect(dm.discountableItems([...items, { id: "gc", giftCard: true, price: 50, quantity: 1 }, { id: "t", promoGift: true, price: 9, quantity: 1 }])).toEqual(items);
  });
});
