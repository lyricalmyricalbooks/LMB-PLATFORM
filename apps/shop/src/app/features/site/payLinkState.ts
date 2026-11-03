// The customer's side of a payment link (code plan 21.3): an order the shop made for them, which they pay from their
// order page. The server keeps the agreed prices (functions/paymentLinks.js); this decides what the page offers.

/** "pay" while the link can take a payment, "expired" once it has closed unpaid, else null (not a link, paid, cancelled). */
export function payLinkState(order: any, now = Date.now()): "pay" | "expired" | null {
  if (!order?.paymentLink || order.paymentStatus !== "unpaid") return null;
  if (String(order.status || "").toLowerCase() === "cancelled") return null;
  return Date.parse(order.paymentLink.expiresAt) > now ? "pay" : "expired";
}

/** The day the link closes, written for the customer (e.g. "14 November 2026"), or "". */
export function payLinkUntil(order: any, locale?: string): string {
  const at = Date.parse(order?.paymentLink?.expiresAt || "");
  return Number.isFinite(at) ? new Date(at).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "";
}
