// Stockroom › Shipping, worked out inside the admin from the stockroom's own rules: which paid website orders are still
// waiting to go out (order-followups.js) and which parcels cost more to post than the customer paid (shipping-price-check.js).
// Pure and read-only: the page is ShippingPage.tsx.
import { destinationLabel, unshippedOrders } from "@stockroom/order-followups.js";
import { isPostageExpense } from "@stockroom/postage-matching.js";
import { getBookCurrencyCode, roundCents } from "@stockroom/money.js";
import { LOSS_MARGIN, rateAgainstPaid } from "@stockroom/shipping-price-check.js";
import { linkedShippingSummary, normalizeShippingOrderNumber } from "@stockroom/shipping-reconciliation.js";

import type { StockroomRecords } from "./stockroomData";
import { SHOP_CURRENCY } from "../moneySign";

type Rec = Record<string, any>;

export type WaitingOrder = { key: string; num: string; customer: string; titles: string[]; qty: number; days: number; late: boolean; destination: string };
export type LossOrder = { num: string; date: string; destination: string; paid: number; postage: number; gap: number };
export type ShippingView = { waiting: WaitingOrder[]; losses: LossOrder[]; lossTotal: number; websiteOrders: number };

/** From this many days waiting, an order is flagged as late (the stockroom's list starts at 3). */
export const LATE_AFTER_DAYS = 7;
/** Postage that cost more than the customer paid is shown for orders this recent. */
export const LOSS_WITHIN_DAYS = 60;

const DAY = 86_400_000;

export function buildShipping(records: StockroomRecords, now: Date = new Date()): ShippingView {
  const expenses: Rec[] = Array.isArray(records.taxCenter?.businessExpenses) ? (records.taxCenter!.businessExpenses as Rec[]).filter((e) => e && isPostageExpense(e)) : [];
  const rows: Array<{ bookId: string; entry: Rec; bookTitle: string }> = [];
  for (const book of records.books) {
    const hist = records.states[book.id]?.hist;
    if (!Array.isArray(hist)) continue;
    for (const entry of hist) if (entry && entry.chan === "Website") rows.push({ bookId: book.id, entry, bookTitle: book.title || book.id });
  }

  // An order with a label matched to it has been sent, whatever its flag says (the stockroom's rule).
  const labelled = new Set<string>(rows.filter(({ entry }) => linkedShippingSummary(entry, expenses, 1).linkedCount > 0).map(({ entry }) => entry.num));
  const entryByNum = new Map<string, Rec>();
  rows.forEach(({ entry }) => { if (entry.num && !entryByNum.has(entry.num)) entryByNum.set(entry.num, entry); });

  // An order for two titles is two ledger rows sharing one order number: one parcel, one line here.
  const waiting: WaitingOrder[] = [];
  const merged = new Map<string, WaitingOrder>();
  for (const o of unshippedOrders(rows, { now: now.getTime(), labelled })) {
    const hit = o.num ? merged.get(o.num) : undefined;
    if (hit) {
      if (o.bookTitle && !hit.titles.includes(o.bookTitle)) hit.titles.push(o.bookTitle);
      hit.qty += o.qty;
      continue;
    }
    const item: WaitingOrder = {
      key: o.num || `${o.bookId}:${waiting.length}`, num: o.num, customer: o.customer, titles: o.bookTitle ? [o.bookTitle] : [], qty: o.qty, days: o.days,
      late: o.days >= LATE_AFTER_DAYS, destination: destinationLabel(entryByNum.get(o.num) || {}),
    };
    waiting.push(item);
    if (o.num) merged.set(o.num, item);
  }

  // Orders whose matched postage cost more than the customer paid for shipping (dollars only, so a euro book never invents a loss).
  const orders = new Map<string, { entry: Rec; paid: number }>();
  rows.forEach(({ bookId, entry }) => {
    if (entry.voided || entry.excludeFromShipping) return;
    if (getBookCurrencyCode(records.books.find((b) => b.id === bookId)) !== SHOP_CURRENCY) return;
    const key = normalizeShippingOrderNumber(entry.num);
    if (!key) return;
    const have = orders.get(key);
    // The shipping charge sits on any row of the order: the largest, never the sum.
    if (!have) orders.set(key, { entry, paid: Number(entry.shippingPaid) || 0 });
    else have.paid = Math.max(have.paid, Number(entry.shippingPaid) || 0);
  });
  const cutoff = now.getTime() - LOSS_WITHIN_DAYS * DAY;
  const losses: LossOrder[] = [];
  orders.forEach(({ entry, paid }) => {
    const when = Date.parse(`${String(entry.date || "").slice(0, 10)}T12:00:00`);
    if (!Number.isFinite(when) || when < cutoff) return;
    const summary = linkedShippingSummary({ ...entry, shippingPaid: paid }, expenses, 1);
    if (summary.postageBase == null || summary.customerBase == null) return;
    const verdict = rateAgainstPaid(summary.postageBase, summary.customerBase);
    if (!verdict || !verdict.losing) return;
    losses.push({ num: String(entry.num), date: String(entry.date || ""), destination: destinationLabel(entry), paid: summary.customerBase, postage: summary.postageBase, gap: verdict.gap });
  });
  losses.sort((a, b) => b.gap - a.gap);
  return { waiting, losses, lossTotal: roundCents(losses.reduce((n, l) => n + l.gap, 0)), websiteOrders: orders.size };
}

export { LOSS_MARGIN };

// ── Labels from the shop's own orders ──────────────────────────────────────────────────────────────────────────────────
// A waiting row whose number is a website order here can get its label on this page, through the order page's own label
// path (useLabelPurchase → createShippingLabel, whose claim refuses a second purchase). The stockroom hears of a label
// later, so a row whose order already has one, or has left, is dropped here at once.

/** The website order id a stockroom order number points at ("#WEB-1041" → "WEB-1041"), or "" when it can't be one. */
export function shopOrderId(num: string): string {
  const id = String(num || "").trim().replace(/^#/, "");
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) ? id : "";
}

/** The website order has a label or tracking, or has already gone out (or never will). */
export function orderHasGone(order: Rec): boolean {
  if (order.labelUrl || order.trackingNumber) return true;
  if (["shipped", "out_for_delivery", "delivered", "collected", "cancelled", "refunded"].includes(String(order.fulfillmentStatus || ""))) return true;
  return ["completed", "cancelled", "refunded"].includes(String(order.status || ""));
}

export type WaitingWithOrder = WaitingOrder & { shopOrderId?: string };

/**
 * Puts the website orders found for the waiting rows beside them (`found` by row key; null = no such order).
 * Rows whose order has a label or has left are dropped; the rest keep their place.
 */
export function joinShopOrders(waiting: WaitingOrder[], found: Record<string, Rec | null | undefined>): WaitingWithOrder[] {
  const out: WaitingWithOrder[] = [];
  for (const row of waiting) {
    const order = found[row.key];
    if (order && orderHasGone(order)) continue;
    out.push(order ? { ...row, shopOrderId: String(order.id || shopOrderId(row.num)) } : row);
  }
  return out;
}
