import { queueOf } from "../fulfillment";
import { preorderClockStart } from "../../features/site/preorder";
import { isSoldOut, trackedStockRows, type StockRow } from "../stockRules";
// Pure publisher-insight calculations for the admin Overview.
// Only recorded data is used: paid, non-test orders, the book catalog, reviews
// and newsletter signups. Nothing here is estimated or simulated.

import { SHOP_TZ, addDays, orderDay, shopDayKey } from "../../lib/shopDay";

const DAY = 86_400_000;
export const REORDER_COVER_DAYS = 30;
export const DORMANT_DAYS = 90;
const DIGITAL_FORMATS = ["E-book (PDF)", "E-book (EPUB)", "Audiobook"];

import type { BookRecord, OrderRecord } from "../../../shared/records";

export type Order = OrderRecord;
export type Book = BookRecord;

export const isRealPaidOrder = (o: Order) => o?.isTest !== true && o?.paymentStatus === "paid";
const ts = (v: any) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };

/** UTC calendar day ("2026-09-29") — the same key the daily `analytics/<date>` docs use. */
export const dateKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export { SHOP_TZ, shopDayKey, addDays, orderDay };
/** Normalises a stored date ("2026-09-29" or an ISO string) to its day key; "" when unreadable. */
export const dayOf = (v: unknown) => { const s = String(v ?? ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; };

/**
 * The calendar days a period covers, counted back from today inclusive, plus the equally long block before it.
 * Orders and traffic both use these keys so "30 days" and "today" mean the same thing everywhere.
 */
export function periodKeys(days: number, now = Date.now()) {
  const endKey = shopDayKey(now);
  return { endKey, startKey: addDays(endKey, -(days - 1)), prevStartKey: addDays(endKey, -(2 * days - 1)) };
}

/** The same window counted on UTC days, which is how the daily traffic docs are keyed. */
export function trafficPeriodKeys(days: number, now = Date.now()) {
  return {
    endKey: dateKey(now),
    startKey: dateKey(now - (days - 1) * DAY),
    prevStartKey: dateKey(now - (2 * days - 1) * DAY),
  };
}

/** Paid orders in the period's calendar days and in the equally long block before it. */
export function splitPeriods(orders: Order[], days: number, now = Date.now()) {
  const paid = orders.filter(isRealPaidOrder);
  const { startKey, prevStartKey, endKey } = periodKeys(days, now);
  const inRange = (o: Order, from: string, to: string) => { const k = orderDay(o.createdAt); return k !== "" && k >= from && k <= to; };
  return {
    paid,
    current: paid.filter(o => inRange(o, startKey, endKey)),
    previous: paid.filter(o => inRange(o, prevStartKey, addDays(startKey, -1))),
    start: Date.parse(`${startKey}T00:00:00Z`),
    startKey, prevStartKey, endKey,
  };
}

/** Paid orders inside any range of Toronto days (overviewRange.resolveRange) and inside its comparison window. */
export function splitRange(orders: Order[], range: { startKey: string; endKey: string; prevStartKey: string; prevEndKey: string }) {
  const paid = orders.filter(isRealPaidOrder);
  const inRange = (o: Order, from: string, to: string) => { const k = orderDay(o.createdAt); return k !== "" && k >= from && k <= to; };
  return {
    paid,
    current: paid.filter(o => inRange(o, range.startKey, range.endKey)),
    previous: paid.filter(o => inRange(o, range.prevStartKey, range.prevEndKey)),
    start: Date.parse(`${range.startKey}T00:00:00Z`),
    startKey: range.startKey, prevStartKey: range.prevStartKey, endKey: range.endKey,
  };
}

/**
 * The part of a paid order's total that was refunded (CAD). Refunds are recorded in the charged currency
 * (`refundedAmountMinor`), so the share is taken against `expectedAmountMinor` and applied to the CAD `total`.
 */
export function refundedAmount(o: Order): number {
  const minor = Number(o?.refundedAmountMinor) || 0;
  const total = Number(o?.total) || 0;
  if (minor <= 0 || total <= 0) return 0;
  const expected = Number(o?.expectedAmountMinor) || 0;
  if (expected > 0) return Math.min(total, (total * minor) / expected);
  const cur = String(o?.checkoutCurrency || o?.expectedCurrency || "CAD").toUpperCase();
  return cur === "CAD" ? Math.min(total, minor / 100) : 0;
}

export interface PeriodTotals {
  orders: number; revenue: number; refunded: number; net: number; units: number; aov: number;
  shipping: number; tax: number; subtotal: number; discounts: number; discountRate: number;
  /** Part of the orders' value paid with gift cards (not in `revenue`, which is the card/PayPal part). */
  giftCards: number;
  /** Gift cards sold in the period: money taken in but not earned until the card is spent. */
  giftCardsSold: number;
}

/** `revenue` is what customers paid; `net` takes partial refunds off it. Average order uses `net`. */
export function totals(orders: Order[]): PeriodTotals {
  const sumOf = (f: (o: Order) => number) => orders.reduce((s, o) => s + f(o), 0);
  const revenue = sumOf(o => Number(o.total) || 0);
  const refunded = sumOf(refundedAmount);
  const net = revenue - refunded;
  const units = sumOf(o => (o.items || []).reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0));
  const shipping = sumOf(o => Number(o.shipping) || 0);
  const tax = sumOf(o => Number(o.tax) || 0);
  const discounts = sumOf(o => Number(o.discount) || 0);
  const subtotal = sumOf(o => Number(o.subtotal) || 0);
  const giftCards = sumOf(o => Number(o.giftCardAmount) || 0);
  const giftCardsSold = sumOf(o => (o.items || []).reduce((n: number, i: any) => n + (i?.giftCard === true ? (Number(i.price) || 0) * (Number(i.quantity) || 0) : 0), 0));
  return {
    orders: orders.length, revenue, refunded, net, units, shipping, tax, subtotal, discounts, giftCards, giftCardsSold,
    aov: orders.length ? net / orders.length : 0,
    discountRate: subtotal > 0 ? (discounts / subtotal) * 100 : 0,
  };
}

