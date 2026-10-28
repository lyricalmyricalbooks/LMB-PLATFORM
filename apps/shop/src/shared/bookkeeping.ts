// The bookkeeping file (plan 7.12): one month of orders as the lines a bookkeeper enters. Pure, shared, so Settings ›
// Backups & export ("Download for your bookkeeper") and the accounting link build the same numbers.
//
// - Order lines: one per order per day something happened to it: a "Sale" on the day it was paid, a "Refund" on the
//   day money went back. Day lines are those added up, so the two sheets always agree.
// - Day lines (`dailyBookkeeping`): sales before tax, shipping, discounts, gift cards sold and used, refunds, each tax
//   by its name in the books (taxBooks.ts), card fees, net. Net = what the press keeps: sales − discounts + shipping +
//   taxes + gift cards sold − gift cards used − card fees − refunds (an order's own `net` wins when the payment
//   service recorded one).
// - Payout lines: one per payout dated in the month, with its orders' total, fees and net.
// Money is whole cents in the shop's currency (order amounts are stored in it; a refund in the shopper's currency is
// converted back with the order's exchange rate). Test, sandbox and practice orders are left out. Card fee and payout
// fields (`fee`, `net` in cents, `payoutId`, `payoutDate`) come from the payment service (plan 7.10); an order without
// them shows blanks there.
import type { TaxLine } from "./taxBooks";

type Money = number | string | null | undefined;
type Line = { price?: Money; quantity?: Money; giftCard?: boolean };
type PartialRefund = { amountMinor?: Money; currency?: string; status?: string; createdAt?: string };

/** The order fields the bookkeeping file reads. */
export type BookkeepingOrder = {
  id?: string;
  orderId?: string;
  createdAt?: string;
  paidAt?: string;
  updatedAt?: string;
  paymentStatus?: string;
  isTest?: boolean;
  sandboxPayment?: boolean;
  practice?: boolean;
  items?: Line[];
  subtotal?: Money;
  discount?: Money;
  shipping?: Money;
  tax?: Money;
  taxLines?: TaxLine[];
  total?: Money;
  giftCardAmount?: Money;
  exchangeRate?: Money;
  checkoutCurrency?: string;
  refund?: { amount?: Money; currency?: string; createdAt?: string } | null;
  refundedAt?: string;
  refundedAmountMinor?: Money;
  partialRefunds?: PartialRefund[];
  fee?: Money;
  net?: Money;
  payoutId?: string | null;
  payoutDate?: string | number | null;
  [field: string]: unknown;
};

export type BookkeepingOptions = {
  /** The month, "YYYY-MM". */
  month: string;
  /** The shop's currency (default CAD). */
  currency?: string;
  /** Days are counted in this time zone (default UTC). */
  timeZone?: string;
};

/** One day of the month, everything in cents. `taxes` maps each tax's name in the books to its cents. */
export type BookkeepingDay = {
  date: string;
  salesCents: number;
  shippingCents: number;
  discountsCents: number;
  giftCardsSoldCents: number;
  giftCardsUsedCents: number;
  refundsCents: number;
  taxes: Record<string, number>;
  feesCents: number;
  netCents: number;
  currency: string;
};

/** One sale or refund of one order. `feeCents`, `payoutId` and `payoutDate` are null when not recorded. */
export type BookkeepingOrderLine = Omit<BookkeepingDay, "feesCents"> & {
  orderId: string;
  kind: "Sale" | "Refund";
  totalCents: number;
  feeCents: number | null;
  payoutId: string | null;
  payoutDate: string | null;
};

export type BookkeepingPayout = {
  payoutId: string;
  date: string;
  orders: number;
  totalCents: number;
  feesCents: number;
  netCents: number;
  currency: string;
};

/** The name older orders' tax goes under (they were placed before taxes had names). */
export const UNNAMED_TAX = "Sales tax";

const PAID = new Set(["paid", "refunded", "refund_pending"]);
const cents = (value: Money) => Math.round((Number(value) || 0) * 100);
const whole = (value: Money) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Math.round(Number(value)));

