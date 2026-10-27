import { describe, it, expect } from "vitest";
import { suspectOrders, alertHtml } from "./paymentSweep.js";

const now = Date.parse("2026-10-06T12:00:00Z");
const ago = (m) => new Date(now - m * 60000).toISOString();

describe("suspectOrders", () => {
  it("picks unpaid Stripe orders older than 10 minutes and newer than 7 days", () => {
    const orders = [
      { id: "a", paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: ago(60) },
      { id: "b", paymentStatus: "unpaid", stripePaymentIntentId: "pi_2", createdAt: ago(5) },
      { id: "c", paymentStatus: "paid", stripePaymentIntentId: "pi_3", createdAt: ago(60) },
      { id: "d", paymentStatus: "unpaid", createdAt: ago(60) },
      { id: "e", paymentStatus: "unpaid", stripePaymentIntentId: "pi_5", createdAt: ago(60 * 24 * 8) },
      { id: "f", paymentStatus: "unpaid", stripePaymentIntentId: "pi_6", createdAt: ago(60), paymentAlertSentAt: "x" },
    ];
    expect(suspectOrders(orders, now).map((o) => o.id)).toEqual(["a"]);
  });

  it("escapes customer text in the alert", () => {
    expect(alertHtml([{ orderId: "1", email: "<b>x</b>", amount: 1250, currency: "cad", intentId: "pi_1" }])).toContain("&lt;b&gt;x&lt;/b&gt; — 12.50 CAD");
  });
});