/** % change with a stable label; null when there is no baseline to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

const emailOf = (o: Order) => String(o.customer?.email || "").trim().toLowerCase();

/** Customers in the period who had never bought before it began. */
export function customerMix(paid: Order[], current: Order[], start: number) {
  const seenBefore = new Set(paid.filter(o => ts(o.createdAt) < start).map(emailOf).filter(Boolean));
  const inPeriod = new Set(current.map(emailOf).filter(Boolean));
  let returning = 0;
  inPeriod.forEach(e => { if (seenBefore.has(e)) returning++; });
  const total = inPeriod.size;
  return { total, returning, fresh: total - returning, returningRate: total ? (returning / total) * 100 : 0 };
}

export function topCountries(orders: Order[], limit = 5) {
  const map = new Map<string, { country: string; orders: number; revenue: number }>();
  orders.forEach(o => {
    const country = String(o.customer?.address?.country || "").trim() || "Unknown";
    const row = map.get(country) || { country, orders: 0, revenue: 0 };
    row.orders += 1; row.revenue += Number(o.total) || 0;
    map.set(country, row);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export const isDigitalBook = (b?: Book) => !!b && DIGITAL_FORMATS.includes(b.format ?? "");

/** Format words that mean an e-book or audiobook (the same words the fulfilment desk treats as never shipped). */
const DIGITAL_FORMAT_RE = /digital|e-book|ebook|epub|pdf|audiobook|audio book/i;

/**
 * The one rule for "is this sold line digital?": the line's own flag when it says so, else the format of the edition
 * sold (line format, then the book's), else the book's format list. Format mix's header and its bar both use it, so
 * they can never disagree (an "E-book" slice under a "0% digital" heading).
 */
export function lineFormat(i: any, book?: Book): { format: string; digital: boolean } {
  const format = String(i?.format || book?.format || "Unspecified");
  const flag = i?.digital ?? i?.isDigital;
  const digital = flag === true || DIGITAL_FORMAT_RE.test(format) || (flag == null && !i?.format && isDigitalBook(book));
  return { format, digital };
}

/** Revenue and units split by format family (print vs digital) and by exact format. */
export function formatMix(orders: Order[], books: Book[]) {
  const byId = new Map(books.map(b => [b.id, b]));
  const byFormat = new Map<string, { format: string; units: number; revenue: number; digital: boolean; digitalRevenue: number }>();
  orders.forEach(o => (o.items || []).forEach((i: any) => {
    // The edition actually sold (recalculateOrder stores its format/digital on the line).
    const { format, digital } = lineFormat(i, byId.get(i.id));
    const rev = (Number(i.quantity) || 0) * (Number(i.price) || 0);
    const row = byFormat.get(format) || { format, units: 0, revenue: 0, digital: false, digitalRevenue: 0 };
    row.units += Number(i.quantity) || 0; row.revenue += rev;
    if (digital) row.digitalRevenue += rev;
    row.digital = row.digitalRevenue * 2 > row.revenue || (row.revenue === 0 && digital);
    byFormat.set(format, row);
  }));
  // Print vs digital is read off the same rows the bar draws, so the heading always matches the bar.
  const formats = [...byFormat.values()].sort((a, b) => b.revenue - a.revenue).map(({ digitalRevenue, ...f }) => f);
  const digital = formats.reduce((s, f) => s + (f.digital ? f.revenue : 0), 0);
  const total = formats.reduce((s, f) => s + f.revenue, 0);
  return {
    formats,
    printShare: total ? ((total - digital) / total) * 100 : 0,
    digitalShare: total ? (digital / total) * 100 : 0,
    total,
  };
}

export interface TitleStock {
  id: string; title: string; stock: number; sold30: number;
  coverDays: number | null; lastSaleDays: number | null;
}

/** Per-title sell-through: 30-day velocity, days of stock cover, and days since last sale. */
export function titleStock(paid: Order[], books: Book[], now = Date.now()): TitleStock[] {
  // Only copies with a shelf count (stockRules): tracked print books and editions — never digital editions,
  // untracked (print-on-demand) books, gift cards, box sets, drafts or archived books.
  const rowsByBook = new Map<string, StockRow[]>();
  for (const r of trackedStockRows(books)) rowsByBook.set(r.bookId, [...(rowsByBook.get(r.bookId) || []), r]);
  const sold30 = new Map<string, number>();
  const lastSale = new Map<string, number>();
  paid.forEach(o => {
    const t = ts(o.createdAt);
    (o.items || []).forEach((i: any) => {
      const rows = rowsByBook.get(i.id);
      if (!rows) return;
      // A sale of a digital (or untracked) edition doesn't empty the shelf.
      if (i.digital === true || i.isDigital === true) return;
      if (i.variantId && rows.every(r => r.variantId !== String(i.variantId))) return;
      if (now - t <= 30 * DAY) sold30.set(i.id, (sold30.get(i.id) || 0) + (Number(i.quantity) || 0));
      if (t > (lastSale.get(i.id) || 0)) lastSale.set(i.id, t);
    });
  });
  return books.filter(b => rowsByBook.has(b.id)).map(b => {
    const stock = (rowsByBook.get(b.id) || []).reduce((s, r) => s + r.stock, 0);
    const s30 = sold30.get(b.id) || 0;
    const last = lastSale.get(b.id);
    return {
      id: b.id, title: b.title || "Untitled", stock, sold30: s30,
      coverDays: s30 > 0 ? Math.floor(stock / (s30 / 30)) : null,
      lastSaleDays: last ? Math.floor((now - last) / DAY) : null,
    };
  });
}

/** Titles selling fast enough that stock runs out within REORDER_COVER_DAYS (reprint watch). */
export const reprintWatch = (rows: TitleStock[]) =>
  rows.filter(r => r.coverDays !== null && r.coverDays <= REORDER_COVER_DAYS).sort((a, b) => (a.coverDays as number) - (b.coverDays as number));

/** Stock sitting on the shelf with no sale in DORMANT_DAYS (or ever). */
export const dormantStock = (rows: TitleStock[]) =>
  rows.filter(r => r.stock > 0 && (r.lastSaleDays === null || r.lastSaleDays >= DORMANT_DAYS)).sort((a, b) => b.stock - a.stock);

/**
 * Retail value of tracked print stock on hand, edition by edition (each at its own price).
 * `soldOut` counts books/editions shoppers can't buy now (0 left, backorders off).
 */
export function stockValue(books: Book[]) {
  const rows = trackedStockRows(books);
  return {
    units: rows.reduce((s, r) => s + r.stock, 0),
    value: rows.reduce((s, r) => s + r.stock * r.price, 0),
    soldOut: rows.filter(isSoldOut).length,
    titles: new Set(rows.map(r => r.bookId)).size,
  };
}

/** Paid orders still waiting to ship, oldest first, with age in days. */
export function toFulfil(orders: Order[], now = Date.now()) {
  // Same rule as the Orders work queues: anything not in transit, completed or unpaid
  // (so digital-only orders, collected pickups and out-for-delivery parcels drop off). Pre-orders waiting for
  // their release date (counted on their own in orderTodos) and parcels already packed for the customer to collect are not waiting to ship.
  // The wait is counted from when the order could first ship: payment, or a pre-order's release if later
  // (the same clock the daily digest and the admin alerts use).
  const start = (o: Order) => Math.max(ts(o.paidAt) || ts(o.createdAt), preorderClockStart(o, o.operations || {}));
  return orders.filter(o => isRealPaidOrder(o) && !["In transit", "Completed", "Unpaid", "Awaiting release", "Ready for pickup"].includes(queueOf(o)))
    .map(o => ({ ...o, ageDays: Math.max(0, Math.floor((now - start(o)) / DAY)) }))
    .sort((a, b) => start(a) - start(b));
}

/** Run-sheet counts read from orders: open cancel/return requests, gift cards not issued, pre-orders awaiting release. */
export function orderTodos(orders: Order[], now = Date.now()) {
  const real = orders.filter(o => o && o.isTest !== true);
  const paidAt = (o: Order) => Date.parse(o.paidAt || o.updatedAt || o.createdAt || "") || now;
  return {
    requests: real.filter(o => o.customerRequest?.status === "open"),
    giftCardsMissing: real.filter(o => o.paymentStatus === "paid" && !o.giftCardsIssuedAt
      && (o.items || []).some((i: any) => i?.giftCard === true) && now - paidAt(o) >= 10 * 60 * 1000),
    awaitingRelease: real.filter(o => isRealPaidOrder(o) && queueOf(o) === "Awaiting release"),
  };
}

/** Newest real, paid (or refunded) orders — abandoned/unpaid card attempts are not sales. */
export const newestSales = (orders: Order[], limit = 6) =>
  orders.filter(o => o?.isTest !== true && (o.paymentStatus === "paid" || o.paymentStatus === "refunded"))
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt)).slice(0, limit);

/** Plain words for an order's state on the Overview. */
export function orderStatusWords(o: Order): string {
  if (o.paymentStatus === "refunded") return "Refunded";
  if (o.partiallyRefunded) return "Partly refunded";
  const q = queueOf(o);
  if (q === "Completed") return "Completed";
  if (q === "In transit") return "Shipped";
  if (q === "Awaiting release") return "Pre-order";
  if (q === "Needs attention") return "Needs attention";
  return "Paid · to send";
}

export function reviewSummary(reviews: Array<Record<string, any>>) {
  const approved = reviews.filter(r => r.status === "approved");
  const rated = approved.filter(r => Number(r.rating) > 0);
  return {
    pending: reviews.filter(r => r.status === "pending").length,
    approved: approved.length,
    average: rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : null,
  };
}

export function newsletterSummary(subs: Array<Record<string, any>>, start: number) {
  return { total: subs.length, added: subs.filter(s => ts(s.subscribedAt) >= start).length };
}

export interface BestSeller { id: string; title: string; units: number; revenue: number; share: number }

/** Top titles by revenue in a set of paid orders. `share` is % of the listed revenue across all titles. */
export function bestSellers(orders: Order[], limit = 5): BestSeller[] {
  const map = new Map<string, BestSeller>();
  let total = 0;
  for (const o of orders) {
    for (const i of o.items || []) {
      const qty = Number(i.quantity) || 0;
      const rev = qty * (Number(i.price) || 0);
      if (!i.id || qty <= 0) continue;
      const row = map.get(i.id) || { id: i.id, title: i.title || i.name || "Untitled", units: 0, revenue: 0, share: 0 };
      row.units += qty; row.revenue += rev; total += rev;
      map.set(i.id, row);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
    .slice(0, limit)
    .map(r => ({ ...r, share: total > 0 ? (r.revenue / total) * 100 : 0 }));
}

/** Units sold per title id in a set of orders — used to show each best seller's change against the period before. */
export function unitsById(orders: Order[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of orders) for (const i of o.items || []) {
    const qty = Number(i.quantity) || 0;
    if (i.id && qty > 0) map.set(i.id, (map.get(i.id) || 0) + qty);
  }
  return map;
}
