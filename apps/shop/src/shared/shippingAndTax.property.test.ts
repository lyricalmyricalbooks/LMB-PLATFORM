// Property tests for shipping and tax money (fast-check), the same pattern as discountMath.property.test.ts: each rule is
// checked against hundreds of random carts, rates and tax settings, and a failure shrinks to the smallest one that breaks it.
// The server's copies (functions/shared/*.js) decide the charge, so the shop's copies must agree with them everywhere.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fc from "fast-check";
import * as shipping from "./shippingEngine";
import * as taxKinds from "./taxByKind";
import * as taxBooks from "./taxBooks";

const req = createRequire(import.meta.url);
const serverShipping = req("../../functions/shared/shippingEngine.js");
const serverTaxKinds = req("../../functions/shared/taxByKind.js");
const serverTaxBooks = req("../../functions/shared/taxBooks.js");

const RUNS = { numRuns: 300 };
const money = fc.integer({ min: 0, max: 20_000 }).map((cents) => cents / 100);
const small = fc.integer({ min: 0, max: 3_000 }).map((cents) => cents / 100);
const maybe = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });

// Rates as a shop owner can save them (non-negative numbers, any of the optional limits).
const rate = fc.record({
  id: fc.uuid(),
  name: fc.constantFrom("Standard", "Express", "Local pickup", "Tracked"),
  type: maybe(fc.constantFrom("flat", "order", "weight", "percent", "free", "pickup")),
  base: maybe(small),
  additional: maybe(small),
  perKg: maybe(small),
  percent: maybe(fc.integer({ min: 0, max: 30 })),
  handlingFee: maybe(fc.constantFrom(0, 1.5, 3)),
  freeOver: maybe(fc.constantFrom(0, 50, 100)),
  minPrice: maybe(fc.constantFrom(0, 20)),
  maxWeight: maybe(fc.constantFrom(500, 5_000)),
  enabled: maybe(fc.boolean()),
});
const zone = fc.oneof(
  fc.record({ region: fc.constant("Rest of world"), restOfWorld: fc.constant(true), rates: fc.array(rate, { minLength: 1, maxLength: 4 }) }),
  fc.record({ region: fc.constant("Canada"), countries: fc.constant(["CA"]), rates: fc.array(rate, { minLength: 1, maxLength: 4 }) }),
);
const profiles = fc.tuple(
  fc.record({ id: fc.constant("general-profile"), zones: fc.array(zone, { minLength: 1, maxLength: 1 }), handlingFee: maybe(fc.constantFrom(0, 2)), freeShippingOver: maybe(fc.constantFrom(0, 75)), defaultItemWeightG: maybe(fc.constantFrom(200, 450)) }),
  fc.record({ id: fc.constant("heavy"), zones: fc.array(zone, { minLength: 1, maxLength: 1 }), defaultItemWeightG: maybe(fc.constantFrom(900, 2_000)) }),
).map((list) => [...list]);
const item = fc.record({
  price: money,
  quantity: fc.integer({ min: 1, max: 5 }),
  shippingProfileId: fc.constantFrom("general-profile", "heavy", undefined),
  weightGrams: maybe(fc.integer({ min: 0, max: 3_000 })),
});
const items = fc.array(item, { minLength: 1, maxLength: 5 });
const address = fc.record({ country: fc.constantFrom("Canada", "Canada", "Canada", "United States", "France") });

const byName = (quotes: shipping.ShippingQuote[]) => Object.fromEntries(quotes.map((q) => [q.name.toLowerCase(), q.price]));

describe("shipping prices, checked against random carts and rates", () => {
  it("the shop shows exactly the quotes the server charges", () => {
    fc.assert(fc.property(items, address, profiles, (cart, to, list) => {
      expect(shipping.quoteShipping(cart, to, list)).toEqual(serverShipping.quoteShipping(cart, to, list));
    }), RUNS);
  });

  it("every quote is a real price in whole cents, never below zero, cheapest first, each with its own id", () => {
    let quoted = 0;
    fc.assert(fc.property(items, address, profiles, (cart, to, list) => {
      const quotes = shipping.quoteShipping(cart, to, list);
      if (quotes.length) quoted++;
      for (const q of quotes) {
        expect(Number.isFinite(q.price)).toBe(true);
        expect(q.price).toBeGreaterThanOrEqual(0);
        expect(Math.abs(q.price * 100 - Math.round(q.price * 100))).toBeLessThan(1e-6);
      }
      expect(quotes.map((q) => q.price)).toEqual([...quotes.map((q) => q.price)].sort((a, b) => a - b));
      expect(new Set(quotes.map((q) => q.id)).size).toBe(quotes.length);
    }), RUNS);
    expect(quoted).toBeGreaterThan(RUNS.numRuns / 10); // the random settings really do produce quotes
  });

  it("free shipping for everything makes every quote free", () => {
    fc.assert(fc.property(items, address, profiles, (cart, to, list) => {
      expect(shipping.quoteShipping(cart, to, list, { freeAll: true }).every((q) => q.price === 0)).toBe(true);
    }), RUNS);
  });

  it("a choice the shopper picked is one of the quotes, else the cheapest", () => {
    fc.assert(fc.property(items, address, profiles, fc.string(), (cart, to, list, method) => {
      const quotes = shipping.quoteShipping(cart, to, list);
      const picked = shipping.pickQuote(quotes, method);
      if (!quotes.length) expect(picked).toBeNull();
      else expect(quotes).toContain(picked);
    }), RUNS);
  });

  it("the order of the bag doesn't change any price", () => {
    fc.assert(fc.property(items, address, profiles, (cart, to, list) => {
      expect(byName(shipping.quoteShipping([...cart].reverse(), to, list))).toEqual(byName(shipping.quoteShipping(cart, to, list)));
    }), RUNS);
  });
});

