// Pure helpers that keep a Stripe payment and its shop order in step even when the
// webhook is missing, misconfigured or pointed at the other (test/live) account.
// index.js does the Stripe and Firestore calls.

// Every event stripeWebhook acts on. The webhook health check makes sure the
// Stripe endpoint sends all of them.
const REQUIRED_WEBHOOK_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  // A refund the bank or card network rejects after Stripe accepted it (status "failed").
  "charge.refund.updated",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
];

// Which Stripe account(s) to ask about an order's payment, best guess first: the
// mode the order was created in, then the shop's current mode, then the other one.
// A test-mode order looked up with the live key comes back "No such payment_intent",
// which is how sandbox orders used to stay unpaid forever.
function modesToTry(order, shopTestMode) {
  const out = [];
  const push = (m) => { if ((m === "test" || m === "live") && !out.includes(m)) out.push(m); };
  push(order && order.stripeMode);
  push(order && order.isTest === true ? "test" : null);
  push(shopTestMode ? "test" : "live");
  push("test");
  push("live");
  return out;
}

// A succeeded PaymentIntent shaped like the Checkout Session fields markStripeOrderPaid reads.
function intentAsSession(intent) {
  return {
    id: null,
    client_reference_id: intent.metadata && intent.metadata.order_id,
    payment_status: "paid",
    payment_intent: intent.id,
    livemode: intent.livemode,
    amount_total: intent.amount_received ?? intent.amount,
    currency: intent.currency,
  };
}

// A webhook event that proves a PaymentIntent for one of our orders succeeded,
// from either checkout path (card form or hosted Checkout). Duplicates with
// checkout.session.completed are harmless: marking paid is idempotent.
function paidIntentOrderId(event) {
  if (!event || event.type !== "payment_intent.succeeded") return null;
  const id = event.data && event.data.object && event.data.object.metadata && event.data.object.metadata.order_id;
  return typeof id === "string" && id && !id.includes("/") ? id : null;
}

function normaliseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}

// Looks through the Stripe account's webhook endpoints for the one that calls
// stripeWebhook and reports what is wrong with it.
function webhookEndpointReport(endpoints, webhookUrl) {
  const target = normaliseUrl(webhookUrl);
  const list = Array.isArray(endpoints) ? endpoints : [];
  const match = list.find((e) => normaliseUrl(e && e.url) === target)
    // Same function on another URL form for this project only — never another shop's endpoint.
    || list.find((e) => /lmb-test-shop.*\/stripeWebhook$/i.test(String((e && e.url) || "").replace(/\/+$/, "")));
  if (!match) return { found: false, endpointId: null, url: null, enabled: false, missingEvents: REQUIRED_WEBHOOK_EVENTS.slice(), wrongUrl: false };
  const events = Array.isArray(match.enabled_events) ? match.enabled_events : [];
  const all = events.includes("*");
  return {
    found: true,
    endpointId: match.id,
    url: match.url,
    enabled: match.status !== "disabled",
    missingEvents: all ? [] : REQUIRED_WEBHOOK_EVENTS.filter((e) => !events.includes(e)),
    wrongUrl: normaliseUrl(match.url) !== target,
  };
}

// Signing secrets to try on an incoming webhook: the deployed Functions secret and
// any endpoint secrets saved by the admin's "Fix webhook" action (test and live
// endpoints each have their own). Blank and duplicate values are dropped.
function signingSecrets(...values) {
  const out = [];
  for (const v of values.flat()) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.startsWith("whsec_") && !out.includes(s)) out.push(s);
  }
  return out;
}

// What happened to a charge after payment, from Stripe's charge (+ dispute) objects.
function reversalState(charge, dispute) {
  const amountMinor = Number(charge && charge.amount) || 0;
  const refundedMinor = Number(charge && charge.amount_refunded) || 0;
  const fullyRefunded = !!charge && (charge.refunded === true || (amountMinor > 0 && refundedMinor >= amountMinor));
  return {
    amountMinor,
    refundedMinor,
    currency: String((charge && charge.currency) || "").toUpperCase(),
    fullyRefunded,
    partiallyRefunded: !fullyRefunded && refundedMinor > 0,
    disputeStatus: dispute && dispute.status ? String(dispute.status) : null,
  };
}

const REVERSAL_RECHECK_MS = 6 * 60 * 60 * 1000;   // each paid order at most every 6 hours
const REVERSAL_WINDOW_MS = 120 * 24 * 60 * 60 * 1000; // refunds/disputes can arrive for ~120 days

// Paid Stripe orders whose refund/dispute state should be re-read from Stripe now
// (safety net for missed charge.refunded / charge.dispute.* webhooks), oldest check first.
// A refund Stripe reported as succeeded can still be rejected by the card issuer days later, so a
// recently "refunded" Stripe order is re-read for a while too (see revertFailedRefund).
const FAILED_REFUND_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
function refundedMayStillFail(o, nowMs) {
  return o.paymentStatus === "refunded" && o.refund?.provider === "stripe" && o.refund?.status !== "failed"
    && nowMs - Date.parse(o.refundedAt || o.refund?.createdAt || "") <= FAILED_REFUND_WINDOW_MS;
}
// Whether the safety net watches an order at all, whenever it was last checked.
function reversalWatched(o, nowMs = Date.now()) {
  return !!o && (o.paymentStatus === "paid" || o.paymentStatus === "refund_pending" || refundedMayStillFail(o, nowMs)) && o.isTest !== true
    && typeof o.stripePaymentIntentId === "string" && o.stripePaymentIntentId.startsWith("pi_")
    && nowMs - Date.parse(o.paidAt || o.createdAt || "") <= REVERSAL_WINDOW_MS;
}
function ordersDueReversalCheck(orders, nowMs = Date.now(), limit = 40) {
  return (orders || [])
    .filter((o) => reversalWatched(o, nowMs) && !(nowMs - Date.parse(o.stripeCheckedAt || "") < REVERSAL_RECHECK_MS))
    .sort((a, b) => (Date.parse(a.stripeCheckedAt || "") || 0) - (Date.parse(b.stripeCheckedAt || "") || 0))
    .slice(0, limit);
}

// A refund that ended without moving money ("failed" / "canceled"). Stripe accepted it at first,
// so the order went to refund_pending; it must go back to paid. Returns the failed refund's id,
// or null while any refund on the charge is still pending or went through.
const FAILED_REFUND = ["failed", "canceled"];
function failedRefundId(order, charge, refunds) {
  if (!order) return null;
  const refundedByStripe = order.paymentStatus === "refunded" && order.refund && order.refund.provider === "stripe" && order.refund.status !== "failed";
  if (order.paymentStatus !== "refund_pending" && !refundedByStripe) return null;
  if (!charge || Number(charge.amount_refunded) !== 0) return null;
  const list = (refunds || []).filter(Boolean);
  if (list.some((r) => !FAILED_REFUND.includes(String(r.status)))) return null;
  const mine = order.refund && order.refund.id ? list.find((r) => r.id === order.refund.id) : list[0];
  return mine && FAILED_REFUND.includes(String(mine.status)) ? mine.id || "unknown" : null;
}

module.exports = { failedRefundId, reversalState, ordersDueReversalCheck, reversalWatched, REVERSAL_RECHECK_MS, REVERSAL_WINDOW_MS, FAILED_REFUND_WINDOW_MS, REQUIRED_WEBHOOK_EVENTS, modesToTry, intentAsSession, paidIntentOrderId, webhookEndpointReport, signingSecrets };
