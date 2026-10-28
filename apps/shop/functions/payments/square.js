// The Square payment provider (code plan 2.2b; functions/payments/index.js lists the interface). Square shops always
// take payments through the platform: every call goes to the platform's payment service (platform.js `call`), which
// holds the press's Square connection and answers `square.*` calls on that press's own account
// (LMB-PLATFORM services/payments/square.js). The shop holds no Square token.
//
// The callers (checkout, the webhook, refunds, the sweeps) speak the interface's words, which came from Stripe:
// PaymentIntent, Checkout Session, charge, refund, dispute. This file answers in those words, so the order bookkeeping
// runs unchanged:
//
//   Square payment      -> an "intent" (`sqpay_<id>`): COMPLETED succeeded, APPROVED requires_capture, PENDING
//                          processing, CANCELED canceled, FAILED requires_payment_method; anything else processing
//                          (counted as possibly taken, so nothing is cancelled under it)
//   Square payment link -> a "session" (`sqlink_<id>`): Square's hosted checkout page, the shop's only Square route
//   refunds, disputes   -> Stripe-shaped refunds and disputes (Square's states mapped to Stripe's)
//
// Square has no card form on the shop's page here: `createCardIntent` refuses, and the checkout page sends Square
// shoppers to Square's own page instead. Webhook deliveries are never believed: only the object's id is read, and the
// object is fetched again through the service, which only reaches this press's account.

const { modesToTry } = require("../stripeRecovery");
const { isSquarePaymentId, isSquareCheckoutId, squarePaymentId, squareCheckoutId, squareIdOf } = require("./ids");

const PLATFORM_KEY = "platform";
const SQUARE_ID = /^[A-Za-z0-9_-]{1,192}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;

// A mode this shop has no Square connection in (a Sandbox shop asked for live, or the reverse), or an id Square
// doesn't know there: nothing to find in that mode.
const elsewhere = (err) => ["test_only", "not_connected"].includes(err?.code) || err?.statusCode === 404;

const lower = (value) => String(value || "").toLowerCase();

const INTENT_STATUS = Object.freeze({ COMPLETED: "succeeded", APPROVED: "requires_capture", PENDING: "processing", CANCELED: "canceled", FAILED: "requires_payment_method" });
const REFUND_STATUS = Object.freeze({ PENDING: "pending", COMPLETED: "succeeded", REJECTED: "canceled", FAILED: "failed" });
const DISPUTE_STATUS = Object.freeze({
  INQUIRY_EVIDENCE_REQUIRED: "warning_needs_response", INQUIRY_PROCESSING: "warning_under_review", INQUIRY_CLOSED: "warning_closed",
  EVIDENCE_REQUIRED: "needs_response", PROCESSING: "under_review", WON: "won", LOST: "lost",
  // The press accepted the dispute: the buyer keeps the money, as with a lost one.
  ACCEPTED: "lost",
});
const CLOSED_DISPUTES = new Set(["won", "lost", "warning_closed"]);

/** A Square payment (the service's shape) as the interface's PaymentIntent. */
function intentFrom(payment, mode) {
  const status = INTENT_STATUS[payment.status] || "processing";
  return {
    id: squarePaymentId(payment.id),
    object: "payment_intent",
    status,
    amount: payment.totalMinor,
    amount_received: status === "succeeded" ? payment.totalMinor : 0,
    currency: lower(payment.currency),
    metadata: payment.referenceId ? { order_id: payment.referenceId } : {},
    livemode: mode === "live",
  };
}

function refundFrom(refund) {
  return {
    id: refund.id,
    object: "refund",
    amount: refund.amountMinor,
    currency: lower(refund.currency),
    status: REFUND_STATUS[refund.status] || "pending",
    payment_intent: refund.paymentId ? squarePaymentId(refund.paymentId) : null,
    ...(refund.status === "REJECTED" || refund.status === "FAILED" ? { failure_reason: refund.status === "REJECTED" ? "rejected by Square" : "failed at Square" } : {}),
  };
}

function disputeFrom(dispute) {
  return {
    id: dispute.id,
    object: "dispute",
    status: DISPUTE_STATUS[dispute.state] || "needs_response",
    amount: dispute.amountMinor,
    currency: lower(dispute.currency),
    reason: lower(dispute.reason),
    payment_intent: dispute.paymentId ? squarePaymentId(dispute.paymentId) : null,
  };
}

