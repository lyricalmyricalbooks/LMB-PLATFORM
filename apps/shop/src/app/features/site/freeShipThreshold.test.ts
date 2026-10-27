import { describe, expect, it } from "vitest";
import { bagFreeShipThreshold, shopFreeShipThreshold } from "./freeShipThreshold";

describe("bag free-shipping threshold", () => {
  it("uses a profile's own free-shipping amount (new or legacy field)", () => {
    expect(shopFreeShipThreshold([{ freeShippingOver: 120 }])).toBe(120);
    expect(shopFreeShipThreshold([{ freeThreshold: "150" }])).toBe(150);
  });
  it("uses rate amounts only when every rate in every zone is free above one", () => {
    expect(shopFreeShipThreshold([{ zones: [{ rates: [{ freeOver: 80 }, { freeOver: 100 }] }, { rates: [{ freeOver: 90 }] }] }])).toBe(100);
    // Canada free over 50, international never free: a US shopper must not be promised free shipping.
    expect(shopFreeShipThreshold([{ zones: [{ rates: [{ freeOver: 50 }] }, { rates: [{ price: 25 }] }] }])).toBeNull();
  });
  it("needs a rule on every profile and uses the highest", () => {
    expect(shopFreeShipThreshold([{ freeShippingOver: 60 }, { freeShippingOver: 100 }])).toBe(100);
    expect(shopFreeShipThreshold([{ freeShippingOver: 60 }, { zones: [{ rates: [{ price: 10 }] }] }])).toBeNull();
  });
  it("hides the bar when rules are still loading, missing, or the bag is e-books only", () => {
    expect(bagFreeShipThreshold(null, true)).toBeNull();
    expect(bagFreeShipThreshold([], true)).toBeNull();
    expect(bagFreeShipThreshold([{ freeShippingOver: 60 }], false)).toBeNull();
    expect(bagFreeShipThreshold([{ freeShippingOver: 60 }], true)).toBe(60);
  });
});
