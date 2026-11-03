// Property tests for discount money (fast-check): instead of a few hand-picked carts, each rule below is checked
// against hundreds of random carts and discounts, and fast-check shrinks any failure to the smallest cart that breaks it.
// The server's copy (functions/shared/discountMath.js) is the one charged, so the shop's copy must agree with it everywhere.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fc from "fast-check";
import * as client from "./discountMath";

const server = createRequire(import.meta.url)("../../functions/shared/discountMath.js");

const IDS = ["poetry", "photo", "zine", "shirt"];
const booksById: Record<string, any> = {
  poetry: { categories: ["Poetry"] },
  photo: { categories: ["Photography", "Art"] },
  zine: { categories: [] },
  shirt: { categories: ["Merch"] },
};

const price = fc.integer({ min: 0, max: 20_000 }).map((cents) => cents / 100);
const line = fc.record({ id: fc.constantFrom(...IDS), price, quantity: fc.integer({ min: 1, max: 6 }) });
const cart = fc.array(line, { maxLength: 6 });

// Saved values are not always clean numbers (old records, typed text), so the odd ones are mixed in.
const amount = fc.oneof(
  fc.integer({ min: 0, max: 200 }),
  price,
  fc.constantFrom(-5, "", "10", "abc", null, undefined, 150),
);
const targeting = fc.oneof(
  fc.record({ appliesTo: fc.constant("all") }),
  fc.record({ appliesTo: fc.constant("categories"), selectedCategories: fc.subarray(["Poetry", "Art", "Merch"]) }),
  fc.record({ appliesTo: fc.constant("products"), selectedProducts: fc.subarray(IDS) }),
);
const conditions = fc.record(
  { minOrderAmount: fc.constantFrom(0, 25, 100), minQuantity: fc.constantFrom(0, 2, 5), maxDiscountAmount: fc.constantFrom(0, 10, 30) },
  { requiredKeys: [] },
);
const tier = fc.record({ minSpend: fc.constantFrom(0, 20, 50, 120), type: fc.constantFrom("percentage", "fixed"), value: amount });
const kind = fc.oneof(
  fc.record({ type: fc.constant("percentage"), value: amount }),
  fc.record({ type: fc.constant("fixed"), value: amount }),
  fc.record({
    type: fc.constant("bogo"),
    buyQuantity: fc.integer({ min: 1, max: 3 }),
    getQuantity: fc.integer({ min: 1, max: 2 }),
    getDiscountValue: fc.oneof(amount, fc.constant(undefined)),
  }),
  fc.record({ type: fc.constant("tiered"), tiers: fc.array(tier, { maxLength: 3 }) }),
);
const discount = fc.tuple(kind, targeting, conditions).map(([k, t, c]) => ({ id: "d", ...k, ...t, ...c }));

/** The value, or the thrown message: both sides must give the same one. */
const outcome = (fn: () => unknown) => {
  try {
    return { ok: fn() };
  } catch (e: any) {
    return { threw: e.message };
  }
};
const subtotalOf = (items: any[]) => items.reduce((s, i) => s + i.price * i.quantity, 0);
const RUNS = { numRuns: 400 };

describe("discount money, checked against random carts", () => {
  it("the shop shows exactly what the server charges", () => {
    fc.assert(
      fc.property(discount, cart, (d, items) => {
        expect(outcome(() => client.computeDiscountAmount(d, items, booksById))).toEqual(
          outcome(() => server.computeDiscountAmount(d, items, booksById)),
        );
      }),
      RUNS,
    );
  });

  it("a discount is a real amount, never below zero, never more than the cart, never over its cap", () => {
    fc.assert(
      fc.property(discount, cart, (d, items) => {
        const result = outcome(() => client.computeDiscountAmount(d, items, booksById));
        if (!("ok" in result)) return; // the code doesn't apply to this cart: nothing is taken off
        const off = result.ok as number;
        expect(Number.isFinite(off)).toBe(true);
        expect(off).toBeGreaterThanOrEqual(0);
        expect(off).toBeLessThanOrEqual(subtotalOf(items) + 1e-9);
        if (Number(d.maxDiscountAmount) > 0) expect(off).toBeLessThanOrEqual(Number(d.maxDiscountAmount));
      }),
      RUNS,
    );
  });

  it("the order of the bag doesn't change the discount", () => {
    fc.assert(
      fc.property(discount, cart, (d, items) => {
        const forwards = outcome(() => client.computeDiscountAmount(d, items, booksById));
        const backwards = outcome(() => client.computeDiscountAmount(d, [...items].reverse(), booksById));
        if ("ok" in forwards && "ok" in backwards) {
          expect(Math.round((backwards.ok as number) * 100)).toBe(Math.round((forwards.ok as number) * 100));
        } else {
          expect(backwards).toEqual(forwards);
        }
      }),
      RUNS,
    );
  });

  it("a half-cent discount rounds the same way whatever the bag's order (a case the random carts found)", () => {
    const d = { id: "d", type: "percentage", value: 10, appliesTo: "all" };
    const items = [{ id: "poetry", price: 142.89, quantity: 4 }, { id: "poetry", price: 8.84, quantity: 3 }, { id: "poetry", price: 100.58, quantity: 5 }, { id: "poetry", price: 77.97, quantity: 1 }];
    for (const math of [client, server]) {
      const cents = (list: typeof items) => Math.round(math.computeDiscountAmount(d, list, booksById) * 100);
      expect(cents([...items].reverse())).toBe(cents(items));
    }
  });

  it("automatic discounts pick the biggest saving on offer", () => {
    fc.assert(
      fc.property(fc.array(discount, { maxLength: 4 }), cart, (list, items) => {
        const offers = list.map((d, i) => ({ ...d, id: `auto-${i}` }));
        const cents = offers.map((d) => {
          const r = outcome(() => client.discountAmountFor(d, items, booksById));
          return "ok" in r ? Math.round((r.ok as number) * 100) : 0;
        });
        const best = Math.max(0, ...cents);
        const pick = client.pickAutomaticDiscount(offers, items, booksById);
        if (best === 0) expect(pick === null || pick.freeShipping).toBe(true);
        else expect(Math.round(pick!.amount * 100)).toBe(best);
      }),
      RUNS,
    );
  });
});
