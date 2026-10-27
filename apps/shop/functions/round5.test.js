import { describe, it, expect } from "vitest";
import { cancelRefusal, mismatchResolved, stripePaymentTaken } from "./paymentGuards.js";
import { suspectOrders } from "./paymentSweep.js";
import { labelProblem, addressKey, packingKey } from "./fulfillmentGuard.js";

describe("cancelRefusal", () => {
  it("only lets unpaid, open orders be cancelled", () => {
    expect(cancelRefusal(null)).toBe("missing");
    expect(cancelRefusal({ paymentStatus: "paid" })).toBe("paid");
    expect(cancelRefusal({ paymentStatus: "refund_pending" })).toBe("refunded");
    expect(cancelRefusal({ paymentStatus: "refunded" })).toBe("refunded");
    expect(cancelRefusal({ paymentStatus: "unpaid", status: "cancelled" })).toBe("already_cancelled");
    expect(cancelRefusal({ paymentStatus: "unpaid", status: "completed" })).toBe("completed");
    expect(cancelRefusal({ paymentStatus: "unpaid", status: "pending" })).toBeNull();
  });
});

describe("mismatchResolved", () => {
  it("is true only once the mismatch is marked handled", () => {
    expect(mismatchResolved({})).toBe(false);
    expect(mismatchResolved({ paymentMismatch: { paidAfterCancel: true } })).toBe(false);
    expect(mismatchResolved({ paymentMismatch: { paidAfterCancel: true, resolvedAt: "2026-10-08" } })).toBe(true);
  });
});

describe("suspectOrders exclusions", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const base = { paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: new Date(now - 3600000).toISOString() };
  it("skips mismatched and stock-conflicted orders but still checks cancelled ones", () => {
    const orders = [
      { ...base, id: "ok" },
      { ...base, id: "cancelled", status: "cancelled" },
      { ...base, id: "mismatch", paymentMismatch: { paidAfterCancel: true } },
      { ...base, id: "conflict", inventoryConflict: true },
    ];
    expect(suspectOrders(orders, now).map((o) => o.id)).toEqual(["ok", "cancelled"]);
  });
});

describe("labelProblem with a dispute", () => {
  const order = { paymentStatus: "paid", status: "processing", items: [{ id: "b", quantity: 1, format: "Paperback" }], customer: { address: { street: "1 A St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } } };
  const ops = { addressReviewed: addressKey(order), packed: packingKey(order) };
  it("refuses a label while the dispute is open and allows it once settled", () => {
    expect(labelProblem({ ...order, disputeStatus: "needs_response" }, ops)).toMatch(/disputed/);
    expect(labelProblem({ ...order, disputeStatus: "won" }, ops)).toBe("");
    expect(labelProblem(order, ops)).toBe("");
  });
});

describe("stripePaymentTaken", () => {
  it("refuses to treat a paid or paying Stripe order as cancellable", () => {
    expect(stripePaymentTaken({ status: "succeeded" }, null)).toBe(true);
    expect(stripePaymentTaken({ status: "processing" }, null)).toBe(true);
    expect(stripePaymentTaken({ status: "requires_capture" }, null)).toBe(true);
    expect(stripePaymentTaken(null, { payment_status: "paid" })).toBe(true);
    expect(stripePaymentTaken(null, { status: "complete" })).toBe(true);
    expect(stripePaymentTaken({ status: "requires_payment_method" }, { status: "open", payment_status: "unpaid" })).toBe(false);
    expect(stripePaymentTaken(null, null)).toBe(false);
  });
});