// Tax rates for one place, some limited to kinds of product.
const taxRate = fc.record({
  country: fc.constant("Canada"),
  region: fc.constant("ON"),
  rate: fc.constantFrom(0, 5, 8, 13, "13", ""),
  kinds: maybe(fc.subarray(["clothing", "books", "food"])),
  bookName: maybe(fc.constantFrom("HST ON", "GST", "")),
});
const taxRates = fc.array(taxRate, { maxLength: 4 });
const taxLines = fc.array(fc.record({ kind: fc.constantFrom("clothing", "books", "food", "other"), value: money }), { maxLength: 6 });
const first = <R>(rates: R[]) => rates[0] || null;
const rateOf = (r: any) => Number(r?.rate || 0) / 100;

describe("tax, checked against random orders and tax settings", () => {
  it("the shop and the server split tax the same way", () => {
    fc.assert(fc.property(taxLines, money, taxRates, (lines, amount, rates) => {
      expect(taxKinds.taxPartsByKind(lines, amount, rates, first)).toEqual(serverTaxKinds.taxPartsByKind(lines, amount, rates, first));
    }), RUNS);
  });

  it("the tax is never below the lowest rate in use nor above the highest", () => {
    fc.assert(fc.property(taxLines, money, taxRates, (lines, amount, rates) => {
      const parts = taxKinds.taxPartsByKind(lines, amount, rates, first);
      const tax = parts.reduce((sum, p) => sum + p.amount, 0);
      const used = parts.map((p) => rateOf(p.rate));
      expect(tax).toBeGreaterThanOrEqual(amount * Math.min(...used) - 1e-9);
      expect(tax).toBeLessThanOrEqual(amount * Math.max(...used) + 1e-9);
    }), RUNS);
  });

  it("a shop that doesn't use kinds is charged one rate on the whole amount, as before", () => {
    const plain = fc.array(taxRate.map(({ kinds: _kinds, ...r }) => r), { maxLength: 4 });
    fc.assert(fc.property(taxLines, money, plain, (lines, amount, rates) => {
      const parts = taxKinds.taxPartsByKind(lines, amount, rates, first);
      expect(parts).toHaveLength(1);
      expect(parts[0].amount).toBeCloseTo(amount * rateOf(first(rates)), 9);
    }), RUNS);
  });

  it("the bookkeeping lines always add up to the order's rounded tax, to the cent", () => {
    const part = fc.record({ rate: taxRate, amount: fc.integer({ min: 0, max: 500_000 }).map((n) => n / 10_000) });
    fc.assert(fc.property(fc.array(part, { maxLength: 6 }), (parts) => {
      const lines = taxBooks.taxLinesFor(parts);
      const sum = parts.reduce((s, p) => s + p.amount, 0);
      expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(Math.round(sum * 100));
      expect(lines).toEqual(serverTaxBooks.taxLinesFor(parts));
    }), RUNS);
  });
});

describe("shipping regressions the random checks found", () => {
  it("two profiles with the same base charge the same whichever was added to the bag first (3 November 2026)", () => {
    // Before: the first profile in the bag led, so a book then a poster cost $15, and a poster then a book $12.
    const list = [
      { id: "general-profile", zones: [{ region: "Rest of world", restOfWorld: true, rates: [{ id: "a", name: "Standard", base: 10, additional: 2 }] }] },
      { id: "heavy", zones: [{ region: "Rest of world", restOfWorld: true, rates: [{ id: "b", name: "Standard", base: 10, additional: 5 }] }] },
    ];
    const book = { price: 20, quantity: 1, shippingProfileId: "general-profile" };
    const poster = { price: 30, quantity: 1, shippingProfileId: "heavy" };
    const bookFirst = shipping.quoteShipping([book, poster], { country: "Canada" }, list);
    const posterFirst = shipping.quoteShipping([poster, book], { country: "Canada" }, list);
    expect(bookFirst[0].price).toBe(12);
    expect(posterFirst[0].price).toBe(12);
  });
});
