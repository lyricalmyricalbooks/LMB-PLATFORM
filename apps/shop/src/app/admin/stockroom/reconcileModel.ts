// Stockroom › Reconcile (Payments and payouts), as the mockup draws it: each payout the card company sent, its sales
// and fees, and whether it matches. Read from the shop's own orders (the payment service stamps `fee`, `net`,
// `payoutId` and `payoutDate` on each one); the grouping and money rules are the bookkeeping file's (shared/bookkeeping.ts).
import { bookkeepingPayouts, countsForBooks, dayOf, type BookkeepingOrder } from "../../../shared/bookkeeping";
import { SHOP_TZ } from "../../lib/shopDay";
import { SHOP_CURRENCY } from "../moneySign";

/** One order in a payout: what it sold, the fee, what reached the bank and what is missing (refunds, mostly). */
export type PayoutOrder = { id: string; num: string; salesCents: number; feesCents: number; netCents: number; differenceCents: number };

export type PayoutRow = {
  payoutId: string;
  /** "YYYY-MM-DD" on the shop's day, "" when the payment service hasn't said yet. */
  date: string;
  salesCents: number;
  feesCents: number;
  netCents: number;
  /** Sales less fees less what was paid out: money taken back from this payout (a refund) when above 0. */
  differenceCents: number;
  /** Orders whose paid-out amount isn't their sale less its fee. */
  differences: number;
  orders: PayoutOrder[];
};

export type ReconcileModel = {
  currency: string;
  payouts: PayoutRow[];
  matched: number;
  needsLook: number;
  /** What the payouts that need a look are short by, together (above 0 = refunds taken back). */
  needsLookCents: number;
  /** Paid orders the payment service hasn't put in a payout yet. */
  waiting: number;
};

/** The currency most of the shop's orders were taken in (CAD when none say). */
export function ordersCurrency(orders: BookkeepingOrder[]): string {
  const by = new Map<string, number>();
  for (const o of orders) {
    const c = String(o.stripeCurrency || o.checkoutCurrency || o.currency || "").toUpperCase();
    if (c) by.set(c, (by.get(c) || 0) + 1);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || SHOP_CURRENCY;
}

export function reconcileModel(orders: BookkeepingOrder[], currency = ordersCurrency(orders)): ReconcileModel {
  const counted = orders.filter(countsForBooks);
  const paidOut = counted.filter((o) => o.payoutId);
  // One order at a time through the shared rule gives each order's own figures; grouping by payout then adds them up.
  const byPayout = new Map<string, PayoutRow>();
  for (const order of paidOut) {
    const month = (order.payoutDate != null && order.payoutDate !== "" ? dayOf(order.payoutDate, SHOP_TZ) : "").slice(0, 7);
    const [one] = bookkeepingPayouts([order], { month, currency, timeZone: SHOP_TZ });
    if (!one) continue;
    const row = byPayout.get(one.payoutId) || { payoutId: one.payoutId, date: one.date, salesCents: 0, feesCents: 0, netCents: 0, differenceCents: 0, differences: 0, orders: [] };
    row.salesCents += one.totalCents;
    row.feesCents += one.feesCents;
    row.netCents += one.netCents;
    row.differenceCents += one.refundsCents;
    if (one.refundsCents !== 0) row.differences += 1;
    if (!row.date && one.date) row.date = one.date;
    row.orders.push({ id: String(order.id || order.orderId || ""), num: String(order.orderId || order.id || ""), salesCents: one.totalCents, feesCents: one.feesCents, netCents: one.netCents, differenceCents: one.refundsCents });
    byPayout.set(one.payoutId, row);
  }
  // Newest first; a payout with no date yet goes on top (it is the one still being sent).
  const payouts = [...byPayout.values()].sort((a, b) => (!a.date ? -1 : !b.date ? 1 : b.date.localeCompare(a.date)) || a.payoutId.localeCompare(b.payoutId));
  const look = payouts.filter((p) => p.differences > 0);
  return {
    currency,
    payouts,
    matched: payouts.length - look.length,
    needsLook: look.length,
    needsLookCents: look.reduce((s, p) => s + p.differenceCents, 0),
    waiting: counted.length - paidOut.length,
  };
}

/** The chip on a payout row: "Matched" or "1 difference". */
export const payoutChip = (p: PayoutRow): { label: string; tone: "success" | "warning" } =>
  p.differences ? { label: `${p.differences} ${p.differences === 1 ? "difference" : "differences"}`, tone: "warning" } : { label: "Matched", tone: "success" };
