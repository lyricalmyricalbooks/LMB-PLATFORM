import { describe, expect, it } from "vitest";
import { disputeOpen, dispatchProblem, queueOf, addressIssues } from "./fulfillment";
import { validateDiscountDraft } from "./discountValidation";

const paid = { paymentStatus: "paid", status: "processing", items: [{ id: "b", quantity: 1, format: "Paperback" }], customer: { address: { street: "1 A St", city: "Toronto", state: "ON", zip: "M5V1A1", country: "CA" } } };

describe("disputes in the fulfilment desk", () => {
  it("treats only unsettled disputes as open", () => {
    expect(disputeOpen({ disputeStatus: "needs_response" })).toBe(true);
    expect(disputeOpen({ disputeStatus: "won" })).toBe(false);
    expect(disputeOpen({})).toBe(false);
  });
  it("sends a disputed paid order to Needs attention and blocks dispatch", () => {
    const order = { ...paid, disputeStatus: "under_review" };
    expect(queueOf(order)).toBe("Needs attention");
    expect(dispatchProblem(order)).toMatch(/disputed/);
  });
  it("keeps a parcel already sent In transit so delivery proof can be recorded", () => {
    expect(queueOf({ ...paid, fulfillmentStatus: "shipped", status: "completed", disputeStatus: "needs_response" })).toBe("In transit");
    expect(queueOf({ ...paid, fulfillmentStatus: "delivered", disputeStatus: "needs_response" })).toBe("Completed");
  });
});

describe("paid-after-cancel orders", () => {
  it("leave Needs attention once marked refunded", () => {
    const order = { ...paid, paymentStatus: "unpaid", status: "cancelled", paymentMismatch: { paidAfterCancel: true } };
    expect(queueOf(order)).toBe("Needs attention");
    expect(queueOf({ ...order, paymentMismatch: { paidAfterCancel: true, resolvedAt: "2026-10-08" } })).toBe("Completed");
  });
});

describe("address checker outage", () => {
  it("asks the shop to confirm the address instead of calling it invalid", () => {
    expect(addressIssues({ ...paid, addressVerified: false, addressError: "verification_unavailable" }).join(" ")).toMatch(/checker was unavailable/);
  });
});

describe("tiered discounts", () => {
  const form = { code: "TIERS", type: "tiered", appliesTo: "all", usageLimit: "", minOrderAmount: "", minQuantity: "" };
  it("refuses a percentage tier over 100%", () => {
    expect(validateDiscountDraft({ ...form, tiers: [{ minSpend: 50, value: 150, type: "percentage" }] }).tiers).toMatch(/more than 100%/);
    expect(validateDiscountDraft({ ...form, tiers: [{ minSpend: 50, value: 20, type: "percentage" }] }).tiers).toBeUndefined();
  });
});
