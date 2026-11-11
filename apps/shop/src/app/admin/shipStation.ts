// Ship station (Orders, design A): the numbered queue of orders to ship, the counts in its header,
// and the Open / Completed / All orders tabs of the covers page. Pure; the queues come from fulfillment.queueOf.
import { queueOf, terminal } from "./fulfillment";
import { deskOrders, deskQueue, rowStatus } from "./ordersDesk";
import { orderMatches, type CatalogSearchIndex } from "./orderSearch";
import { isArchived, orderTime } from "./orderListHelpers";
import { shopDayKey } from "../lib/shopDay";

const DAY = 86_400_000;
type Tone = "danger" | "warning" | "info" | "success" | "neutral";

/** The station's queue: every order the shop has to do something with, problems first, then oldest first. */
export const stationQueue = (orders: any[], query = "", showTest = false, catalog?: CatalogSearchIndex | null) =>
  deskOrders(orders, "needs", query, showTest, catalog);

/** The short step a queue row shows: what happens next to this order. */
export function stationStep(o: any): { tone: Tone; text: string } {
  const q = deskQueue(o);
  if (q === "Ready to pack") return { tone: "neutral", text: "Pack" };
  if (q === "Ready to ship") return o?.labelUrl ? { tone: "info", text: "Hand over" } : { tone: "warning", text: "Label" };
  if (q === "Ready for pickup") return { tone: "warning", text: "Pickup" };
  if (q === "Ready for local delivery") return { tone: "warning", text: "Deliver" };
  const s = rowStatus(o);
  // Needs attention: the full reason sits on the order itself; the row only says where to look.
  return { tone: s.tone === "danger" ? "danger" : "warning", text: /address/i.test(s.text) ? "Address" : "Check" };
}

/** Where the books go, for a queue row: "Toronto" in the shop's own country, "Portland, US" abroad. */
export function shipsTo(o: any, homeCountry = "CA"): string {
  const a = o?.customer?.address || {};
  const method = o?.fulfillmentSelection?.method;
  if (method === "pickup") return "Pickup";
  const country = String(a.country || "").trim();
  const home = !country || [homeCountry.toUpperCase(), "CANADA"].includes(country.toUpperCase());
  const city = String(a.city || "").trim();
  return [city, home ? "" : country].filter(Boolean).join(", ");
}

/** The numbers in the station's header. Labels count on the shop's (Toronto) calendar day. */
export function stationStats(orders: any[], now = Date.now(), showTest = false) {
  const queue = stationQueue(orders, "", showTest);
  const today = shopDayKey(now);
  const labelsToday = (orders || []).filter((o) => {
    const at = Date.parse(o?.operations?.labelBoughtAt || "");
    return o && (showTest || o.isTest !== true) && Number.isFinite(at) && shopDayKey(at) === today;
  }).length;
  const oldest = queue.reduce((min, o) => Math.min(min, orderTime(o) || now), now);
  return { toShip: queue.length, labelsToday, oldestDays: queue.length ? Math.max(0, Math.floor((now - oldest) / DAY)) : 0 };
}

/** The station's "Not in this queue" links: pre-orders, payments still to arrive, parcels on the way. */
export function outsideQueue(orders: any[], showTest = false) {
  const live = (orders || []).filter((o) => o && (showTest || o.isTest !== true) && !isArchived(o));
  return {
    preorders: live.filter((o) => queueOf(o) === "Awaiting release").length,
    waitingPayment: live.filter((o) => deskQueue(o) === "Unpaid" && o.paymentStatus === "pending").length,
    inTransit: live.filter((o) => queueOf(o) === "In transit" && !terminal(o)).length,
  };
}

export type GridTab = "open" | "completed" | "all";
export type GridSort = "newest" | "oldest";

const OPEN_QUEUES = ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery", "Awaiting release", "In transit"];

/**
 * The covers page's tabs. Open: anything still on its way to the customer, plus e-Transfer / cash orders waiting
 * on their payment. Completed: delivered, collected or digital orders (never cancelled or refunded ones).
 * All: every order, archived ones too. Abandoned card checkouts appear only under All.
 */
export function gridTabOf(o: any): GridTab | "" {
  const q = deskQueue(o);
  if (OPEN_QUEUES.includes(q) && !isArchived(o)) return "open";
  if (q === "Unpaid" && o?.paymentStatus === "pending" && !isArchived(o)) return "open";
  if (q === "Completed" && !terminal(o)) return "completed";
  return "";
}

