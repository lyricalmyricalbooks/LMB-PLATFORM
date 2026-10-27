import { describe, it, expect } from "vitest";
import { quoteShipping, pickQuote, parseWeightGrams } from "./shippingEngine";
// @ts-ignore - CommonJS server module
import * as server from "../../../../functions/shared/shippingEngine.js";
const srv: any = (server as any).default ?? server;

const profiles = [
  { id: "general-profile", handlingFee: 1, zones: [
    { id: "ca", countries: ["CA"], rates: [
      { id: "std", name: "Standard", base: 15, additional: 5, deliveryDays: "3-7" },
      { id: "exp", name: "Express", type: "order", base: 30, handlingFee: 2 },
      { id: "free", name: "Free over 75", type: "free", minPrice: 75 },
      { id: "pick", name: "Pickup", type: "pickup" },
    ] },
    { id: "row", restOfWorld: true, countries: [], rates: [
      { id: "w", name: "Intl", type: "weight", base: 10, perKg: 8, maxWeight: 5000 },
      { id: "p", name: "Pct", type: "percent", base: 3, percent: 10, freeOver: 200 },
      { id: "off", name: "Off", enabled: false, base: 1 },
    ] },
  ] },
  { id: "heavy", zones: [{ id: "all", restOfWorld: true, countries: [], rates: [
    { id: "std2", name: "Standard", base: 25, additional: 8 }, { id: "intl2", name: "Intl", type: "weight", base: 20, perKg: 12 },
  ] }] },
  { id: "legacy", base: 12, additional: 4 },
];
const carts: any[] = [
  [{ price: 20, quantity: 3, shippingProfileId: "general-profile", weightGrams: 300 }],
  [{ price: 40, quantity: 2, shippingProfileId: "general-profile", weightGrams: 500 }, { price: 10, quantity: 1, shippingProfileId: "heavy" }],
  [{ price: 250, quantity: 1, weightGrams: 6000 }],
  [{ price: 30, quantity: 2, shippingProfileId: "legacy" }],
];

describe("shipping engine parity + behaviour", () => {
  it("does not invent a transit estimate for profile rates without timing data", () => {
    const legacyProfile = [{ id: "legacy", base: 12, additional: 4 }];
    const client = quoteShipping([{ price: 30, quantity: 1 }], "Canada", legacyProfile as any);
    expect(client[0]?.deliveryDays).toBeUndefined();
  });

  for (const country of ["Canada", "France", "United States"]) {
    carts.forEach((cart, i) => it(`client == server: ${country} cart ${i}`, () => {
      expect(quoteShipping(cart, { country }, profiles)).toEqual(srv.quoteShipping(cart, { country }, profiles));
    }));
  }
  it("flat: base + additional per extra item, plus profile handling", () => {
    const q = quoteShipping(carts[0], { country: "Canada" }, profiles);
    expect(pickQuote(q, "Standard")!.price).toBe(15 + 5 * 2 + 1);
  });
  it("offers free rate only above its min order and pickup at 0", () => {
    const small = quoteShipping(carts[0], { country: "Canada" }, profiles).map((x) => x.name);
    expect(small).not.toContain("Free over 75");
    const big = quoteShipping([{ price: 80, quantity: 1, shippingProfileId: "general-profile" }], { country: "Canada" }, profiles);
    expect(pickQuote(big, "Free over 75")!.price).toBe(1); // profile handling still applies
    expect(pickQuote(big, "Pickup")!.price).toBe(0);
  });
  it("weight rate respects maxWeight and disabled rates are hidden", () => {
    const names = quoteShipping(carts[2], { country: "France" }, profiles).map((x) => x.name);
    expect(names).not.toContain("Off");
    expect(names).not.toContain("Intl");
  });
  it("falls back to cheapest when the selected method is unknown", () => {
    const q = quoteShipping(carts[0], { country: "Canada" }, profiles);
    expect(pickQuote(q, "Nonexistent")).toBe(q[0]);
  });
  it("parses weights", () => {
    expect(parseWeightGrams("0.5kg")).toBe(500);
    expect(parseWeightGrams("300 g")).toBe(300);
    expect(Math.round(parseWeightGrams("1lb")!)).toBe(454);
    expect(parseWeightGrams("heavy")).toBeNull();
  });

  it("a zone saved with country names still matches (older saves), on both engines", () => {
    const byName = [{ id: "general-profile", zones: [
      { id: "ca", countries: ["Canada"], rates: [{ id: "s", name: "Standard", base: 8 }] },
      { id: "row", restOfWorld: true, countries: [], rates: [{ id: "i", name: "International", base: 20 }] },
    ] }];
    const cart = [{ price: 10, quantity: 1, shippingProfileId: "general-profile" }];
    for (const country of ["Canada", "CA"]) {
      expect(quoteShipping(cart, { country }, byName)[0]).toMatchObject({ name: "Standard", price: 8 });
      expect(srv.quoteShipping(cart, { country }, byName)[0]).toMatchObject({ name: "Standard", price: 8 });
    }
  });
  it("territories match on the server too (Guam)", () => {
    const zones = [{ id: "general-profile", zones: [
      { id: "gu", countries: ["GU"], rates: [{ id: "g", name: "Guam", base: 8 }] },
      { id: "row", restOfWorld: true, countries: [], rates: [{ id: "i", name: "International", base: 30 }] },
    ] }];
    const cart = [{ price: 10, quantity: 1, shippingProfileId: "general-profile" }];
    expect(srv.quoteShipping(cart, { country: "Guam" }, zones)[0].name).toBe("Guam");
    expect(quoteShipping(cart, { country: "Guam" }, zones)).toEqual(srv.quoteShipping(cart, { country: "Guam" }, zones));
  });
  it("every option in a mixed cart has its own id, so the server charges what was picked", () => {
    const mixed = [
      { id: "general-profile", zones: [{ id: "ca", countries: ["CA"], rates: [{ id: "std", name: "Standard", base: 8 }, { id: "exp", name: "Express", base: 9 }] }] },
      { id: "b", zones: [{ id: "ca", countries: ["CA"], rates: [{ id: "cour", name: "Courier", base: 30 }] }] },
    ];
    const cart = [{ price: 10, quantity: 1, shippingProfileId: "general-profile" }, { price: 10, quantity: 1, shippingProfileId: "b" }];
    const q = srv.quoteShipping(cart, { country: "Canada" }, mixed);
    expect(new Set(q.map((x: any) => x.id)).size).toBe(q.length);
    expect(q.find((x: any) => x.name === "Express").id).toBe("exp");
    expect(quoteShipping(cart, { country: "Canada" }, mixed)).toEqual(q);
  });
  it("a zone-less profile offers nothing once zones are in use (no invented $15 + $5)", () => {
    const cart = [{ price: 30, quantity: 2, shippingProfileId: "legacy" }];
    expect(quoteShipping(cart, { country: "Canada" }, profiles)).toEqual([]);
    expect(srv.quoteShipping(cart, { country: "Canada" }, [{ id: "legacy", base: 12, additional: 4 }])[0].price).toBe(16);
  });
});