/** "YYYY-MM-DD" of a moment in a time zone ("" when it isn't a date). Accepts ISO text, "YYYY-MM-DD", seconds or ms. */
export function dayOf(value: unknown, timeZone = "UTC"): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = typeof value === "number" ? (value < 1e12 ? value * 1000 : value) : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Real money only: no test, sandbox or practice orders, and only orders that were paid. */
export function countsForBooks(order: BookkeepingOrder): boolean {
  return order.isTest !== true && order.sandboxPayment !== true && order.practice !== true && PAID.has(String(order.paymentStatus || ""));
}

function taxesOf(order: BookkeepingOrder): Record<string, number> {
  const out: Record<string, number> = {};
  const lines = Array.isArray(order.taxLines) ? order.taxLines : null;
  if (lines) {
    for (const line of lines) if (line && line.name) out[line.name] = (out[line.name] || 0) + (whole(line.cents) || 0);
  } else if (cents(order.tax)) {
    out[UNNAMED_TAX] = cents(order.tax);
  }
  return out;
}

/** Refunds of an order as [day, cents in the shop's currency]. */
function refundsOf(order: BookkeepingOrder, currency: string, timeZone: string): [string, number][] {
  const rate = Number(order.exchangeRate) > 0 ? Number(order.exchangeRate) : 1;
  const toShop = (minor: number, cur: unknown) => (String(cur || currency).toUpperCase() === currency ? minor : Math.round(minor / rate));
  const charged = String(order.checkoutCurrency || currency);
  const out: [string, number][] = [];
  let recorded = 0;
  for (const r of Array.isArray(order.partialRefunds) ? order.partialRefunds : []) {
    if (!r || ["failed", "canceled"].includes(String(r.status || ""))) continue;
    const minor = whole(r.amountMinor) || 0;
    recorded += minor;
    out.push([dayOf(r.createdAt, timeZone), toShop(minor, r.currency || charged)]);
  }
  // The rest of the refunded total (a full refund, or a partial one only the running total knows) on its own day.
  const full = order.paymentStatus === "refunded" || order.paymentStatus === "refund_pending";
  const fullMinor = full && order.refund ? cents(order.refund.amount) : 0;
  const fullCurrency = full && order.refund ? order.refund.currency || charged : charged;
  const totalMinor = Math.max(whole(order.refundedAmountMinor) || 0, fullMinor, recorded);
  const rest = totalMinor - recorded;
  if (rest > 0) {
    const when = order.refund?.createdAt || order.refundedAt || order.updatedAt;
    const cur = whole(order.refundedAmountMinor) ? charged : fullCurrency;
    out.push([dayOf(when, timeZone), toShop(rest, cur)]);
  }
  return out.filter(([day, amount]) => day && amount);
}