/** The payment as the interface's charge: refunds still pending count as refunded, as Stripe counts them. */
function chargeFrom(payment, refunds, disputes) {
  const amount = payment.totalMinor;
  const refunded = refunds
    ? refunds.filter((r) => r.status === "PENDING" || r.status === "COMPLETED").reduce((sum, r) => sum + r.amountMinor, 0)
    : payment.refundedMinor;
  return {
    id: squarePaymentId(payment.id),
    object: "charge",
    amount,
    amount_refunded: refunded,
    refunded: amount > 0 && refunded >= amount,
    disputed: disputes.length > 0,
    currency: lower(payment.currency),
    payment_intent: squarePaymentId(payment.id),
  };
}

const newestFirst = (list) => [...list].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

/**
 * The Square provider for one shop.
 * @param {object} deps
 * @param {object} deps.db Firestore (settings/website, orders)
 * @param {{ call: Function }} deps.platform platform mode (platform.js createPlatformAccess); required
 */
function createSquareProvider({ db, platform = null }) {
  if (!platform) {
    throw new Error('Square payments run through the platform. Set SHOP_PAYMENT_MODE="platform" and SHOP_PAYMENTS_SERVICE_URL in the shop\'s functions/.env file.');
  }
  const call = (op, mode, args) => platform.call(op, mode === "test" ? "test" : "live", args);

  async function shopTestMode() {
    const settingsDoc = await db.collection("settings").doc("website").get();
    return !!(settingsDoc.exists && settingsDoc.data()?.payments?.testMode);
  }

  async function readKeys() {
    return { testMode: await shopTestMode(), secrets: { test: PLATFORM_KEY, live: PLATFORM_KEY }, clientOptions: {} };
  }

  // Runs `ask(mode)` in each mode that may hold the order's payment (the order's own first); a mode without this
  // shop's Square connection, or where Square doesn't know the id, is skipped. null when none answered.
  async function inOrderModes(order, keys, ask) {
    const testMode = keys ? keys.testMode : await shopTestMode();
    for (const mode of modesToTry(order, testMode)) {
      try {
        return await ask(mode);
      } catch (err) {
        if (elsewhere(err)) continue;
        throw err;
      }
    }
    return null;
  }

  // The payment link as a Checkout Session, with its payment's state.
  async function sessionFrom(checkout, mode) {
    const paymentId = checkout.paymentIds?.[0] || null;
    const payment = paymentId ? await call("square.payments.retrieve", mode, { id: paymentId }) : null;
    const paid = payment?.status === "COMPLETED";
    const status = payment ? "complete" : checkout.state === "CANCELED" ? "expired" : "open";
    return {
      id: squareCheckoutId(checkout.id),
      object: "checkout.session",
      status,
      payment_status: paid ? "paid" : "unpaid",
      client_reference_id: checkout.referenceId,
      payment_intent: payment ? squarePaymentId(payment.id) : null,
      amount_total: payment ? payment.totalMinor : checkout.totalMinor,
      currency: lower(payment?.currency || checkout.currency),
      livemode: mode === "live",
      url: checkout.url || null,
    };
  }

  async function findOrderPayment(orderId, order, { paymentIntentId, sessionId } = {}, keys = null) {
    return inOrderModes(order, keys, async (mode) => {
      if (isSquarePaymentId(paymentIntentId)) {
        const payment = await call("square.payments.retrieve", mode, { id: squareIdOf(paymentIntentId) });
        if (payment.referenceId !== orderId) return null;
        return { intent: intentFrom(payment, mode), mode };
      }
      if (isSquareCheckoutId(sessionId)) {
        const checkout = await call("square.checkout.retrieve", mode, { id: squareIdOf(sessionId) });
        if (checkout.referenceId !== orderId) return null;
        return { session: await sessionFrom(checkout, mode), mode };
      }
      return null;
    });
  }

  // A clientForMode "account": just the mode (the service knows the press's account).
  async function clientForMode(mode) {
    return { square: true, mode: mode === "test" ? "test" : "live" };
  }

  async function readAttempt(account, { intentId = "", sessionId = "" }, found = {}) {
    if (isSquarePaymentId(intentId)) found.intent = intentFrom(await call("square.payments.retrieve", account.mode, { id: squareIdOf(intentId) }), account.mode);
    if (isSquareCheckoutId(sessionId)) found.session = await sessionFrom(await call("square.checkout.retrieve", account.mode, { id: squareIdOf(sessionId) }), account.mode);
    return found;
  }

  // Best effort: an open payment link is deleted, so the shopper can't pay a cancelled order. Square's hosted checkout
  // completes its payments at once, so there is no unfinished card payment to cancel.
  async function stopAttempt(account, { session = null }) {
    const stopped = [];
    if (session && session.status === "open" && isSquareCheckoutId(session.id)) {
      await call("square.checkout.delete", account.mode, { id: squareIdOf(session.id) }).then(() => stopped.push("checkout")).catch(() => {});
    }
    return stopped;
  }

  async function reversalOf(payment, mode) {
    const refunds = payment.refundIds?.length ? (await call("square.refunds.forPayment", mode, { paymentId: payment.id })).data || [] : [];
    const disputes = newestFirst((await call("square.disputes.forPayment", mode, { paymentId: payment.id })).data || []);
    return { refunds, disputes, charge: chargeFrom(payment, refunds, disputes) };
  }

  async function checkReversal(orderId, order, { keys = null } = {}, apply) {
    const saved = String(order.stripePaymentIntentId || "");
    if (!isSquarePaymentId(saved)) return null;
    return inOrderModes(order, keys, async (mode) => {
      const payment = await call("square.payments.retrieve", mode, { id: squareIdOf(saved) });
      if (payment.referenceId !== orderId) return null;
      const { refunds, disputes, charge } = await reversalOf(payment, mode);
      return apply({ charge, dispute: disputes[0] ? disputeFrom(disputes[0]) : null, listRefunds: async () => refunds.map(refundFrom) });
    });
  }

  async function refund({ mode, paymentIntentId, amountMinor = null, metadata, idempotencyKey, onCalling = () => {} }) {
    if (!isSquarePaymentId(paymentIntentId)) throw new Error("This order has no Square payment to refund.");
    onCalling();
    const made = await call("square.refunds.create", mode, {
      params: { paymentId: squareIdOf(paymentIntentId), ...(amountMinor != null ? { amountMinor } : {}), ...(metadata?.reason ? { reason: String(metadata.reason) } : {}) },
      idempotencyKey,
    });
    const status = REFUND_STATUS[made.status] || "pending";
    if (!["succeeded", "pending"].includes(status)) throw new Error(`Square refund was not accepted (status: ${made.status}).`);
    return { refundId: made.id, amountMinor: made.amountMinor, currency: lower(made.currency), status };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────────────────────────────────────────

  async function webhookClient() {
    return { square: true };
  }

  // The order's saved payment link, so a payment marked paid keeps it.
  async function savedCheckoutOf(orderId) {
    if (typeof orderId !== "string" || !orderId || orderId.includes("/")) return null;
    const snap = await db.collection("orders").doc(orderId).get();
    const saved = snap.exists ? snap.data()?.stripeCheckoutSessionId : null;
    return isSquareCheckoutId(saved) ? saved : null;
  }

  // One forwarded Square delivery, as an event the webhook understands. Only `event_id`, `type`, `data.type` and
  // `data.id` (and, for a dispute, its payment's id) are read from the delivery; everything else is fetched again.
  async function eventFor(claimed, mode) {
    const id = `sq_${claimed.event_id}`;
    const livemode = mode === "live";
    const objectId = claimed.data?.id;
    if (typeof objectId !== "string" || !SQUARE_ID.test(objectId)) throw Object.assign(new Error("The delivery names no Square object."), { code: "bad_delivery" });
    const kind = claimed.data?.type;
    if (kind === "payment") {
      const payment = await call("square.payments.retrieve", mode, { id: objectId });
      if (payment.status === "COMPLETED" && payment.referenceId) {
        const session = {
          id: await savedCheckoutOf(payment.referenceId),
          client_reference_id: payment.referenceId,
          status: "complete",
          payment_status: "paid",
          payment_intent: squarePaymentId(payment.id),
          livemode,
          amount_total: payment.totalMinor,
          currency: lower(payment.currency),
        };
        return { id, type: "checkout.session.completed", livemode, data: { object: session } };
      }
      return { id, type: "square.payment.updated", livemode, data: { object: intentFrom(payment, mode) } };
    }
    if (kind === "refund") {
      const found = await call("square.refunds.retrieve", mode, { id: objectId });
      if (found.status === "REJECTED" || found.status === "FAILED") return { id, type: "charge.refund.updated", livemode, data: { object: refundFrom(found) } };
      const payment = await call("square.payments.retrieve", mode, { id: found.paymentId });
      const { charge } = await reversalOf(payment, mode);
      return { id, type: "charge.refunded", livemode, data: { object: charge } };
    }
    if (kind === "dispute") {
      const paymentId = claimed.data?.object?.dispute?.disputed_payment?.payment_id;
      if (typeof paymentId !== "string" || !SQUARE_ID.test(paymentId)) throw Object.assign(new Error("The dispute names no payment."), { code: "bad_delivery" });
      // Only a dispute Square lists for that payment counts.
      const disputes = (await call("square.disputes.forPayment", mode, { paymentId })).data || [];
      const dispute = disputes.find((d) => d.id === objectId);
      if (!dispute) throw Object.assign(new Error("Square has no such dispute."), { code: "bad_delivery" });
      const shaped = disputeFrom(dispute);
      const type = claimed.type === "dispute.created" ? "charge.dispute.created" : CLOSED_DISPUTES.has(shaped.status) ? "charge.dispute.closed" : "charge.dispute.updated";
      return { id, type, livemode, data: { object: shaped } };
    }
    if (kind === "payout") {
      // A payout that reached the press's bank: each order in it keeps its fee and payout (code plan 7.10).
      const payout = await call("square.payouts.retrieve", mode, { id: objectId });
      const type = claimed.type === "payout.paid" && payout.status === "PAID" ? "payout.paid" : "square.payout.updated";
      return { id, type, livemode, data: { object: { id: payout.id, object: "payout", status: lower(payout.status), arrival_date: payout.arrivalDate || null } } };
    }
    throw Object.assign(new Error("Not a Square event the shop uses."), { code: "bad_delivery" });
  }

  async function verifyWebhookEvent(_client, rawBody) {
    let claimed;
    try { claimed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody)); } catch { claimed = null; }
    if (typeof claimed?.event_id !== "string" || !EVENT_ID.test(claimed.event_id)) return { event: null, lastError: new Error("The delivery names no Square event.") };
    const testMode = await shopTestMode();
    let lastError = null;
    for (const mode of testMode ? ["test", "live"] : ["live", "test"]) {
      try {
        return { event: await eventFor(claimed, mode), lastError: null };
      } catch (err) {
        lastError = err;
        if (!elsewhere(err)) break;
      }
    }
    return { event: null, lastError };
  }

  // ── Checkout ───────────────────────────────────────────────────────────────────────────────────────────────────

  const noCardForm = () => Object.assign(new Error("This shop takes card payments on Square's own checkout page."), { code: "card_form_unavailable", statusCode: 400 });

  async function forCheckout(settings) {
    const mode = settings.payments?.testMode ? "test" : "live";
    return {
      async settlePreviousIntent(intentId) {
        if (!isSquarePaymentId(intentId)) return "cleared";
        const previous = intentFrom(await call("square.payments.retrieve", mode, { id: squareIdOf(intentId) }), mode);
        return ["succeeded", "processing", "requires_capture"].includes(previous.status) ? "in_progress" : "cleared";
      },
      async createCardIntent() {
        throw noCardForm();
      },
      // The caller's server-priced Checkout Session parameters, as a Square payment link. Square sends the shopper back
      // to the success address; it has no cancel address (the shopper uses Back) and no embedded form.
      async createCheckoutSession(params, { idempotencyKey }) {
        if (params.ui_mode === "embedded") throw noCardForm();
        const lineItems = (params.line_items || []).map((item) => ({
          name: String(item.price_data?.product_data?.name || "Item").slice(0, 512),
          quantity: item.quantity,
          unitAmountMinor: item.price_data?.unit_amount,
        }));
        const currency = params.line_items?.[0]?.price_data?.currency;
        // Square can't fill in the session id: the return page asks about the order's saved link instead.
        const redirectUrl = String(params.success_url || "").replace("session_id={CHECKOUT_SESSION_ID}", "square=1");
        const made = await call("square.checkout.create", mode, {
          params: {
            referenceId: params.client_reference_id,
            currency,
            lineItems,
            ...(params.customer_email ? { buyerEmail: params.customer_email } : {}),
            redirectUrl,
            note: `Order ${params.client_reference_id}`,
          },
          idempotencyKey,
        });
        return { id: squareCheckoutId(made.id), object: "checkout.session", url: made.url, client_secret: null, status: "open" };
      },
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────────────────────────────────────

  function deployedLiveKey() { return ""; }
  async function checkKey() { return { ok: false, error: "This shop takes payments through Square, connected in Settings › Payments; it needs no key." }; }
  async function webhookEndpoints() { return { mode: (await shopTestMode()) ? "test" : "live", endpoints: null }; }
  async function registerPaymentDomain() { throw new Error("Square's checkout page runs on Square's own address, so no payment domain is registered."); }

  // ── Fees and payouts (code plan 7.10; orderMoney.js keeps them on the order) ─────────────────────────────────

  const settledRefund = (r) => r.status === "PENDING" || r.status === "COMPLETED";

  // The payment's fees as Square has them now: Square's processing fee and Colophon's app fee taken from the payment;
  // each refund gives back what Square returns of its fee and Colophon's share of the refund (app_fee_money).
  async function paymentMoney(orderId, order, { keys = null } = {}) {
    const saved = String(order.stripePaymentIntentId || "");
    if (!isSquarePaymentId(saved)) return null;
    return inOrderModes(order, keys, async (mode) => {
      const payment = await call("square.payments.retrieve", mode, { id: squareIdOf(saved) });
      if (payment.referenceId !== orderId || payment.status !== "COMPLETED") return null;
      const currency = lower(payment.currency);
      const fee = (payment.processingFeeMinor || 0) + (payment.appFeeMinor || 0);
      const parts = { charge: { fee, net: payment.totalMinor - fee, platformFee: payment.appFeeMinor || 0, currency } };
      if (payment.refundIds?.length) {
        for (const refund of ((await call("square.refunds.forPayment", mode, { paymentId: payment.id })).data || []).filter(settledRefund)) {
          const refundFee = (refund.processingFeeMinor || 0) - (refund.appFeeMinor || 0);
          parts[refund.id] = { fee: refundFee, net: -refund.amountMinor - refundFee, platformFee: -(refund.appFeeMinor || 0), currency };
        }
      }
      return { parts };
    });
  }

  // What one payout paid in, from Square's payout entries: a CHARGE line for each payment ("charge") and a REFUND line
  // for each refund (its id). `date` is the day the payout reached the bank.
  async function payoutMoney({ mode, payoutId }) {
    const payout = await call("square.payouts.retrieve", mode, { id: squareIdOf(payoutId) });
    const lines = [];
    let cursor;
    for (let page = 0; page < 100; page += 1) {
      const answer = await call("square.payouts.entries", mode, { id: payout.id, ...(cursor ? { cursor } : {}) });
      for (const entry of answer.data || []) {
        if (!entry.paymentId) continue;
        const part = { fee: entry.feeMinor, net: entry.netMinor, currency: lower(entry.currency) };
        if (entry.type === "CHARGE") lines.push({ paymentId: squarePaymentId(entry.paymentId), key: "charge", part });
        else if (entry.type === "REFUND" && entry.refundId) lines.push({ paymentId: squarePaymentId(entry.paymentId), key: entry.refundId, part });
      }
      cursor = answer.cursor;
      if (!cursor) break;
    }
    return { payout: { id: payout.id, date: payout.arrivalDate || null }, lines };
  }

  return {
    id: "square",
    testMode: shopTestMode, readKeys, clientForMode, findOrderPayment, readAttempt, stopAttempt, checkReversal, refund,
    webhookClient, verifyWebhookEvent, forCheckout, deployedLiveKey, checkKey, webhookEndpoints, registerPaymentDomain,
    paymentMoney, payoutMoney,
  };
}

module.exports = { createSquareProvider, intentFrom, refundFrom, disputeFrom, chargeFrom };
