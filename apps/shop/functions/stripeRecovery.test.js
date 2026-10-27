import { describe, it, expect } from "vitest";
import { REQUIRED_WEBHOOK_EVENTS, modesToTry, intentAsSession, paidIntentOrderId, webhookEndpointReport, signingSecrets } from "./stripeRecovery.js";

const URL = "https://us-central1-lmb-test-shop.cloudfunctions.net/stripeWebhook";

describe("modesToTry", () => {
  it("asks the account the order was created in first, then the other", () => {
    expect(modesToTry({ stripeMode: "test" }, false)).toEqual(["test", "live"]);
    expect(modesToTry({ stripeMode: "live" }, true)).toEqual(["live", "test"]);
  });
  it("falls back to the shop's mode for older orders without stripeMode", () => {
    expect(modesToTry({}, true)).toEqual(["test", "live"]);
    expect(modesToTry({}, false)).toEqual(["live", "test"]);
  });
});

describe("paidIntentOrderId", () => {
  const ev = (metadata, type = "payment_intent.succeeded") => ({ type, data: { object: { id: "pi_1", metadata } } });
  it("accepts a succeeded intent for an order from either checkout path", () => {
    expect(paidIntentOrderId(ev({ order_id: "ABC", checkout: "payment_element" }))).toBe("ABC");
    expect(paidIntentOrderId(ev({ order_id: "ABC" }))).toBe("ABC");
  });
  it("ignores other events, intents without an order, and path-like ids", () => {
    expect(paidIntentOrderId(ev({ order_id: "ABC" }, "payment_intent.created"))).toBeNull();
    expect(paidIntentOrderId(ev({}))).toBeNull();
    expect(paidIntentOrderId(ev({ order_id: "a/b" }))).toBeNull();
  });
});

describe("intentAsSession", () => {
  it("uses the amount actually received", () => {
    const s = intentAsSession({ id: "pi_1", metadata: { order_id: "X" }, livemode: false, amount: 1520, amount_received: 1520, currency: "cad" });
    expect(s).toMatchObject({ client_reference_id: "X", payment_intent: "pi_1", payment_status: "paid", amount_total: 1520, currency: "cad" });
  });
});

describe("webhookEndpointReport", () => {
  it("reports a missing endpoint", () => {
    expect(webhookEndpointReport([], URL)).toMatchObject({ found: false, missingEvents: REQUIRED_WEBHOOK_EVENTS });
  });
  it("finds events the endpoint does not send (the 'paid in Stripe, unpaid in shop' cause)", () => {
    const r = webhookEndpointReport([{ id: "we_1", url: URL, status: "enabled", enabled_events: ["checkout.session.completed"] }], URL);
    expect(r.found).toBe(true);
    expect(r.missingEvents).toContain("payment_intent.succeeded");
  });
  it("treats '*' as every event and notices a disabled endpoint", () => {
    const r = webhookEndpointReport([{ id: "we_1", url: URL + "/", status: "disabled", enabled_events: ["*"] }], URL);
    expect(r).toMatchObject({ missingEvents: [], enabled: false, wrongUrl: false });
  });
  it("finds this shop's endpoint left in another region, and never another shop's", () => {
    const moved = "https://northamerica-northeast1-lmb-test-shop.cloudfunctions.net/stripeWebhook";
    const other = { id: "we_other", url: "https://us-central1-other-press-shop.cloudfunctions.net/stripeWebhook", status: "enabled", enabled_events: ["*"] };
    const r = webhookEndpointReport([other, { id: "we_1", url: URL, status: "enabled", enabled_events: ["*"] }], moved);
    expect(r).toMatchObject({ found: true, endpointId: "we_1", wrongUrl: true });
    expect(webhookEndpointReport([other], moved)).toMatchObject({ found: false });
    // A longer project name that merely ends the same way is someone else's.
    expect(webhookEndpointReport([{ ...other, url: "https://us-central1-not-lmb-test-shop.cloudfunctions.net/stripeWebhook" }], moved)).toMatchObject({ found: false });
  });
});

describe("signingSecrets", () => {
  it("keeps only distinct whsec_ values", () => {
    expect(signingSecrets("whsec_a", "", undefined, "whsec_a", "sk_x", " whsec_b ")).toEqual(["whsec_a", "whsec_b"]);
  });
});

import { reversalState, ordersDueReversalCheck } from "./stripeRecovery.js";

describe("reversalState", () => {
  it("reads a full refund, a partial refund and a dispute", () => {
    expect(reversalState({ amount: 1520, amount_refunded: 1520, refunded: true, currency: "cad" })).toMatchObject({ fullyRefunded: true, partiallyRefunded: false, currency: "CAD" });
    expect(reversalState({ amount: 1520, amount_refunded: 500, refunded: false, currency: "cad" })).toMatchObject({ fullyRefunded: false, partiallyRefunded: true, refundedMinor: 500 });
    expect(reversalState({ amount: 1520, amount_refunded: 0 }, { status: "needs_response" })).toMatchObject({ fullyRefunded: false, partiallyRefunded: false, disputeStatus: "needs_response" });
  });
});

describe("ordersDueReversalCheck", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const h = (n) => new Date(now - n * 3600000).toISOString();
  it("re-reads paid Stripe orders not checked in 6 hours, never-checked first", () => {
    const orders = [
      { id: "fresh", paymentStatus: "paid", stripePaymentIntentId: "pi_1", paidAt: h(2), stripeCheckedAt: h(1) },
      { id: "stale", paymentStatus: "paid", stripePaymentIntentId: "pi_2", paidAt: h(48), stripeCheckedAt: h(7) },
      { id: "never", paymentStatus: "paid", stripePaymentIntentId: "pi_3", paidAt: h(3) },
      { id: "refunded", paymentStatus: "refunded", stripePaymentIntentId: "pi_4", paidAt: h(3) },
      { id: "manual", paymentStatus: "paid", paidAt: h(3) },
      { id: "ancient", paymentStatus: "paid", stripePaymentIntentId: "pi_5", paidAt: h(24 * 200) },
      { id: "test", paymentStatus: "paid", stripePaymentIntentId: "pi_6", paidAt: h(3), isTest: true },
    ];
    expect(ordersDueReversalCheck(orders, now).map((o) => o.id)).toEqual(["never", "stale"]);
  });
});
