// Square payment pages close when their stock hold ends (code plan 5.1), so two shoppers can't both pay for the last
// copy. A Stripe Checkout Session expires by itself 30–31 minutes after it opens (`expires_at`, checkoutPayment.js);
// a Square payment link has no closing time, so the shop closes it:
//
// - `openedPage` (checkoutPayment.js, when a Square page opens): the order keeps each page it opened in
//   `paymentPages: [{ id, closesAt, closedAt?, closed? }]`, the latest closing time in `paymentPageClosesAt`, and the
//   earliest still-open one in `paymentPageCloseDue` (the sweep's one-field query; null when none is open).
// - `closeDuePages` (the scheduled `paymentPageSweep`, every 5 minutes): every page past its closing time is deleted
//   through the payments module (`stopAttempt`, which for Square calls the platform's `square.checkout.delete`). A page
//   that was paid is left alone (the webhook settles it); one that can't be closed is tried again on the next run, and
//   given up after a day with a note. When the order's last page closes unpaid, its stock hold is released.
// - `paidAfterHold` + `refundLatePayment` (the webhook, before anything settles): a Square payment made after the
//   order's last page should have closed is never marked paid and never touches stock. It is recorded like a Stripe
//   payment that arrives after an order was cancelled (`paymentMismatch`, the receipt ids, an activity line), and then
//   refunded in full straight away, with a plain-words email to the shopper. A refund that fails is retried by the
//   sweep (`lateRefundPending`) and by the webhook's own redelivery; the same idempotency key means it is made once.
//
// Payment authority stays here, on the server: the payment, its time and its amount are what Square says (fetched
// again through the platform, payments/square.js), never what a browser sends.

const { isSquareCheckoutId } = require("./payments/ids");
const { HOLD_MS } = require("./stockHolds");

const GIVE_UP_MS = 24 * 60 * 60 * 1000; // a page that still can't be closed a day later is left with a note
const SWEEP_LIMIT = 100;
const LATE_REASON = "Paid after the checkout closed";

