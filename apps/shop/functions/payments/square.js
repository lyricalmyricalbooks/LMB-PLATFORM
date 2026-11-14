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

const crypto = require("crypto");
const { modesToTry } = require("../stripeRecovery");
const { isSquarePaymentId, isSquareCheckoutId, squarePaymentId, squareCheckoutId, squareIdOf } = require("./ids");

const PLATFORM_KEY = "platform";
const SQUARE_ID = /^[A-Za-z0-9_-]{1,192}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;

// A mode this shop has no Square connection in (a Sandbox shop asked for live, or the reverse), or an id Square
// doesn't know there: nothing to find in that mode.
const elsewhere = (err) => ["test_only", "not_connected"].includes(err?.code) || err?.statusCode === 404;

const lower = (value) => String(value || "").toLowerCase();

// A fair helper's QR payment (standaloneCheckout) is a Square payment link with no shop order: its reference starts
// with this, so the webhook and the sweeps never take it for an order. Shop order ids never start with it.
const FAIR_REFERENCE = "fair-";
const isFairReference = (reference) => typeof reference === "string" && reference.startsWith(FAIR_REFERENCE);
// Where the shop keeps who opened each fair payment link (server only: firestore.rules lets no browser in).
const FAIR_PAYMENTS = "fairCardPayments";

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
      if (payment.status === "COMPLETED" && payment.referenceId && !isFairReference(payment.referenceId)) {
        const session = {
          id: await savedCheckoutOf(payment.referenceId),
          client_reference_id: payment.referenceId,
          status: "complete",
          payment_status: "paid",
          payment_intent: squarePaymentId(payment.id),
          livemode,
          amount_total: payment.totalMinor,
          currency: lower(payment.currency),
          // When the shopper paid (Square's own time), so a payment made after the stock hold ended is told apart
          // from one whose event was only slow to arrive (paymentPages.js).
          paid_at: payment.createdAt || null,
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
    let accountCurrency;
    return {
      // Square takes payments only in its location's currency (the service refuses any other), so checkout charges in
      // that one. Read once per checkout; when it can't be read the shopper's currency stays and the service decides.
      async chargeCurrency(wanted) {
        if (accountCurrency === undefined) {
          try { accountCurrency = lower((await platform.call("account.status", undefined))?.currency) || null; } catch { accountCurrency = null; }
        }
        return accountCurrency || wanted;
      },
      // Square's page takes the rest after the shop's gift cards (code plan 5.3): the checkout passes their share as
      // `gift_card_minor`, which the page shows as a "Gift card" discount. Stripe's hosted page has no such line.
      giftCardsOnHostedPage: true,
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
            ...(Number.isInteger(params.gift_card_minor) && params.gift_card_minor > 0 ? { giftCardMinor: params.gift_card_minor } : {}),
            redirectUrl,
            note: `Order ${params.client_reference_id}`,
          },
          idempotencyKey,
        });
        // A Square payment link has no closing time of its own: the shop closes the page itself when the stock hold
        // ends (paymentPages.js), when a Stripe Checkout Session with the same `expires_at` would expire.
        return { id: squareCheckoutId(made.id), object: "checkout.session", url: made.url, client_secret: null, status: "open", expires_at: Number.isFinite(params.expires_at) ? params.expires_at : null };
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
      // What Square said about the payment, in the words orderReview.js reads (Stripe's): Square's HIGH is its highest
      // rating, MODERATE the elevated one; a rejected security code or postal code check is a fail.
      const r = payment.risk;
      const risk = r ? {
        level: r.level === "HIGH" ? "highest" : r.level === "MODERATE" ? "elevated" : r.level ? "normal" : null,
        cvcCheck: r.cvvStatus === "CVV_REJECTED" ? "fail" : r.cvvStatus ? "pass" : null,
        postalCheck: r.avsStatus === "AVS_REJECTED" ? "fail" : r.avsStatus ? "pass" : null,
        cardCountry: r.cardCountry || null,
      } : null;
      return { parts, risk };
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

  // ── A payment with no shop order: a fair helper's QR code (fairHelperPay.js) ────────────────────────────────────
  // The caller hands over Stripe Checkout Session parameters (fairCheckoutParams); this answers them as a Square
  // payment link and keeps the sale and the helper beside it, since a payment link holds no metadata. Square's links
  // don't close by themselves, so one read after its half hour closes it, as Stripe's session would have expired.
  const keptMetadata = (fair) => (fair.booking ? { booking: fair.booking } : fair.invoice ? { invoice_pay: fair.invoice } : { fair_sale: fair.sale, fair_helper: fair.helper });
  async function standaloneCheckout(mode) {
    const linkMode = mode === "test" ? "test" : "live";
    const kept = (id) => db.collection(FAIR_PAYMENTS).doc(id);
    async function close(id) {
      if (!isSquareCheckoutId(id)) return null;
      await call("square.checkout.delete", linkMode, { id: squareIdOf(id) });
      // Square deletes the link: later reads answer from this record, not from Square (which no longer has it).
      const snap = await kept(id).get();
      if (snap.exists && snap.data().open !== false) await kept(id).set({ ...snap.data(), open: false, closedAt: new Date().toISOString() });
      return { id, status: "expired" };
    }
    // Closes a link past its time, then reads it again: a payment that landed just before the close counts as paid.
    async function expire(id, fair) {
      const before = await sessionFrom(await call("square.checkout.retrieve", linkMode, { id: squareIdOf(id) }), linkMode);
      if (before.status !== "open") {
        await kept(id).set({ ...fair, open: false });
        return before;
      }
      await close(id).catch(() => {});
      const after = await sessionFrom(await call("square.checkout.retrieve", linkMode, { id: squareIdOf(id) }), linkMode).catch(() => null);
      await kept(id).set({ ...fair, open: false, closedAt: new Date().toISOString(), paidAtClose: after?.payment_status === "paid" });
      if (after?.payment_status === "paid") return after;
      return { ...before, status: "expired" };
    }
    return Object.freeze({
      async open(params, idempotencyKey) {
        const item = params?.line_items?.[0]?.price_data;
        const metadata = params?.metadata || {};
        // A fair sale names its sale and helper; an invoice pay link (invoicePay.js) names its link; a booking (bookings.js) its booking.
        const invoice = metadata.invoice_pay ? String(metadata.invoice_pay) : "";
        const booking = metadata.booking ? String(metadata.booking) : "";
        if (!item || !Number.isInteger(item.unit_amount) || (!invoice && !booking && (!metadata.fair_sale || !metadata.fair_helper))) throw new Error("A payment with no order needs one priced line and what it pays for.");
        // Square takes payments only in its location's currency: say so plainly rather than "couldn't be reached".
        let accountCurrency = null;
        try { accountCurrency = lower((await platform.call("account.status", undefined))?.currency) || null; } catch { accountCurrency = null; }
        if (accountCurrency && lower(item.currency) !== accountCurrency) {
          throw Object.assign(new Error(`Square takes card payments in ${accountCurrency.toUpperCase()} only. Use the card reader or cash for this sale.`), { code: "currency_mismatch", statusCode: 409 });
        }
        // A link closed earlier (cancelled, or past its half hour) is gone at Square, but the same key would hand its
        // address back: a sale tapped again after that gets a fresh link (still one per closing, so resent taps agree).
        let key = String(idempotencyKey);
        for (let tries = 0; ; tries += 1) {
          const opened = await openLink(key);
          const before = await kept(opened.id).get();
          const dead = before.exists && before.data().open === false && before.data().closedAt && !before.data().paidAtClose;
          if (!dead) return opened.finish();
          if (tries >= 4) throw new Error("This sale's card links were all closed. Start the sale again.");
          key = `${idempotencyKey}-${Date.parse(before.data().closedAt)}`;
        }
        async function openLink(key) {
          // The same sale and amount (the caller's key) always give the same reference, and so the same link.
          const referenceId = `${FAIR_REFERENCE}${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
          const made = await call("square.checkout.create", linkMode, {
            params: {
              referenceId,
              currency: item.currency,
              lineItems: [{ name: String(item.product_data?.name || "Fair sale").slice(0, 512), quantity: 1, unitAmountMinor: item.unit_amount }],
              redirectUrl: String(params.success_url || ""),
              note: String(params.payment_intent_data?.description || item.product_data?.name || "Fair sale").slice(0, 500),
            },
            idempotencyKey: key,
          });
          const id = squareCheckoutId(made.id);
          return {
            id,
            async finish() {
              await kept(id).set({
                ...(booking ? { booking } : invoice ? { invoice } : { sale: String(metadata.fair_sale), helper: String(metadata.fair_helper) }), referenceId, mode: linkMode, open: true,
                expiresAt: Number.isFinite(params.expires_at) ? params.expires_at : null, createdAt: new Date().toISOString(),
              });
              return { id, object: "checkout.session", url: made.url, status: "open", payment_status: "unpaid", expires_at: Number.isFinite(params.expires_at) ? params.expires_at : null, metadata: { ...metadata } };
            },
          };
        }
      },
      async read(id) {
        if (!isSquareCheckoutId(id)) return null;
        const snap = await kept(id).get();
        const fair = snap.exists ? snap.data() : null;
        if (!fair || fair.mode !== linkMode) return null;
        // Closed here, unpaid: Square has deleted the link, so answer without asking it.
        if (fair.open === false && fair.closedAt && !fair.paidAtClose) {
          return { id, object: "checkout.session", status: "expired", payment_status: "unpaid", metadata: keptMetadata(fair) };
        }
        const checkout = await call("square.checkout.retrieve", linkMode, { id: squareIdOf(id) });
        if (checkout.referenceId !== fair.referenceId) return null;
        let session = await sessionFrom(checkout, linkMode);
        if (session.status === "open" && Number.isFinite(fair.expiresAt) && fair.expiresAt * 1000 <= Date.now()) session = await expire(id, fair);
        return { ...session, metadata: keptMetadata(fair) };
      },
      close,
      /**
       * The scheduled sweep (index.js paymentPageSweep): every link of this mode still open past its half hour is
       * closed, so a QR code the helper's phone stopped watching (no signal, page closed) can't be paid later. A link
       * found paid is left as it is.
       */
      async closeDue(nowMs = Date.now()) {
        const snap = await db.collection(FAIR_PAYMENTS).where("open", "==", true).limit(200).get();
        let closed = 0;
        for (const doc of snap.docs) {
          const fair = doc.data();
          if (fair.mode !== linkMode || !Number.isFinite(fair.expiresAt) || fair.expiresAt * 1000 > nowMs) continue;
          try {
            const session = await expire(doc.id, fair);
            if (session.status === "expired") closed += 1;
          } catch (err) {
            console.warn(`Fair payment link ${doc.id} couldn't be closed yet: ${err?.message || err}`);
          }
        }
        return { closed };
      },
    });
  }

  return {
    id: "square",
    testMode: shopTestMode, readKeys, clientForMode, findOrderPayment, readAttempt, stopAttempt, checkReversal, refund,
    webhookClient, verifyWebhookEvent, forCheckout, deployedLiveKey, checkKey, webhookEndpoints, registerPaymentDomain,
    paymentMoney, payoutMoney, standaloneCheckout,
  };
}

module.exports = { createSquareProvider, intentFrom, refundFrom, disputeFrom, chargeFrom, isFairReference, FAIR_PAYMENTS };
