// Small display and safety rules shared by the Orders desk and the Orders table view. Pure, tested.

const SYMBOL: Record<string, string> = { CAD: "CA$", USD: "US$", EUR: "€" };

/** The order total as the order page shows it (CA$), plus what the customer paid when that was another currency. */
export function orderMoney(o: any): { text: string; paid: string } {
  const text = `CA$${(Number(o?.total) || 0).toFixed(2)}`;
  const currency = String(o?.expectedCurrency || "").toUpperCase();
  const minor = Number(o?.expectedAmountMinor);
  if (!currency || currency === "CAD" || o?.expectedAmountMinor == null || !Number.isFinite(minor)) return { text, paid: "" };
  return { text, paid: `${SYMBOL[currency] || `${currency} `}${(minor / 100).toFixed(2)}` };
}

/** The date a list sorts and filters by: when it was paid, else when it was placed. */
export const orderDate = (o: any): string => o?.paidAt || o?.createdAt || "";
export const orderTime = (o: any): number => Date.parse(orderDate(o)) || 0;

/** How long an order has waited, for a phone row: "now", "40m", "5h", "3d". */
export function waitedText(iso?: string, now = Date.now()): string {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const minutes = Math.max(0, Math.floor((now - t) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** "Oct 3" this year, "Oct 3, 2025" for any other year. */
export function listDate(iso?: string, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

const KEPT_PAYMENTS = ["paid", "refunded", "refund_pending", "partially_refunded"];
const LEFT_THE_SHOP = ["shipped", "out_for_delivery", "delivered", "collected"];

/**
 * Why an order can't be deleted from the Orders table ("" = it can). Only unpaid,
 * cancelled-before-payment and test orders may go: anything paid, refunded, shipped,
 * or with money waiting on it stays for the shop's records. Mirrored by the
 * orders delete rule in firestore.rules.
 */
export function deleteRefusal(o: any): string {
  if (!o) return "";
  if (o.isTest === true) return "";
  if (KEPT_PAYMENTS.includes(o.paymentStatus) || o.paidAt) return "it was paid — refund or cancel it instead";
  if (o.partiallyRefunded || Number(o.refundedAmountMinor) > 0) return "it has a refund recorded";
  if (LEFT_THE_SHOP.includes(o.fulfillmentStatus) || o.shippedAt) return "it was shipped or handed over";
  if (o.reconciliationPending || o.paymentMismatch || o.giftCardConflict || (Array.isArray(o.duplicatePayments) && o.duplicatePayments.length)) {
    return "a payment arrived for it — sort that out first";
  }
  // A card or PayPal payment was started and not cancelled: the customer may still complete it, and a
  // payment for a deleted order would reach no order at all. Cancel the order first (that stops the payment).
  if ((o.stripePaymentIntentId || o.stripeCheckoutSessionId || o.paypalOrderId) && o.status !== "cancelled") {
    return "a card or PayPal payment may still be in progress — cancel the order first";
  }
  return "";
}

/** Archived orders are kept but leave the work queues (Orders › All orders still lists them). */
export const isArchived = (o: any): boolean => !!o?.archivedAt;

/** Splits a selection into orders that may be deleted and those kept, with the reason. */
export function splitDeletable(orders: any[]): { allowed: any[]; refused: Array<{ order: any; reason: string }> } {
  const allowed: any[] = [];
  const refused: Array<{ order: any; reason: string }> = [];
  for (const o of orders) {
    const reason = deleteRefusal(o);
    if (reason) refused.push({ order: o, reason });
    else allowed.push(o);
  }
  return { allowed, refused };
}

/** Tracking for the table's batch "Mark shipped": the order's own Shippo label, never a guessed carrier. */
export function batchDispatchFields(o: any): { trackingCarrier: string; trackingNumber: string; trackingUrl: string } | { problem: string } {
  if (!o?.labelUrl || !String(o?.trackingNumber || "").trim()) return { problem: "No Shippo label — open the order to enter tracking" };
  const trackingCarrier = String(o.trackingCarrier || o.labelCarrier || "").trim();
  if (!trackingCarrier) return { problem: "The label has no carrier saved — open the order to enter the carrier" };
  return { trackingCarrier, trackingNumber: String(o.trackingNumber).trim(), trackingUrl: o.trackingUrl || "" };
}