export function gridOrders(orders: any[], tab: GridTab, query = "", sort: GridSort = "newest", showTest = false, catalog?: CatalogSearchIndex | null): any[] {
  const list = (orders || []).filter((o) => o && (showTest || o.isTest !== true) && (tab === "all" || gridTabOf(o) === tab) && orderMatches(o, query, catalog));
  return list.sort((a, b) => (sort === "oldest" ? orderTime(a) - orderTime(b) : orderTime(b) - orderTime(a)));
}

export function gridCounts(orders: any[], showTest = false) {
  return {
    open: gridOrders(orders, "open", "", "newest", showTest).length,
    completed: gridOrders(orders, "completed", "", "newest", showTest).length,
    all: gridOrders(orders, "all", "", "newest", showTest).length,
  };
}

/** "1 item" / "3 items", counted in copies. */
export function itemCount(o: any): string {
  const n = (o?.items || []).reduce((sum: number, i: any) => sum + (Number(i?.quantity) || 0), 0);
  return `${n} item${n === 1 ? "" : "s"}`;
}

/** A status line for a StatusBadge, which draws its own glyph: drops the one at the start of the words. */
export const badgeText = (text: string) => String(text || "").replace(/^[⚠●○◷✓✕]\s*/u, "");

/** The payment chip on a card: paid, refunded, or not (yet) paid. */
export function paymentChip(o: any): { tone: Tone; text: string } {
  if (o?.paymentStatus === "refunded") return { tone: "danger", text: "Refunded" };
  if (o?.paymentStatus === "refund_pending") return { tone: "warning", text: "Refunding" };
  if (o?.paymentStatus === "paid") return o?.partiallyRefunded ? { tone: "warning", text: "Paid · part refunded" } : { tone: "success", text: "Paid" };
  if (o?.paymentStatus === "pending") return { tone: "neutral", text: "Payment due" };
  return { tone: "neutral", text: "Not paid" };
}

/** The Orders list's pills (redesign to the mockup, 11 November 2026). */
export type ListFilter = "all" | "unfulfilled" | "unpaid" | "shipped" | "refunded";
export const LIST_FILTERS: Array<{ id: ListFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "unfulfilled", label: "Unfulfilled" }, { id: "unpaid", label: "Unpaid" },
  { id: "shipped", label: "Shipped" }, { id: "refunded", label: "Refunded" },
];
const TO_SEND = ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery", "Awaiting release"];

/**
 * Whether an order belongs under a pill. Unfulfilled: paid and still to send (problems and pre-orders too). Unpaid: an
 * e-Transfer, cash or payment-link order waiting on its money. Shipped: on its way or done. Refunded: all or part of it.
 */
export function inListFilter(o: any, filter: ListFilter): boolean {
  const q = deskQueue(o);
  switch (filter) {
    case "all": return true;
    case "unfulfilled": return o?.paymentStatus === "paid" && TO_SEND.includes(q) && !isArchived(o);
    case "unpaid": return q === "Unpaid" && o?.paymentStatus === "pending" && !isArchived(o);
    case "shipped": return (q === "In transit" || q === "Completed") && o?.paymentStatus !== "refunded";
    case "refunded": return o?.paymentStatus === "refunded" || o?.paymentStatus === "refund_pending" || !!o?.partiallyRefunded;
  }
}

/** The list's Payment pill, in the mockup's words: Paid, Unpaid, Refunded. */
export function listPayment(o: any): { tone: Tone; text: string } {
  if (o?.paymentStatus === "refunded") return { tone: "danger", text: "Refunded" };
  if (o?.paymentStatus === "refund_pending") return { tone: "warning", text: "Refunding" };
  if (o?.paymentStatus === "paid") return o?.partiallyRefunded ? { tone: "warning", text: "Part refunded" } : { tone: "success", text: "Paid" };
  return { tone: "danger", text: "Unpaid" };
}

/** The list's Fulfilment pill, in the mockup's words. A problem still shows as "Needs you", as on Home. */
export function listFulfilment(o: any): { tone: Tone; text: string } {
  const q = deskQueue(o);
  if (q === "Needs attention") return { tone: "danger", text: "Needs you" };
  if (q === "Unpaid") return { tone: "neutral", text: "Draft" };
  if (q === "Awaiting release") return { tone: "info", text: "Pre-order" };
  if (q === "In transit") return { tone: "info", text: "Shipped" };
  if (q === "Completed") return { tone: "neutral", text: "Fulfilled" };
  return { tone: "warning", text: "Unfulfilled" };
}

/** The list under a pill, newest first ("All" is the covers page's All orders). */
export const listOrders = (orders: any[], filter: ListFilter, showTest = false) =>
  gridOrders(orders, "all", "", "newest", showTest).filter((o) => inListFilter(o, filter));
