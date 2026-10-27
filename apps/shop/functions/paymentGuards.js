// Currencies the shop prices in (exchange rates exist only for these). Any other
// value would fall back to a 1:1 rate and let a shopper pay e.g. 100 INR for a
// CA$100 order, so it is refused before a payment is created.
const CHECKOUT_CURRENCIES = ["cad", "usd", "eur"];

function checkoutCurrencyOf(value) {
  const currency = String(value || "cad").trim().toLowerCase();
  return CHECKOUT_CURRENCIES.includes(currency) ? currency : null;
}

// Compares what a provider reports as paid with the amount and currency this
// order's payment was created for (stored as expectedAmountMinor/Currency).
// Orders created before those fields existed have nothing to compare with.
function paidAmountCheck(order, paidMinor, paidCurrency) {
  const expectedMinor = Number(order && order.expectedAmountMinor);
  const expectedCurrency = String((order && order.expectedCurrency) || "").toLowerCase();
  if (!Number.isFinite(expectedMinor) || !expectedCurrency) return { ok: true, unverified: true };
  const currency = String(paidCurrency || "").toLowerCase();
  const minor = Math.round(Number(paidMinor));
  if (currency !== expectedCurrency || minor !== expectedMinor) {
    return { ok: false, expected: { minor: expectedMinor, currency: expectedCurrency }, paid: { minor, currency } };
  }
  return { ok: true };
}

// "12.34" (PayPal decimal string) -> 1234
const toMinor = value => Math.round(Number(value) * 100);

// The shop's calendar day (Toronto). Discount start/expiry dates are entered as
// plain dates ("2026-10-06" = "Last day the code works"), so they are compared
// with the shop's date, not a UTC timestamp (which ended codes at 8pm the day before).
function shopDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// null when the code may be used today, otherwise "not_started" | "expired".
function discountDateState(discount, now = new Date()) {
  const today = shopDate(now);
  const isDateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const start = discount && discount.startDate;
  if (start) {
    if (isDateOnly(start) ? String(start) > today : Date.parse(start) > now.getTime()) return "not_started";
  }
  const expiry = discount && (discount.expiryDate || discount.expiry);
  if (expiry) {
    if (isDateOnly(expiry) ? String(expiry) < today : Date.parse(expiry) < now.getTime()) return "expired";
  }
  return null;
}

