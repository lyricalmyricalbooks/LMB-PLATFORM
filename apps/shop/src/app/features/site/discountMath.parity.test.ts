import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as client from "./discountMath";
const srv = createRequire(import.meta.url)("../../../../functions/shared/discountMath.js");

/** Same outcome on both sides: an equal value, or the same thrown message. */
const outcome = (fn: () => unknown) => { try { return { ok: fn() }; } catch (e: any) { return { threw: e.message }; } };

const booksById: Record<string, any> = {
  poetry: { categories: ["Poetry"] },
  photo: { categories: ["Photography", "Art"] },
  zine: { categories: [] },
};
const carts: any[][] = [
  [{ id: "poetry", price: 20, quantity: 1 }],
  [{ id: "poetry", price: 20, quantity: 2 }, { id: "photo", price: 45, quantity: 1 }],
  [{ id: "zine", price: 8, quantity: 3 }, { id: "photo", price: 45, quantity: 1 }, { id: "poetry", price: 12.5, quantity: 2 }],
  [{ id: "zine", price: 0.1, quantity: 7 }],
  [],
];
const discounts: any[] = [
  { type: "percentage", value: 15 },
  { type: "percentage", value: 150 },
  { type: "percentage", value: -10 },
  { type: "percentage", value: 50, maxDiscountAmount: 15 },
  { type: "percentage", value: 25, appliesTo: "categories", selectedCategories: ["Poetry"] },
  { type: "percentage", value: 25, appliesTo: "categories", selectedCategories: ["Nothing"] },
  { type: "percentage", value: 25, appliesTo: "products", selectedProducts: ["photo"] },
  { type: "percentage", value: 25, appliesTo: "products", selectedProducts: ["missing"] },
  { type: "fixed", value: 10 },
  { type: "fixed", value: 500 },
  { type: "fixed", value: 30, appliesTo: "products", selectedProducts: ["poetry"] },
  { type: "fixed", value: 10, minOrderAmount: 50 },
  { type: "fixed", value: 10, minQuantity: 3 },
  { type: "bogo", buyQuantity: 1, getQuantity: 1 },
  { type: "bogo", buyQuantity: 2, getQuantity: 1, getDiscountValue: 50 },
  { type: "bogo", buyQuantity: 1, getQuantity: 1, getDiscountValue: "" },
  { type: "bogo", buyQuantity: 1, getQuantity: 1, appliesTo: "categories", selectedCategories: ["Poetry"] },
  { type: "bogo", buyQuantity: 1, getQuantity: 1, appliesTo: "categories", selectedCategories: ["Nothing"] },
  { type: "bogo", buyQuantity: 1, getQuantity: 1, appliesTo: "products", selectedProducts: ["zine"] },
  { type: "bogo", buyQuantity: 1, getQuantity: 1, appliesTo: "products", selectedProducts: ["missing"] },
  { type: "bogo", buyQuantity: 1, getQuantity: 1, maxDiscountAmount: 5 },
  { type: "tiered", tiers: [] },
  { type: "tiered", tiers: [{ minSpend: 50, type: "percentage", value: 10 }, { minSpend: 100, type: "percentage", value: 20 }] },
  { type: "tiered", tiers: [{ minSpend: 30, type: "fixed", value: 500 }] },
  { type: "tiered", tiers: [{ minSpend: 10, type: "percentage", value: 150 }] },
  { type: "tiered", tiers: [{ minSpend: 10, type: "other", value: 5 }] },
  { type: "tiered", appliesTo: "categories", selectedCategories: ["Photography"], tiers: [{ minSpend: 40, type: "fixed", value: 7 }] },
  { type: "tiered", appliesTo: "categories", selectedCategories: ["Nothing"], tiers: [{ minSpend: 1, type: "fixed", value: 7 }] },
  { type: "tiered", appliesTo: "products", selectedProducts: ["poetry"], tiers: [{ minSpend: 1, type: "fixed", value: 7 }] },
  { type: "tiered", appliesTo: "products", selectedProducts: ["missing"], tiers: [{ minSpend: 1, type: "fixed", value: 7 }] },
  { type: "freeship" },
  { type: "freeship", minOrderAmount: 60 },
  { type: "something-else", value: 10 },
];

