import { describe, expect, it } from "vitest";
import { pdpFreeShipping } from "./pdpFreeShipping";

const printed = { id: "b", format: "Paperback", retailPrice: 20 };
const ebook = { id: "e", format: "E-book", retailPrice: 10 };
const freeOver = [{ id: "p", freeShippingOver: 75, zones: [] }];

describe("pdpFreeShipping", () => {
  it("says nothing before the rules load, without a shop-wide rule, or for books never shipped", () => {
    expect(pdpFreeShipping(null, printed, null, [])).toBeNull();
    expect(pdpFreeShipping([{ id: "p", zones: [{ rates: [{ type: "flat", price: 5 }] }] }], printed, null, [])).toBeNull();
    expect(pdpFreeShipping([...freeOver, { id: "q", zones: [] }], printed, null, [])).toBeNull();
    expect(pdpFreeShipping(freeOver, ebook, null, [])).toBeNull();
  });

  it("names the amount for an empty bag (or one with e-books only)", () => {
    expect(pdpFreeShipping(freeOver, printed, null, [])).toEqual({ kind: "over", threshold: 75 });
    expect(pdpFreeShipping(freeOver, printed, null, [{ price: 90, quantity: 1, physical: false }])).toEqual({ kind: "over", threshold: 75 });
    expect(pdpFreeShipping(freeOver, printed, null, null)).toEqual({ kind: "over", threshold: 75 });
  });

  it("counts printed books in the bag toward the amount", () => {
    expect(pdpFreeShipping(freeOver, printed, null, [{ price: 25.5, quantity: 2, physical: true }])).toEqual({ kind: "away", threshold: 75, remaining: 24 });
    expect(pdpFreeShipping(freeOver, printed, null, [{ price: 25, quantity: 3, physical: true }])).toEqual({ kind: "free", threshold: 75 });
  });

  it("uses the highest profile threshold, so it never promises more than checkout gives", () => {
    expect(pdpFreeShipping([...freeOver, { id: "q", freeShippingOver: 100, zones: [] }], printed, null, [])).toEqual({ kind: "over", threshold: 100 });
  });
});
