import { describe, expect, test } from "vitest";
import { cardFeeExpenseId, cardFeesForYear, cardFeesLogged, logCardFeesChange } from "./cardFees";

const orders = [
  { paymentStatus: "paid", createdAt: "2026-03-02T15:00:00Z", fee: 145, platformFee: 25, expectedCurrency: "CAD" },
  { paymentStatus: "refunded", paidAt: "2026-07-01T15:00:00Z", fee: 59, expectedCurrency: "CAD" },
  { paymentStatus: "paid", createdAt: "2026-05-01T15:00:00Z", fee: 90, expectedCurrency: "USD" },
  { paymentStatus: "paid", createdAt: "2025-12-01T15:00:00Z", fee: 999, expectedCurrency: "CAD" },
  { paymentStatus: "paid", createdAt: "2026-05-01T15:00:00Z", fee: 999, isTest: true },
  { paymentStatus: "unpaid", createdAt: "2026-05-01T15:00:00Z", fee: 999 },
  { paymentStatus: "paid", createdAt: "2026-06-01T15:00:00Z", stripePaymentIntentId: "pi_1" },
];

describe("card fees for the year", () => {
  test("adds the year's real paid orders per currency, and counts fees not known yet", () => {
    expect(cardFeesForYear(orders, "2026")).toEqual({
      lines: [{ currency: "CAD", feeMinor: 204, platformMinor: 25, orders: 2 }, { currency: "USD", feeMinor: 90, platformMinor: 0, orders: 1 }],
      missing: 1,
    });
  });
  test("logging is one expense per year and currency, never twice", () => {
    const line = cardFeesForYear(orders, "2026").lines[0];
    const once = logCardFeesChange(line, "2026", "2026-11-11")({ baseCurrency: "CAD" });
    expect(once.businessExpenses).toHaveLength(1);
    expect(once.businessExpenses[0]).toMatchObject({ id: cardFeeExpenseId("2026", "CAD") });
    expect(cardFeesLogged(once, "2026", "CAD")).toBe(true);
    expect(logCardFeesChange(line, "2026", "2026-11-11")(once).businessExpenses).toHaveLength(1);
    expect(cardFeeExpenseId("2026", "CAD")).not.toBe(cardFeeExpenseId("2026", "USD"));
  });
});
