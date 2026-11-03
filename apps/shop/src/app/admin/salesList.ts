// The combined admin's one list of sales (shop + stockroom plan; docs/combined-admin.md step 3): website orders, and
// the fair, stockist, invoice and hand-entered sales the stockroom recorded. The stockroom leaves its own copies of
// website orders out (`salesRows`), so nothing is counted twice. Pure and tested; AllSales.tsx draws it.
import { orderDay, shopDayKey, addDays } from "../lib/shopDay";
import { refundedAmount, type Order } from "./overview/overviewInsights";
import type { StockroomSale } from "./stockroomBridge";
import { channelWords } from "./StockroomBookPanel";

export type SaleRow = {
  key: string; date: string; channel: string; what: string; qty: number; amount: number; cur: string; who: string;
  /** Where the sale opens: the website's order page, or the stockroom's book. */
  orderId?: string; bookId?: string; refunded?: boolean;
};

/** The shop's own money: website orders are charged in it. */
export const SHOP_CURRENCY = "CAD";

/** The channel of online sales only the stockroom recorded. */
export const OTHER_ONLINE = "Other online sales";

/** How far back the list goes. */
export const PERIODS = [
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
  { id: "all", label: "Every sale", days: 0 },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

/** The first day a period includes (YYYY-MM-DD), or "" for every sale. */
export function sinceFor(period: PeriodId, now = Date.now()): string {
  const days = PERIODS.find((p) => p.id === period)?.days || 0;
  return days ? addDays(shopDayKey(now), -(days - 1)) : "";
}

const lineWords = (items: Order["items"] = []) => {
  const titles = items.map((i: any) => String(i?.title || i?.name || "").trim()).filter(Boolean);
  if (!titles.length) return "Website order";
  return titles.length === 1 ? titles[0] : `${titles[0]} and ${titles.length - 1} more`;
};

/**
 * What an order's books brought in: their price after discounts, less any part refunded, without the shipping and tax
 * it also charged, so it compares with a stockroom sale (copies × price).
 */
export function bookTakings(o: Order): number {
  const total = Number(o.total) || 0;
  const goods = o.subtotal !== undefined
    ? (Number(o.subtotal) || 0) - (Number(o.discount) || 0)
    : total - (Number(o.shipping) || 0) - (Number(o.tax) || 0);
  const kept = total > 0 ? 1 - refundedAmount(o) / total : 1;
  return Math.max(0, Math.round(goods * kept * 100) / 100);
}

/** Paid website orders (refunded ones too, marked) since a day, as rows; test orders and unpaid attempts are no sale. */
export function websiteSaleRows(orders: Order[], since: string): SaleRow[] {
  return orders.filter((o) => o && o.isTest !== true && (o.paymentStatus === "paid" || o.paymentStatus === "refunded"))
    .map((o) => {
      const date = orderDay(o.paidAt || o.createdAt);
      const refunded = o.paymentStatus === "refunded";
      return {
        key: `web:${o.id}`, date, channel: "Website", what: lineWords(o.items),
        qty: (o.items || []).reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0),
        amount: refunded ? 0 : bookTakings(o),
        cur: SHOP_CURRENCY, who: String(o.customer?.name || o.customer?.email || ""), orderId: o.id, refunded,
      };
    })
    .filter((r) => !since || !r.date || r.date >= since);
}

/** The stockroom's sales as rows. */
export function stockroomSaleRows(sales: StockroomSale[]): SaleRow[] {
  return sales.map((s) => ({
    // The stockroom's own online sales (payment links, older imported orders) aren't the website's orders.
    key: `stock:${s.key}`, date: s.date, channel: s.chan === "Website" ? OTHER_ONLINE : s.chan, what: s.title, qty: s.qty, amount: s.amount, cur: s.cur,
    who: s.stockist || (s.invoice ? `Invoice ${s.invoice}` : ""), bookId: s.bookId,
  }));
}

/** Both lists as one, newest first. */
export function mergeSales(...lists: SaleRow[][]): SaleRow[] {
  return lists.flat().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key.localeCompare(b.key)));
}

/** A channel's id for the filter: its words, as a slug ("Fairs and markets" → "fairs-and-markets"). */
export const channelId = (channel: string) => channelWords(channel).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The channel filter: each channel in the admin's words, with how many sales it has, busiest first. */
export function channelCounts(rows: SaleRow[]): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const id = channelId(r.channel);
    const c = counts.get(id) || { label: channelWords(r.channel), count: 0 };
    c.count += 1;
    counts.set(id, c);
  }
  return [...counts].map(([id, c]) => ({ id, ...c })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The rows of one channel (by its id), or all of them. */
export const inChannel = (rows: SaleRow[], channel: string) => (channel ? rows.filter((r) => channelId(r.channel) === channel) : rows);

/** Copies and takings of some rows; takings per currency, the shop's own first. */
export function saleTotals(rows: SaleRow[]): { sales: number; copies: number; takings: Array<{ cur: string; amount: number }> } {
  const money = new Map<string, number>();
  for (const r of rows) money.set(r.cur, (money.get(r.cur) || 0) + r.amount);
  const takings = [...money].map(([cur, amount]) => ({ cur, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => (a.cur === SHOP_CURRENCY ? -1 : b.cur === SHOP_CURRENCY ? 1 : b.amount - a.amount));
  return { sales: rows.length, copies: rows.reduce((n, r) => n + r.qty, 0), takings };
}