// A plain release date ("2026-10-08") starts on that day in Toronto, not at 00:00 UTC
// (8pm the evening before). Mirrors src/app/features/site/liveBook.ts.
function releaseArrived(scheduleDate, nowISO = new Date().toISOString()) {
  if (!scheduleDate) return true;
  const value = String(scheduleDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value <= shopDate(new Date(nowISO));
  const at = Date.parse(value);
  return Number.isFinite(at) ? at <= Date.parse(nowISO) : value <= nowISO;
}

// Why a catalog line can't be bought right now, or null. Matches what the
// storefront shows: only published books whose release date has arrived, and a
// book sold in editions is bought as one of them (a bare line would be priced
// at the book's own price and skip the editions' stock).
function purchaseProblem(book, variantId, nowISO = new Date().toISOString()) {
  if (!book) return "missing";
  // Books saved before statuses existed have none; the storefront treats them as published.
  if (book.status && book.status !== "published") return "unavailable";
  if (!releaseArrived(book.scheduleDate, nowISO)) return "unavailable";
  // Coming soon (Books › edit › Inventory): shown on the shop, not for sale yet (features/site/comingSoon.ts).
  if (book.comingSoon === true) return "unavailable";
  if (!variantId && Array.isArray(book.variants) && book.variants.length) return "choose_edition";
  return null;
}

// PayPal returns the original order for a repeated request id, so the id carries the amount and currency.
function paypalCreateRequestId(orderId, currency, total) {
  return `create-${orderId}-${String(currency || "").toLowerCase()}-${toMinor(Number(total).toFixed(2))}`;
}

// Stripe's checkout.session.async_payment_failed may arrive after the shopper paid another way.
function lateFailureMayMarkFailed(order, sessionId) {
  if (!order) return false;
  if (order.paymentStatus === "paid" || String(order.paymentStatus || "").startsWith("refund")) return false;
  if (order.stripeCheckoutSessionId && sessionId && order.stripeCheckoutSessionId !== sessionId) return false;
  return true;
}

// Who can give the money back for this order. null = a card/PayPal order whose payment id is missing,
// which must not be "refunded" by just changing its status.
function refundProviderOf(order) {
  if (!order) return null;
  if (typeof order.stripePaymentIntentId === "string" && order.stripePaymentIntentId.startsWith("pi_")) return "stripe";
  if (order.paypalCaptureId) return "paypal";
  const method = String(order.paymentMethod || "").toLowerCase();
  if (/stripe|card|paypal|apple|google/.test(method)) return null;
  return "manual";
}

// The PayPal capture a refund/reversal webhook is about. REFUNDED events carry the refund
// (its "up" link points at the capture); REVERSED/DENIED events carry the capture itself.
function paypalReversalCaptureId(event) {
  const type = event && event.event_type;
  const resource = (event && event.resource) || {};
  if (type === "PAYMENT.CAPTURE.REVERSED" || type === "PAYMENT.CAPTURE.DENIED") return resource.id || null;
  if (type !== "PAYMENT.CAPTURE.REFUNDED") return null;
  const up = (resource.links || []).find(l => l && l.rel === "up" && /\/captures\//.test(String(l.href || "")));
  return up ? String(up.href).split("/captures/")[1].split(/[/?#]/)[0] || null : null;
}

// The code had already reached its usage limit before this order used it.
function discountUsedUp(discount) {
  const limit = Number(discount && discount.usageLimit) || 0;
  return limit > 0 && (Number(discount && discount.usageCount) || 0) >= limit;
}

// Why a new payment must not be opened for this order, or null. A cancelled order is
// closed: taking money for it would revive it behind the shop's back.
function checkoutRefusal(order) {
  if (!order) return "missing";
  if (order.paymentStatus === "paid" || order.status === "completed") return "paid";
  if (order.status === "cancelled" || order.status === "refunded" || String(order.paymentStatus || "").startsWith("refund")) return "closed";
  return null;
}

// Why an admin may not cancel this order as "unpaid", or null. A paid (or refunding) order
// must go through Refund, never a plain cancel that would hide money already taken.
function cancelRefusal(order) {
  if (!order) return "missing";
  if (order.paymentStatus === "paid") return "paid";
  if (String(order.paymentStatus || "").startsWith("refund")) return "refunded";
  if (order.status === "cancelled") return "already_cancelled";
  if (order.status === "completed") return "completed";
  return null;
}

// A payment that arrived after the order was cancelled, or a mismatch, that the owner has dealt with.
/** Stripe already has (or is about to have) this order's money: never cancel it as "unpaid". */
function stripePaymentTaken(intent, session) {
  if (intent && ["succeeded", "processing", "requires_capture"].includes(intent.status)) return true;
  return !!(session && (session.payment_status === "paid" || session.status === "complete"));
}
// The shopper's own earlier checkout attempt already has their money (or Stripe/PayPal says it is
// on its way): a retry on a new order would charge them twice. `intent`/`session` are that attempt's
// Stripe objects when it has them. A cancelled or refunded attempt is the shop's to reconcile.
function previousAttemptPaid(prev, intent, session) {
  if (!prev || prev.status === "cancelled" || prev.status === "refunded") return false;
  if (prev.paymentStatus === "paid") return true;
  if (prev.paymentStatus !== "unpaid") return false;
  if (prev.reconciliationPending || prev.paypalCaptureId) return true;
  return stripePaymentTaken(intent, session);
}
// Do two order-line lists buy the same books/editions in the same quantities? (The free gift line is
// the server's own addition and is ignored.) An earlier paid order only counts as "already paid for
// this" when the new order buys the same things; mirrors src/app/features/site/orderLines.ts.
function sameOrderLines(a, b) {
  const tally = lines => {
    const out = new Map();
    for (const line of Array.isArray(lines) ? lines : []) {
      if (!line || line.promoGift === true || typeof line.id !== "string") continue;
      const key = `${line.id}\u0000${line.variantId || ""}`;
      out.set(key, (out.get(key) || 0) + Math.max(0, Math.floor(Number(line.quantity) || 0)));
    }
    return out;
  };
  const left = tally(a), right = tally(b);
  if (left.size !== right.size) return false;
  for (const [key, quantity] of left) if (right.get(key) !== quantity) return false;
  return true;
}
function mismatchResolved(order) {
  return !!(order && order.paymentMismatch && order.paymentMismatch.resolvedAt);
}

// Why an admin may not mark this order paid by hand, or null. Card and PayPal orders are
// paid only when the provider says so (webhook, verified status check or capture); marking
// them by hand would ship books for money that was never taken.
function manualPaidRefusal(order) {
  if (!order) return "missing";
  if (order.paymentStatus === "paid") return null; // idempotent no-op
  if (order.status === "cancelled" || order.status === "refunded") return "closed";
  const method = String(order.paymentMethod || "").toLowerCase();
  if (order.stripePaymentIntentId || order.stripeCheckoutSessionId || order.paypalOrderId) return "provider";
  if (/stripe|card|paypal|apple|google/.test(method)) return "provider";
  return null;
}

// Stripe idempotency key for a payment attempt. Two simultaneous requests for the same order,
// amount and currency (two tabs, a double click) get the same PaymentIntent back instead of two
// live ones. The previous intent id is part of the key, so a deliberate retry after the earlier
// intent was cancelled opens a fresh one.
function stripeIntentKey(orderId, amountMinor, currency, previousIntentId) {
  return `pi-${orderId}-${String(currency || "").toLowerCase()}-${Math.round(Number(amountMinor))}-${previousIntentId || "first"}`;
}

module.exports = { sameOrderLines, cancelRefusal, mismatchResolved, stripePaymentTaken, previousAttemptPaid, checkoutRefusal, manualPaidRefusal, stripeIntentKey, discountUsedUp, refundProviderOf, paypalReversalCaptureId, paypalCreateRequestId, lateFailureMayMarkFailed, purchaseProblem, CHECKOUT_CURRENCIES, checkoutCurrencyOf, paidAmountCheck, toMinor, shopDate, discountDateState, releaseArrived };

/**
 * PayPal sends one PAYMENT.CAPTURE.REFUNDED per refund, carrying only that refund's amount.
 * Two $10 refunds of a $20 order must add up to a full refund. Prefer PayPal's own running
 * total; otherwise add this refund to what is already recorded (once per refund id).
 */
function paypalRefundedTotalMinor(order, refund) {
  const total = refund?.seller_payable_breakdown?.total_refunded_amount?.value;
  if (total != null && Number.isFinite(Number(total))) return toMinor(total);
  const thisRefund = refund?.amount?.value != null ? toMinor(refund.amount.value) : null;
  if (thisRefund == null) return null;
  const seen = Array.isArray(order?.paypalRefundIds) ? order.paypalRefundIds : [];
  const already = Number(order?.refundedAmountMinor) || 0;
  if (refund?.id && seen.includes(refund.id)) return Math.max(already, thisRefund);
  return already + thisRefund;
}
module.exports.paypalRefundedTotalMinor = paypalRefundedTotalMinor;