const giftCardsSold = (order: BookkeepingOrder) => (Array.isArray(order.items) ? order.items : [])
  .filter((item) => item && item.giftCard === true)
  .reduce((sum, item) => sum + cents((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);

/** Sheet 2: each sale and refund in the month, oldest first. */
export function bookkeepingOrderLines(orders: BookkeepingOrder[], options: BookkeepingOptions): BookkeepingOrderLine[] {
  const currency = String(options.currency || "CAD").toUpperCase();
  const timeZone = options.timeZone || "UTC";
  const inMonth = (day: string) => day.slice(0, 7) === options.month;
  const out: BookkeepingOrderLine[] = [];
  for (const order of orders) {
    if (!countsForBooks(order)) continue;
    const orderId = String(order.orderId || order.id || "");
    const payoutId = order.payoutId ? String(order.payoutId) : null;
    const payoutDate = order.payoutDate != null && order.payoutDate !== "" ? dayOf(order.payoutDate, timeZone) || null : null;
    const paidDay = dayOf(order.paidAt || order.createdAt, timeZone);
    if (paidDay && inMonth(paidDay)) {
      const soldCards = giftCardsSold(order);
      const totalCents = cents(order.total);
      const feeCents = whole(order.fee);
      const net = whole(order.net);
      out.push({
        date: paidDay, orderId, kind: "Sale",
        salesCents: cents(order.subtotal) - soldCards,
        shippingCents: cents(order.shipping),
        discountsCents: cents(order.discount),
        giftCardsSoldCents: soldCards,
        giftCardsUsedCents: cents(order.giftCardAmount),
        refundsCents: 0,
        taxes: taxesOf(order),
        totalCents, feeCents,
        netCents: net ?? totalCents - (feeCents || 0),
        payoutId, payoutDate, currency,
      });
    }
    for (const [day, amount] of refundsOf(order, currency, timeZone)) {
      if (!inMonth(day)) continue;
      out.push({
        date: day, orderId, kind: "Refund",
        salesCents: 0, shippingCents: 0, discountsCents: 0, giftCardsSoldCents: 0, giftCardsUsedCents: 0,
        refundsCents: amount, taxes: {}, totalCents: 0, feeCents: null, netCents: -amount,
        payoutId: null, payoutDate: null, currency,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId) || a.kind.localeCompare(b.kind));
}

/** Sheet 1: one line per day of the month that had a sale or refund, oldest first. */
export function dailyBookkeeping(orders: BookkeepingOrder[], options: BookkeepingOptions): BookkeepingDay[] {
  const days = new Map<string, BookkeepingDay>();
  for (const line of bookkeepingOrderLines(orders, options)) {
    const day = days.get(line.date) || {
      date: line.date, salesCents: 0, shippingCents: 0, discountsCents: 0, giftCardsSoldCents: 0, giftCardsUsedCents: 0,
      refundsCents: 0, taxes: {}, feesCents: 0, netCents: 0, currency: line.currency,
    };
    day.salesCents += line.salesCents;
    day.shippingCents += line.shippingCents;
    day.discountsCents += line.discountsCents;
    day.giftCardsSoldCents += line.giftCardsSoldCents;
    day.giftCardsUsedCents += line.giftCardsUsedCents;
    day.refundsCents += line.refundsCents;
    for (const [name, amount] of Object.entries(line.taxes)) day.taxes[name] = (day.taxes[name] || 0) + amount;
    day.feesCents += line.feeCents || 0;
    day.netCents += line.netCents;
    days.set(line.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Sheet 3: each payout dated in the month, with the total, fees and net of the orders it paid out. */
export function bookkeepingPayouts(orders: BookkeepingOrder[], options: BookkeepingOptions): BookkeepingPayout[] {
  const currency = String(options.currency || "CAD").toUpperCase();
  const timeZone = options.timeZone || "UTC";
  const payouts = new Map<string, BookkeepingPayout>();
  for (const order of orders) {
    if (!countsForBooks(order) || !order.payoutId) continue;
    const date = order.payoutDate != null && order.payoutDate !== "" ? dayOf(order.payoutDate, timeZone) : "";
    if (date.slice(0, 7) !== options.month) continue;
    const id = String(order.payoutId);
    const payout = payouts.get(id) || { payoutId: id, date, orders: 0, totalCents: 0, feesCents: 0, netCents: 0, currency };
    const totalCents = cents(order.total);
    const feeCents = whole(order.fee) || 0;
    payout.orders += 1;
    payout.totalCents += totalCents;
    payout.feesCents += feeCents;
    payout.netCents += whole(order.net) ?? totalCents - feeCents;
    payouts.set(id, payout);
  }
  return [...payouts.values()].sort((a, b) => a.date.localeCompare(b.date) || a.payoutId.localeCompare(b.payoutId));
}

/** Every tax name used in these lines, A to Z (the sheets' tax columns). */
export function taxNamesOf(lines: { taxes: Record<string, number> }[]): string[] {
  return [...new Set(lines.flatMap((line) => Object.keys(line.taxes)))].sort((a, b) => a.localeCompare(b));
}
