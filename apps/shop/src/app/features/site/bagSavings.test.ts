import { describe, expect, it } from "vitest";
import { bagSavings, lineSavingPerCopy } from "./bagSavings";

const sale = { id: "s", retailPrice: 24, salePrice: 18, isOnSale: true };
const plain = { id: "p", retailPrice: 20 };

describe("bag sale savings", () => {
  it("saves the regular minus the sale price on a line priced at the sale", () => {
    expect(lineSavingPerCopy({ id: "s", price: 18, quantity: 1 }, sale)).toBe(6);
    // Add-ons ride on top of the sale price and still count as that sale.
    expect(lineSavingPerCopy({ id: "s", price: 23, quantity: 1, addOns: [{ id: "a", label: "Signed", price: 5 }] }, sale)).toBe(6);
  });

  it("claims nothing for books not on sale, editions, gift cards or stale prices", () => {
    expect(lineSavingPerCopy({ id: "p", price: 20 }, plain)).toBe(0);
    expect(lineSavingPerCopy({ id: "s", variantId: "v", price: 18 }, sale)).toBe(0);
    expect(lineSavingPerCopy({ id: "s", giftCard: true, price: 18 }, sale)).toBe(0);
    expect(lineSavingPerCopy({ id: "s", price: 24 }, sale)).toBe(0);
    expect(lineSavingPerCopy({ id: "s", price: 18 }, { ...sale, saleEndsAt: "2020-01-01" })).toBe(0);
    expect(lineSavingPerCopy({ id: "s", price: 18 }, undefined)).toBe(0);
  });

  it("totals copies across the bag", () => {
    const cart = [{ id: "s", price: 18, quantity: 2 }, { id: "p", price: 20, quantity: 1 }];
    const out = bagSavings(cart, new Map<string, any>([["s", sale], ["p", plain]]));
    expect(out.total).toBe(12);
    expect(out.perCopy.get(cart[0])).toBe(6);
    expect(out.perCopy.has(cart[1])).toBe(false);
  });
});
