// Orders desk (split view): which orders show in each view, in what order, and
// which one opens next. Pure; the queues themselves come from fulfillment.queueOf.
import { queueOf, terminal, preorderShipDate, disputeOpen, addressIssues, addressKey, fulfillmentMethod, packingInfo } from "./fulfillment";
import { orderMatches, type CatalogSearchIndex } from "./orderSearch";
import { isArchived, orderTime } from "./orderListHelpers";

export type DeskView = "needs" | "preorders" | "shipped" | "all";

// Work the shop must do, most urgent first.
export const NEEDS_ME_QUEUES = ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery"];
const SHIPPED_QUEUES = ["In transit", "Completed"];

const time = orderTime;

/**
 * Stripe already has the money but the verified webhook hasn't marked the order paid yet.
 * Display only: the order stays unpaid (and unshippable) until the webhook settles it.
 */
export const awaitingWebhook = (o: any) =>
  !!o?.reconciliationPending && !["paid", "refunded", "refund_pending"].includes(o.paymentStatus);

/** The desk's queue: fulfillment.queueOf, except money waiting on the webhook needs a look too. */
export const deskQueue = (o: any) => (awaitingWebhook(o) ? "Needs attention" : queueOf(o));

/** Sent, delivered or fully fulfilled. Cancelled, refunded and refund-pending orders never count. */
const shippedOut = (o: any) => SHIPPED_QUEUES.includes(queueOf(o)) && !terminal(o);

export function deskOrders(orders: any[], view: DeskView, query = "", showTest = false, catalog?: CatalogSearchIndex | null): any[] {
  // Archived orders stay in "All"; they leave the work queues.
  const base = (orders || []).filter((o) => o && (showTest || o.isTest !== true) && (view === "all" || !isArchived(o)) && orderMatches(o, query, catalog));
  if (view === "needs") {
    return base
      .filter((o) => NEEDS_ME_QUEUES.includes(deskQueue(o)))
      // Problems first, then oldest paid first (the order that has waited longest).
      .sort((a, b) => NEEDS_ME_QUEUES.indexOf(deskQueue(a)) - NEEDS_ME_QUEUES.indexOf(deskQueue(b)) || time(a) - time(b));
  }
  // Paid pre-orders waiting for their release date, soonest release first.
  if (view === "preorders") return base.filter((o) => queueOf(o) === "Awaiting release").sort((a, b) => (preorderShipDate(a) || "9999").localeCompare(preorderShipDate(b) || "9999") || time(a) - time(b));
  if (view === "shipped") return base.filter(shippedOut).sort((a, b) => time(b) - time(a));
  return base.slice().sort((a, b) => time(b) - time(a));
}

export function deskCounts(orders: any[], showTest = false) {
  return {
    needs: deskOrders(orders, "needs", "", showTest).length,
    preorders: deskOrders(orders, "preorders", "", showTest).length,
    shipped: deskOrders(orders, "shipped", "", showTest).length,
    all: deskOrders(orders, "all", "", showTest).length,
    waitingPayment: (orders || []).filter((o) => o && (showTest || o.isTest !== true) && deskQueue(o) === "Unpaid" && o.paymentStatus === "pending").length,
  };
}

/** The order to open when nothing is selected (or the selected one just left the list). */
export function nextToOpen(list: any[], currentId?: string | null): string | null {
  if (!list.length) return null;
  if (currentId && list.some((o) => o.id === currentId)) return currentId;
  return list[0].id;
}

/** j / k on the desk: the next (+1) or previous (-1) order in the list; when the open order isn't in the list, j goes to the first row and k to the last. */
export function stepOrder(ids: string[], currentId: string | null, step: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = currentId ? ids.indexOf(currentId) : -1;
  if (i < 0) return step < 0 ? ids[ids.length - 1] : ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, i + step))];
}

/** Puts a freshly loaded order (from the order page) into the list without reloading every order. */
export function mergeOrder(list: any[] | null, order: any): any[] | null {
  if (!list || !order?.id) return list;
  const i = list.findIndex((o) => o?.id === order.id);
  if (i < 0) return [order, ...list];
  const next = list.slice();
  next[i] = { ...order, operations: order.operations ?? list[i].operations };
  return next;
}

/**
 * The newest page of orders (already with their private records) merged into the remembered list: the
 * page replaces its own orders and keeps every older order as it was. A full reload later catches an old
 * order that changed (e.g. a webhook settling it).
 */
export function mergeNewestPage(previous: any[] | null, page: any[]): any[] {
  if (!previous) return page;
  const fresh = new Set(page.map((o) => o?.id));
  return [...page, ...previous.filter((o) => !fresh.has(o?.id))];
}

