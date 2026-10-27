import { describe, expect, it } from "vitest";
import { checkoutFlow, confirmationView, initialFlow, readReturn, type CheckoutEvent, type CheckoutFlow } from "./checkoutFlow";

const run = (...events: CheckoutEvent[]) => events.reduce(checkoutFlow, initialFlow as CheckoutFlow);
const landed = (manual = false, previousPaid = false): CheckoutEvent => ({ type: "landed", orderId: "A1", manual, previousPaid });
const confirming = (...events: CheckoutEvent[]) => {
  const state = run(landed(), ...events);
  if (state.step !== "confirming") throw new Error(`expected confirming, got ${state.step}`);
  return state;
};

describe("paying", () => {
  it("a second press during an attempt changes nothing", () => {
    const paying = run({ type: "pay" });
    expect(paying).toEqual({ step: "paying", leaving: false });
    expect(checkoutFlow(paying, { type: "pay" })).toBe(paying);
  });
  it("a failed or refused attempt goes back to the form so the shopper can correct it", () => {
    expect(run({ type: "pay" }, { type: "payEnded", leaving: false })).toEqual(initialFlow);
  });
  it("stays busy while the shopper is sent to a provider, until Back restores the page", () => {
    const leaving = run({ type: "pay" }, { type: "payEnded", leaving: true });
    expect(leaving).toEqual({ step: "paying", leaving: true });
    expect(checkoutFlow(leaving, { type: "pay" })).toBe(leaving);
    expect(checkoutFlow(leaving, { type: "restored" })).toEqual(initialFlow);
  });
  it("ignores a restore or an attempt ending outside an attempt", () => {
    expect(run({ type: "restored" })).toEqual(initialFlow);
    expect(run({ type: "payEnded", leaving: false })).toEqual(initialFlow);
    const state = confirming();
    expect(checkoutFlow(state, { type: "restored" })).toBe(state);
  });
});

describe("confirming", () => {
  it("only the order record confirms a card order", () => {
    const state = confirming();
    expect(confirmationView(state, null)).toEqual({ manual: false, stamp: "unpaid", headline: "coFinalizing", status: "coConfirming" });
    const paid = checkoutFlow(state, { type: "orderSeen", paymentStatus: "paid" });
    expect(confirmationView(paid as any, null)).toEqual({ manual: false, stamp: "paid", headline: "coOrderConfirmed", status: "coConfirmationSent" });
    expect(checkoutFlow(state, { type: "orderSeen", paymentStatus: "unpaid" })).toBe(state);
  });
  it("Stripe saying complete shows it went through, and only then says so when checking stops", () => {
    const state = confirming({ type: "stripeStatus", status: "complete" });
    expect(confirmationView(state, null).headline).toBe("coOrderConfirmed");
    expect(confirmationView(confirming({ type: "stripeStatus", status: "complete" }, { type: "gaveUp" }), null).status).toBe("coConfirmingSlow");
    expect(confirmationView(confirming({ type: "gaveUp" }), null)).toMatchObject({ stamp: "unpaid", status: "coConfirmingUnverified" });
  });
  it("a bank debit in progress is never shown as paid", () => {
    const state = confirming({ type: "stripeStatus", status: "processing" }, { type: "gaveUp" });
    expect(confirmationView(state, null)).toEqual({ manual: false, stamp: "unpaid", headline: "coFinalizing", status: "coPaymentProcessing" });
  });
  it("coming back without paying, or a failed PayPal capture, returns to the form", () => {
    expect(run(landed(), { type: "stripeStatus", status: "open" })).toEqual(initialFlow);
    expect(run(landed(), { type: "stripeStatus", status: "expired" })).toEqual(initialFlow);
    expect(run(landed(), { type: "paypalFailed" })).toEqual(initialFlow);
    // Other answers (or none) keep checking the order record.
    expect(confirming({ type: "stripeStatus", status: undefined }).stripe).toBe("unknown");
  });
  it("manual payments show instructions, whether the address or the order says so", () => {
    const manual = run(landed(true)) as any;
    expect(confirmationView(manual, null)).toEqual({ manual: true, stamp: "unpaid", headline: "coOrderPlaced", status: null });
    expect(confirmationView(confirming(), { paymentStatus: "pending" }).manual).toBe(true);
  });
  it("giving up after the order was paid changes nothing", () => {
    const paid = confirming({ type: "orderSeen", paymentStatus: "paid" });
    expect(checkoutFlow(paid, { type: "gaveUp" })).toBe(paid);
  });
  it("keeps the earlier-attempt-paid flag for its notice", () => {
    expect(run(landed(false, true))).toMatchObject({ step: "confirming", previousPaid: true });
  });
});

describe("readReturn", () => {
  it("reads a Stripe return and the address it settles on", () => {
    const r = readReturn("?success=true&order_id=A%201&payment_intent=pi_1", "/checkout");
    expect(r).toMatchObject({ landing: true, orderId: "A 1", stripeIntentId: "pi_1", paypal: false, manual: false });
    expect(r.settledUrl).toBe("/checkout?order_id=A%201&success=true");
  });
  it("keeps manual and earlier-attempt flags on the settled address", () => {
    expect(readReturn("?success=true&order_id=B&manual=true&previous_paid=true", "/checkout").settledUrl)
      .toBe("/checkout?order_id=B&success=true&manual=true&previous_paid=true");
  });
  it("reads a PayPal return with its token", () => {
    expect(readReturn("?paypal_return=true&order_id=C&token=T", "/checkout")).toMatchObject({ landing: true, paypal: true, paypalToken: "T" });
  });
  it("is not a landing without an order or a return flag", () => {
    expect(readReturn("?success=true", "/checkout").landing).toBe(false);
    expect(readReturn("?order_id=D", "/checkout").landing).toBe(false);
    expect(readReturn("?canceled=1", "/checkout")).toMatchObject({ landing: false, canceled: true });
  });
});
