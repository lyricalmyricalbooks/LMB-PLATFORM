// The bookkeeper's page (plan 7.17): what a press's bookkeeper sees instead of the admin. Pure, tested.
// The Team's bookkeeper role reads orders, gift card balances and the daily sales figures (firestore.rules
// isBookkeeper) and writes nothing. Its downloads leave out shoppers' email addresses: a bookkeeper sees the name on
// each order, never a customer list.
import { exportOrdersCsv } from "./orderCsv";
import { salesReportCsv } from "./overview/salesReport";
import { isRealPaidOrder, totals, type Order, type PeriodTotals } from "./overview/overviewInsights";
import { orderDay, shopDayKey } from "../lib/shopDay";

export type BooksPeriod = "thisMonth" | "lastMonth" | "thisYear" | "lastYear";

export const PERIOD_WORDS: Record<BooksPeriod, string> = {
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year",
  lastYear: "Last year",
};

/** The first and last shop day ("YYYY-MM-DD", Toronto) of a period. */
export function periodRange(period: BooksPeriod, now = Date.now()): { startKey: string; endKey: string } {
  const today = shopDayKey(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (period === "thisMonth") return { startKey: `${year}-${pad(month)}-01`, endKey: today };
  if (period === "lastMonth") {
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    return { startKey: `${y}-${pad(m)}-01`, endKey: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  }
  if (period === "thisYear") return { startKey: `${year}-01-01`, endKey: today };
  return { startKey: `${year - 1}-01-01`, endKey: `${year - 1}-12-31` };
}

/** Paid, non-test orders placed on a shop day inside the range. */
export function paidInRange(orders: Order[], range: { startKey: string; endKey: string }): Order[] {
  return orders.filter((o) => {
    if (!isRealPaidOrder(o)) return false;
    const day = orderDay(o.createdAt);
    return day !== "" && day >= range.startKey && day <= range.endKey;
  });
}

export function periodTotals(orders: Order[], range: { startKey: string; endKey: string }): PeriodTotals {
  return totals(paidInRange(orders, range));
}

/** The order without the shopper's email addresses (theirs, and a gift card recipient's). The name stays. */
export function withoutEmails(order: any): any {
  const customer = order?.customer && typeof order.customer === "object" ? { ...order.customer, email: "" } : order?.customer;
  const issued = Array.isArray(order?.giftCardsIssued)
    ? order.giftCardsIssued.map((card: any) => (card && typeof card === "object" ? { ...card, recipientEmail: "" } : card))
    : order?.giftCardsIssued;
  return { ...order, customer, ...(issued === undefined ? {} : { giftCardsIssued: issued }) };
}

/** Orders › Export CSV's columns for the orders placed in the range (paid and refunded), without email addresses. */
export function bookkeeperOrdersCsv(orders: Order[], range: { startKey: string; endKey: string }): string {
  const inRange = orders.filter((o) => {
    const day = orderDay(o.createdAt);
    return day !== "" && day >= range.startKey && day <= range.endKey;
  });
  return exportOrdersCsv(inRange.map(withoutEmails), { paidOnly: true });
}

/** The Overview's sales report (day by day: revenue, refunds, tax and shipping collected) for the range. */
export function bookkeeperSalesCsv(orders: Order[], range: { startKey: string; endKey: string }): string {
  return salesReportCsv(paidInRange(orders, range), range.startKey, range.endKey);
}