/** Why an order sits in "Needs attention" before packing, in the shop's words. */
export function attentionReason(o: any): string {
  if (!o?.items?.length) return "⚠ No books on this order";
  if (o.isTest) return "⚠ Test order — not for shipping";
  if (o.operations?.hold) return `⚠ On hold: ${String(o.operations.hold).slice(0, 60)}`;
  if (fulfillmentMethod(o) !== "pickup") {
    if (addressIssues(o).length) return "⚠ Fix the address";
    if (o.operations?.addressReviewed !== addressKey(o)) return "⚠ Confirm the address";
  }
  return "⚠ Check before packing";
}

/** One short status line for a list row: what the shop does next. */
export function rowStatus(o: any): { tone: "danger" | "warning" | "info" | "success" | "neutral"; text: string } {
  const q = queueOf(o);
  if (o.paymentMismatch?.paidAfterCancel && !o.paymentMismatch.resolvedAt && o.paymentStatus !== "paid") return { tone: "danger", text: "⚠ Paid after cancelling — refund" };
  if (o.paymentMismatch && !o.paymentMismatch.resolvedAt && o.paymentStatus !== "paid") return { tone: "danger", text: "⚠ Payment doesn't match" };
  if (o.giftCardConflict && !o.giftCardConflict.resolvedAt && o.paymentStatus !== "paid") return { tone: "danger", text: "⚠ Gift card couldn't cover its part" };
  if (o.customerRequest?.status === "open") return { tone: "danger", text: o.customerRequest.type === "cancel" ? "⚠ Customer asks to cancel" : "⚠ Customer asks to return" };
  if (awaitingWebhook(o)) return { tone: "warning", text: "◷ Paid in Stripe — awaiting webhook" };
  if (Array.isArray(o.duplicatePayments) && o.duplicatePayments.length) return { tone: "danger", text: "⚠ Paid twice — refund the extra in Stripe" };
  if (o.disputeStatus === "needs_response" || o.disputeStatus === "warning_needs_response") return { tone: "danger", text: "⚠ Dispute — respond in Stripe" };
  if (disputeOpen(o)) return { tone: "danger", text: SHIPPED_QUEUES.includes(q) ? "⚠ Dispute open — follow it in Stripe" : "⚠ Dispute open — hold the books" };
  if (o.partiallyRefunded) return { tone: "warning", text: "⚠ Partly refunded" };
  if (q === "Needs attention") return { tone: "danger", text: attentionReason(o) };
  if (q === "Ready to pack") return { tone: "warning", text: "● Pack" };
  if (q === "Ready to ship") return { tone: "warning", text: "● Label & ship" };
  if (q === "Ready for pickup") return { tone: "warning", text: "● Hand over at pickup" };
  if (q === "Ready for local delivery") return { tone: "warning", text: "● Deliver" };
  if (q === "Awaiting release") return { tone: "info", text: preorderShipDate(o) ? `◷ Pre-order · ships ${preorderShipDate(o)}` : "◷ Pre-order · date to be announced" };
  if (q === "In transit") return { tone: "info", text: "● On the way" };
  if (o.paymentStatus === "refunded") return { tone: "danger", text: "Refunded" };
  if (o.paymentStatus === "refund_pending") return { tone: "warning", text: "◷ Refund in progress" };
  if (o.status === "cancelled" || ["cancelled", "refunded"].includes(o.fulfillmentStatus)) return { tone: "neutral", text: "✕ Cancelled" };
  if (q === "Completed") return { tone: "success", text: "✓ Done" };
  if (o.paymentStatus === "pending") return { tone: "neutral", text: "○ Waiting on payment" };
  return { tone: "neutral", text: "○ Not paid" };
}

// What the list row says about the books: the first title, "+ N more" for the rest
// (counted in copies, so "2 × Title" when one book was bought twice).
export function rowBooks(o: any): string {
  const lines = (o?.items || []).filter((i: any) => i && !i.promoGift);
  if (!lines.length) return "";
  const first = lines[0];
  const title = String(first.title || first.name || "Untitled book").trim();
  const qty = Number(first.quantity) || 1;
  const rest = lines.slice(1).reduce((n: number, i: any) => n + (Number(i.quantity) || 1), 0);
  return `${qty > 1 ? `${qty} × ` : ""}${title}${rest ? ` + ${rest} more` : ""}`;
}

// The first line's cover: the book's current catalog photo, else the photo saved on the order.
export function rowCover(o: any, booksById?: Map<string, any> | null): string {
  const first = (o?.items || []).find((i: any) => i && !i.promoGift);
  if (!first) return "";
  const book = booksById?.get(String(first.id || first.bookId || "")) || null;
  if (book) return packingInfo(first, book).photo;
  return [first.photoUrl, first.image, first.coverImage].find((x) => typeof x === "string" && x.trim()) || "";
}

// Money went back to the customer (fully, in progress, or in part): the row shows it loudly.
export function refundState(o: any): "" | "full" | "pending" | "partial" {
  if (o?.paymentStatus === "refunded") return "full";
  if (o?.paymentStatus === "refund_pending") return "pending";
  if (o?.partiallyRefunded) return "partial";
  return "";
}
