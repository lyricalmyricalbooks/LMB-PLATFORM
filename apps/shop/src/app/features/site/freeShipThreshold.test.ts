import { describe, expect, it } from "vitest";
import { bagFreeShipThreshold, bestFreeShipThreshold, offerFreeShipThreshold, shopFreeShipThreshold } from "./freeShipThreshold";

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

describe("free-shipping offers without a code", () => {
  const offer = (extra: any = {}) => ({ id: "o1", type: "freeship", method: "automatic", minOrderAmount: 60, ...extra });
  it("counts an offer every shopper gets, lowest minimum first", () => {
    expect(offerFreeShipThreshold([offer(), offer({ id: "o2", minOrderAmount: 40 })])).toBe(40);
    expect(offerFreeShipThreshold([offer({ minOrderAmount: null })])).toBe(0);
  });
  it("makes no promise when a money-off offer could win instead", () => {
    expect(offerFreeShipThreshold([offer(), { id: "p", type: "percentage", value: 10 }])).toBeNull();
  });
  it("leaves out offers the bag can't judge", () => {
    for (const extra of [{ appliesTo: "categories" }, { minQuantity: 3 }, { onePerCustomer: true }, { allowedEmailDomains: "school.ca" }, { allowedCustomerEmails: "a@example.com" }, { restricted: true }]) {
      expect(offerFreeShipThreshold([offer(extra)])).toBeNull();
    }
    expect(offerFreeShipThreshold(null)).toBeNull();
  });
  it("takes whichever free shipping comes first", () => {
    expect(bestFreeShipThreshold(75, 50)).toBe(50);
    expect(bestFreeShipThreshold(null, 50)).toBe(50);
    expect(bestFreeShipThreshold(75, null)).toBe(75);
    expect(bestFreeShipThreshold(null, null)).toBeNull();
  });
});
