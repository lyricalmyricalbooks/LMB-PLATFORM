// A live carrier quote is priced in the shop's own currency, or left out: never a number in the wrong currency.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { checkoutRate, rateAmount } = require("./checkoutRate.js");

describe("a carrier quote in the shop's currency", () => {
  const us = { currency: "USD", rates: { usd: 1, cad: 1.25, eur: 0.9 } };
  const ca = { currency: "CAD", rates: { cad: 1, usd: 0.8, eur: 0.7 } };

  it("takes a quote in the shop's own currency, or one that names none, as it is", () => {
    expect(rateAmount({ amount: "12.40", currency: "CAD" }, ca)).toBe(12.4);
    expect(rateAmount({ amount: "9.10", currency: "USD" }, us)).toBe(9.1);
    expect(rateAmount({ amount: "12.40" }, us)).toBe(12.4);
    expect(rateAmount({ amount: "12.40", currency: "USD" })).toBe(12.4);
  });

  it("uses the carrier's own figure in the shop's currency when it gives one", () => {
    expect(rateAmount({ amount: "12.50", currency: "CAD", amount_local: "9.87", currency_local: "USD" }, us)).toBe(9.87);
  });

  it("converts at the day's rate otherwise, and leaves out a quote it can't price", () => {
    expect(rateAmount({ amount: "12.50", currency: "CAD" }, us)).toBe(10);
    expect(rateAmount({ amount: "8.00", currency: "USD" }, ca)).toBe(10);
    expect(rateAmount({ amount: "8.00", currency: "GBP" }, ca)).toBeNaN();
    expect(rateAmount({ amount: "8.00", currency: "USD" }, { currency: "CAD", rates: null })).toBeNaN();
    expect(checkoutRate({ provider: "USPS", servicelevel: { name: "Priority Mail" }, amount: "12.50", currency: "CAD" }, us)).toMatchObject({ name: "USPS Priority Mail", price: 10, base: 10 });
  });
});
