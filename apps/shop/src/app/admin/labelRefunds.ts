// Voiding (refunding) a Shippo label from Order detail, and following the refund afterwards.
// Mirrors functions/labelVoid.js (labelVoid.parity.test.ts); the server is authoritative.

const HANDED_OVER = ["shipped", "out_for_delivery", "delivered", "picked_up", "collected"];

/** The parcel has left the shop, so its label is in use and is never voided from here. */
export function labelHandedOver(order: any = {}): boolean {
  return !!order.shippedAt || HANDED_OVER.includes(String(order.fulfillmentStatus || "").toLowerCase()) || order.status === "completed";
}

/** A bought label that can still be voided for a refund (wrong label, or the order was cancelled/refunded first). */
export function labelVoidable(order: any): boolean {
  return !!order?.labelUrl && !labelHandedOver(order) && order?.operations?.labelPurchasePending !== true;
}

export type LabelRefund = {
  transactionId?: string | null;
  refundId?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  state: "pending" | "refunded" | "rejected";
  shippoStatus?: string | null;
  requestedAt?: string;
  settledAt?: string;
  checkedAt?: string;
};

export const labelRefunds = (order: any): LabelRefund[] =>
  (Array.isArray(order?.operations?.labelRefunds) ? order.operations.labelRefunds : []).filter((e: any) => e && e.state);

const DAY = 24 * 60 * 60 * 1000;
export const STALE_REFUND_DAYS = 30;

/** Plain words for one refund row on the order page. */
export function refundWords(entry: LabelRefund, now = Date.now()): string {
  const label = `Label ${entry.trackingNumber || ""}`.trim();
  if (entry.state === "refunded") return `${label}: refunded by Shippo — the credit shows on your next Shippo invoice.`;
  if (entry.state === "rejected") return `${label}: Shippo rejected the refund (the carrier scanned or used the label). Contact Shippo support if the parcel never went out.`;
  const days = Math.floor((now - (Date.parse(entry.requestedAt || "") || now)) / DAY);
  if (days >= STALE_REFUND_DAYS) return `${label}: refund still pending after ${days} days. Check it in Shippo or contact Shippo support.`;
  return `${label}: refund requested — Shippo usually takes up to 14 business days while the carrier confirms it wasn't used. This updates by itself.`;
}

/** Orders whose label refund needs the owner: rejected in the last 30 days, or pending for 30+ days. */
export function labelRefundProblems(orders: any[], now = Date.now()) {
  const rejected: any[] = [];
  const stale: any[] = [];
  for (const o of orders || []) {
    const rows = labelRefunds(o);
    if (rows.some(e => e.state === "rejected" && now - (Date.parse(e.settledAt || e.checkedAt || "") || 0) <= STALE_REFUND_DAYS * DAY)) rejected.push(o);
    else if (rows.some(e => e.state === "pending" && now - (Date.parse(e.requestedAt || "") || now) >= STALE_REFUND_DAYS * DAY)) stale.push(o);
  }
  return { rejected, stale };
}