const iso = (ms) => new Date(ms).toISOString();
const timeOf = (value) => {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
};
const earliest = (pages) => pages.reduce((min, p) => (min === null || p.closesAt < min ? p.closesAt : min), null);
const latest = (pages) => pages.reduce((max, p) => (max === null || p.closesAt > max ? p.closesAt : max), null);
const paymentIdOf = (session) => (typeof session?.payment_intent === "string" ? session.payment_intent : session?.payment_intent?.id || null);
// A payment id as a map key (Square's ids and our prefix are letters, digits, "_" and "-").
const keyOf = (paymentId) => String(paymentId || "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 200);
const moneyText = (minor, currency) => `${(Number(minor || 0) / 100).toFixed(2)} ${String(currency || "").toUpperCase()}`.trim();

/**
 * The order fields for a Square payment page that just opened, or null for any other checkout (Stripe's sessions
 * expire by themselves). It closes when a Stripe session made at the same moment would expire (`expires_at`).
 */
function openedPage(order, session, nowMs = Date.now()) {
  if (!isSquareCheckoutId(session?.id)) return null;
  const closesMs = Number.isFinite(session.expires_at) ? session.expires_at * 1000 : nowMs + HOLD_MS;
  const pages = [...(Array.isArray(order?.paymentPages) ? order.paymentPages : []).filter((p) => p && p.id !== session.id), { id: session.id, closesAt: iso(closesMs) }];
  return { paymentPages: pages, paymentPageClosesAt: latest(pages), paymentPageCloseDue: earliest(pages.filter((p) => !p.closedAt)) };
}

/**
 * Was this paid checkout made after the order's last Square page should have closed? Only Square orders have pages,
 * and only Square's own payment time counts: a payment made in time whose event arrives late is not late.
 */
function paidAfterHold(order, session) {
  if (!order || order.paymentStatus === "paid" || order.status === "cancelled") return false;
  const closes = timeOf(order.paymentPageClosesAt);
  const paid = timeOf(session?.paid_at);
  return closes !== null && paid !== null && paid > closes;
}

/**
 * @param {object} deps
 * @param {object} deps.db Firestore
 * @param {object} deps.payments the payments module (functions/payments)
 * @param {(db: object, orderId: string, items: object[]) => Promise<void>} deps.releaseStock stockHolds.releaseStock
 * @param {(orderId: string, order: object, refund: { amountMinor: number, currency: string, paymentIntentId: string }) => Promise<void>} [deps.sendLateRefundEmail]
 *   tells the shopper their late payment was refunded (index.js: the press's own "Order refunded" email, sent once)
 * @param {() => number} [deps.now]
 */
function createPaymentPages({ db, payments, releaseStock, sendLateRefundEmail = async () => {}, now = Date.now }) {
  const orders = () => db.collection("orders");

  async function accountFor(order) {
    return payments.clientForMode(order.stripeMode === "test" ? "test" : "live", order.stripeAccountId || null);
  }

  // "closed", "paid" (someone paid on it: the webhook settles that), "gone" (already closed or unknown) or "failed".
  async function closePage(account, page) {
    try {
      const { session = null } = await payments.readAttempt(account, { sessionId: page.id });
      if (!session || session.status !== "open") return session?.status === "complete" ? "paid" : "gone";
      const stopped = await payments.stopAttempt(account, { session });
      return stopped.includes("checkout") ? "closed" : "failed";
    } catch (err) {
      if (err?.statusCode === 404 || err?.code === "resource_missing") return "gone";
      console.warn(`paymentPageSweep: could not close ${page.id}:`, err?.message || err);
      return "failed";
    }
  }

  /** Closes one order's pages that are past their closing time; returns how many it closed. */
  async function closeOrderPages(orderId, order, nowMs) {
    const due = (order.paymentPages || []).filter((p) => p && !p.closedAt && (timeOf(p.closesAt) ?? 0) <= nowMs);
    const results = {};
    if (due.length) {
      const account = await accountFor(order);
      for (const page of due) results[page.id] = await closePage(account, page);
    }
    const ref = orders().doc(orderId);
    let release = null;
    await db.runTransaction(async (tx) => {
      release = null;
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data();
      const at = iso(nowMs);
      const notes = [];
      const pages = (current.paymentPages || []).map((p) => {
        const result = results[p?.id];
        if (!p || p.closedAt || !result) return p;
        if (result !== "failed") return { ...p, closedAt: at, closed: result };
        if ((timeOf(p.closesAt) ?? 0) + GIVE_UP_MS > nowMs) return p;
        notes.push("The Square payment page for this order couldn't be closed after the hold on the books ended. If the shopper still pays on it, the payment is refunded in full automatically.");
        return { ...p, closedAt: at, closed: "gave_up" };
      });
      const open = pages.filter((p) => p && !p.closedAt);
      const unpaid = current.paymentStatus !== "paid" && current.status !== "cancelled";
      if (unpaid && due.some((p) => results[p.id] === "closed")) {
        notes.push("The Square payment page closed because the 30-minute hold on the books ended, so nobody else is kept waiting for them. The shopper can start checkout again.");
      }
      tx.update(ref, {
        paymentPages: pages,
        paymentPageCloseDue: earliest(open),
        updatedAt: at,
        ...(notes.length ? { activity: [...(current.activity || []), ...notes.map((message) => ({ type: "event", message, createdAt: at }))] } : {}),
      });
      // A page someone paid on keeps its hold: the payment's event takes the stock when it arrives.
      const paidOn = pages.some((p) => p?.closed === "paid");
      if (!open.length && unpaid && !paidOn) release = current.items || [];
    });
    // Holds lapse by themselves; releasing them now just frees the books for the next shopper straight away.
    if (release) await releaseStock(db, orderId, release);
    return Object.values(results).filter((r) => r === "closed").length;
  }

  /** The sweep: closes every page past its closing time, and retries late refunds that failed. */
  async function closeDuePages() {
    const nowMs = now();
    let closed = 0, checked = 0, refunded = 0;
    const due = await orders().where("paymentPageCloseDue", "<=", iso(nowMs)).limit(SWEEP_LIMIT).get();
    for (const doc of due.docs) {
      checked += 1;
      try { closed += await closeOrderPages(doc.id, doc.data(), nowMs); } catch (err) { console.warn(`paymentPageSweep: order ${doc.id}:`, err?.message || err); }
    }
    const pending = await orders().where("lateRefundPending", "==", true).limit(SWEEP_LIMIT).get();
    for (const doc of pending.docs) {
      for (const late of Object.values(doc.data().latePayments || {})) {
        if (!late || late.refundId) continue;
        try {
          await refundLatePayment(doc.id, { payment_intent: late.paymentIntentId, livemode: late.mode !== "test", amount_total: late.amountMinor, currency: late.currency, paid_at: late.paidAt });
          refunded += 1;
        } catch (err) { console.warn(`paymentPageSweep: late refund ${doc.id}:`, err?.message || err); }
      }
    }
    return { checked, closed, refunded };
  }

  /**
   * A Square payment made after the hold ended: recorded, refunded in full, and the shopper told. Never marks the order
   * paid and never touches stock, discounts or gift cards. Safe to run again (the refund's idempotency key and the
   * email claim make each happen once). Throws when the refund can't be made, so the webhook answers 500 and the event
   * comes again; the sweep retries too.
   */
  async function refundLatePayment(orderId, session) {
    const paymentIntentId = paymentIdOf(session);
    if (!paymentIntentId) throw new Error("A late payment without a payment id can't be refunded.");
    const key = keyOf(paymentIntentId);
    const mode = session.livemode === false ? "test" : "live";
    const ref = orders().doc(orderId);
    let done = false;
    await db.runTransaction(async (tx) => {
      done = false;
      const snap = await tx.get(ref);
      if (!snap.exists) { done = true; return; }
      const order = snap.data();
      const known = order.latePayments?.[key];
      if (known?.refundId) { done = true; return; }
      if (known) return;
      const at = iso(now());
      // Like a Stripe payment that arrives after an order was cancelled: the payment's ids go on the order (so the
      // refund's own event finds it and clears the problem), unless the order already names a payment.
      tx.update(ref, {
        ...(order.stripePaymentIntentId ? {} : {
          stripePaymentIntentId: paymentIntentId,
          stripeMode: mode,
          stripeAmountTotal: session.amount_total ?? null,
          stripeCurrency: session.currency || null,
        }),
        latePayments: { ...(order.latePayments || {}), [key]: {
          provider: "square", paymentIntentId, mode, amountMinor: session.amount_total ?? null, currency: session.currency || null,
          paidAt: session.paid_at || null, closedAt: order.paymentPageClosesAt || null, at,
        } },
        lateRefundPending: true,
        ...(order.paymentMismatch ? {} : { paymentMismatch: { paidAfterHold: true, provider: "square", paymentIntentId, at } }),
        updatedAt: at,
        activity: [...(order.activity || []), { type: "event", createdAt: at,
          message: `A Square payment of ${moneyText(session.amount_total, session.currency)} arrived after the hold on the books had ended. The order was not marked paid and no stock was taken; the payment is being refunded in full.` }],
      });
    });
    if (done) return { refunded: false, already: true };

    let made;
    try {
      made = await payments.refund({
        mode, paymentIntentId, amountMinor: null,
        metadata: { order_id: orderId, reason: LATE_REASON },
        idempotencyKey: `late-${orderId}-${paymentIntentId}`,
      });
    } catch (err) {
      await ref.update({ [`latePayments.${key}.refundError`]: String(err?.message || err).slice(0, 300), updatedAt: iso(now()) }).catch(() => {});
      throw err;
    }

    let order = null;
    await db.runTransaction(async (tx) => {
      order = null;
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data();
      const at = iso(now());
      const latePayments = { ...(current.latePayments || {}) };
      latePayments[key] = { ...(latePayments[key] || {}), refundId: made.refundId, refundStatus: made.status, refundedAt: at, refundError: null };
      const stillPending = Object.values(latePayments).some((l) => l && !l.refundId);
      tx.update(ref, {
        latePayments,
        lateRefundPending: stillPending,
        updatedAt: at,
        activity: [...(current.activity || []), { type: "event", createdAt: at,
          message: `The late Square payment was refunded in full automatically (${moneyText(made.amountMinor, made.currency)}).` }],
      });
      order = current;
    });
    if (order) {
      await sendLateRefundEmail(orderId, order, { amountMinor: made.amountMinor, currency: made.currency, paymentIntentId })
        .catch((err) => console.warn(`Order ${orderId}: the late-payment refund email failed:`, err?.message || err));
    }
    return { refunded: true, refundId: made.refundId };
  }

  return { closeDuePages, closeOrderPages, refundLatePayment };
}

module.exports = { createPaymentPages, openedPage, paidAfterHold, LATE_REASON, GIVE_UP_MS };