describe("discount arithmetic (client ↔ server parity)", () => {
  it("agrees on the amount, or on the refusal, for every type and cart", () => {
    for (const d of discounts) for (const items of carts) {
      expect(outcome(() => client.computeDiscountAmount(d, items, booksById))).toEqual(outcome(() => srv.computeDiscountAmount(d, items, booksById)));
      expect(outcome(() => client.computeRawDiscountAmount(d, items, booksById))).toEqual(outcome(() => srv.computeRawDiscountAmount(d, items, booksById)));
      expect(outcome(() => client.discountAmountFor(d, items, booksById))).toEqual(outcome(() => srv.discountAmountFor(d, items, booksById)));
    }
  });

  it("clamps to the books' value and applies the cap", () => {
    const items = carts[1]; // 85 of books
    expect(client.computeDiscountAmount({ type: "fixed", value: 500 }, items, booksById)).toBe(85);
    expect(client.computeDiscountAmount({ type: "percentage", value: 50, maxDiscountAmount: 15 }, items, booksById)).toBe(15);
    expect(client.capDiscountAmount({ maxDiscountAmount: 0 }, 40)).toBe(40);
    expect(client.capDiscountAmount({ maxDiscountAmount: "12" }, 40)).toBe(12);
    expect(client.capDiscountAmount(null, 40)).toBe(40);
    for (const [d, a] of [[{ maxDiscountAmount: 5 }, 3], [{ maxDiscountAmount: 5 }, 9], [{}, 9]] as const) expect(client.capDiscountAmount(d, a)).toBe(srv.capDiscountAmount(d, a));
  });

  it("returns 0 (never throws) for tiers that are empty or of an unknown kind", () => {
    expect(client.computeRawDiscountAmount({ type: "tiered", tiers: [] }, carts[0], booksById)).toBe(0);
    expect(client.computeRawDiscountAmount({ type: "freeship" }, carts[0], booksById)).toBe(0);
  });

  it("throws coded problems with the server's message", () => {
    try {
      client.computeRawDiscountAmount({ type: "fixed", value: 5, minOrderAmount: 100 }, carts[0], booksById);
      throw new Error("expected a refusal");
    } catch (e: any) {
      expect(e).toBeInstanceOf(client.DiscountProblem);
      expect(e.code).toBe("min_order");
      expect(e.values).toEqual({ amount: 100 });
      expect(e.message).toBe("This code requires a minimum order of $100.00.");
    }
  });

  it("prices a free gift at its catalog price, uncapped, after the conditions", () => {
    const gift = { type: "gift", giftBookId: "zine", minOrderAmount: 30, maxDiscountAmount: 1 };
    for (const items of carts) for (const giftPrice of [8, 0, NaN, -1, undefined]) {
      expect(outcome(() => client.discountAmountFor(gift, items, booksById, { giftPrice }))).toEqual(outcome(() => srv.discountAmountFor(gift, items, booksById, { giftPrice })));
    }
    expect(client.discountAmountFor(gift, carts[1], booksById, { giftPrice: 8 })).toBe(8);
    expect(() => client.discountAmountFor(gift, carts[0], booksById, { giftPrice: 8 })).toThrow("minimum order");
    expect(() => client.discountAmountFor(gift, carts[1], booksById, { giftPrice: NaN })).toThrow("free gift");
    const targeted = { type: "gift", appliesTo: "products", selectedProducts: ["photo"] };
    expect(outcome(() => client.discountAmountFor(targeted, carts[0], booksById, { giftPrice: 8 }))).toEqual(outcome(() => srv.discountAmountFor(targeted, carts[0], booksById, { giftPrice: 8 })));
  });

  it("never discounts gift-card or free-gift lines", () => {
    const items = [{ id: "a", price: 10, quantity: 1 }, { id: "g", price: 50, quantity: 1, giftCard: true }, { id: "p", price: 8, quantity: 1, promoGift: true }, null as any];
    expect(client.discountableItems(items)).toEqual(srv.discountableItems(items));
    expect(client.discountableItems(items).map((i: any) => i.id)).toEqual(["a"]);
    expect(client.discountableItems(undefined)).toEqual([]);
  });
});

describe("automatic offers (client ↔ server parity)", () => {
  const offers = [
    { id: "b-ten", type: "percentage", value: 10 },
    { id: "a-five", type: "fixed", value: 5 },
    { id: "c-ship", type: "freeship", minOrderAmount: 20 },
    { id: "d-gift", type: "gift", giftBookId: "zine", minOrderAmount: 80 },
    { id: "e-big", type: "fixed", value: 50, minQuantity: 5 },
    { id: "f-tie", type: "fixed", value: 8.5 },
    null,
  ];
  const giftPriceOf = (d: any) => (d.giftBookId === "zine" ? 12 : NaN);
  it("picks the same offer for every cart", () => {
    for (const items of carts) for (const list of [offers, offers.slice(2, 3), [], [offers[0], offers[5]], [{ id: "z", type: "freeship", minQuantity: 99 }]]) {
      expect(client.pickAutomaticDiscount(list, items, booksById, giftPriceOf)).toEqual(srv.pickAutomaticDiscount(list, items, booksById, giftPriceOf));
      expect(client.pickAutomaticDiscount(list, items, booksById)).toEqual(srv.pickAutomaticDiscount(list, items, booksById));
    }
  });
  it("biggest saving wins; free shipping only when nothing else applies; ties go to the oldest id", () => {
    expect(client.pickAutomaticDiscount(offers, carts[1], booksById, giftPriceOf)).toEqual({ discount: offers[3], amount: 12, freeShipping: false });
    expect(client.pickAutomaticDiscount(offers.slice(2, 3), carts[1], booksById)).toEqual({ discount: offers[2], amount: 0, freeShipping: true });
    expect(client.pickAutomaticDiscount(offers.slice(2, 3), carts[3], booksById)).toBeNull();
    const tie = [{ id: "z", type: "fixed", value: 5 }, { id: "m", type: "fixed", value: 5 }];
    expect(client.pickAutomaticDiscount(tie, carts[0], booksById)!.discount.id).toBe("m");
    expect(client.pickAutomaticDiscount(null as any, carts[0], booksById)).toBeNull();
  });
});
