import { describe, expect, it } from "vitest";
import { canGiveCredit, creditForm } from "./storeCredit";
import { issuePayload } from "./giftCardsAdmin";

describe("store credit from an order", () => {
  it("is offered only for orders that were paid", () => {
    expect(canGiveCredit({ paymentStatus: "paid" })).toBe(true);
    expect(canGiveCredit({ paymentStatus: "refunded" })).toBe(true);
    expect(canGiveCredit({ paymentStatus: "unpaid" })).toBe(false);
    expect(canGiveCredit({})).toBe(false);
  });

  it("fills the gift card form for the customer, and it passes the form's own checks", () => {
    const form = creditForm({ orderId: "A12", total: 42.5, customer: { name: "Robin Reader", email: "robin@example.com" } });
    expect(form).toEqual({ amount: "42.50", recipientEmail: "robin@example.com", recipientName: "Robin Reader", note: "Store credit for order A12", message: "Store credit for your order A12.", sendEmail: true });
    const built = issuePayload({ ...form, expiresOn: "" }, "2026-11-13");
    expect(built).toMatchObject({ ok: true, payload: { amountMinor: 4250, recipientEmail: "robin@example.com", sendEmail: true } });
  });

  it("leaves the email off for a customer with no address", () => {
    expect(creditForm({ orderId: "T1", total: 0.5, customer: {} })).toMatchObject({ amount: "", recipientEmail: "", sendEmail: false });
  });
});
