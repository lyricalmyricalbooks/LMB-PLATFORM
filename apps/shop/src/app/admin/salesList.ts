// The combined admin's one list of sales (shop + stockroom plan; docs/combined-admin.md step 3): website orders, and
// the fair, stockist, invoice and hand-entered sales the stockroom recorded. The stockroom leaves its own copies of
// website orders out (`salesRows`), so nothing is counted twice. Pure and tested; AllSales.tsx draws it.
import { orderDay, shopDayKey, addDays } from "../lib/shopDay";
import { refundedAmount, type Order } from "./overview/overviewInsights";
import type { StockroomSale } from "./stockroomBridge";
import { channelWords } from "./StockroomBookPanel";
import { SHOP_CURRENCY } from "./moneySign";

export type SaleRow = {
  key: string; date: string; channel: string; what: string; qty: number; amount: number; cur: string; who: string;
  /** Where the sale opens: the website's order page, or the stockroom's book. */
  orderId?: string; bookId?: string; refunded?: boolean;
  /** A till sale only: its checkout number and fair (stockroom `salesRows`). */
  sale?: string; fair?: string;
};

/** The shop's own money: website orders are charged in it. */
export { SHOP_CURRENCY };

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
    who: s.stockist || (s.invoice ? `Invoice ${s.invoice}` : "") || s.fair || "", bookId: s.bookId,
    ...(s.chan === FAIR_CHANNEL ? { sale: s.sale || "", fair: s.fair || "" } : {}),
  }));
}

/** The stockroom's channel for sales rung up at the Fair till. */
export const FAIR_CHANNEL = "Book Fair";

export type FairDay = {
  key: string; date: string; fair: string; sales: number; copies: number;
  takings: Array<{ cur: string; amount: number }>; best: { title: string; qty: number } | null;
};

/**
 * Each fair day in some rows, newest first: one per day and fair named at the till, so two fairs on one day stay apart.
 * Sales count checkouts (rows sharing a checkout number are one customer); takings stay per currency.
 */
export function fairDays(rows: SaleRow[]): FairDay[] {
  const days = new Map<string, { date: string; fair: string; rows: SaleRow[] }>();
  for (const r of rows) {
    if (r.channel !== FAIR_CHANNEL || !r.date) continue;
    const fair = r.fair || "";
    const key = `${r.date}|${fair}`;
    const d = days.get(key) || { date: r.date, fair, rows: [] };
    d.rows.push(r);
    days.set(key, d);
  }
  return [...days.entries()].map(([key, d]) => {
    const checkouts = new Set(d.rows.map((r) => r.sale || r.key));
    const byTitle = new Map<string, number>();
    for (const r of d.rows) byTitle.set(r.what, (byTitle.get(r.what) || 0) + r.qty);
    const [title, qty] = [...byTitle].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    const { copies, takings } = saleTotals(d.rows);
    return { key, date: d.date, fair: d.fair, sales: checkouts.size, copies, takings, best: title ? { title, qty: qty as number } : null };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.fair.localeCompare(b.fair)));
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

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
const csvRow = (vals: unknown[]) => vals.map(csvCell).join(",");

/**
 * All sales as a spreadsheet (CSV), exactly the rows on screen: the period and channel picked, newest first. Takings
 * are each sale's own currency, so a fair in US dollars stays in US dollars. Safe against spreadsheet formulas.
 * `words` is the shop's words (books or products).
 */
export function salesCsv(rows: SaleRow[], { period, channel, words = (t: string) => t }: { period: string; channel: string; words?: (text: string) => string }): string {
  const lines = [
    csvRow([`All sales · ${period} · ${channel}`]),
    csvRow([words("Takings are books only, after discounts and refunds, in each sale's own currency.")]),
    csvRow(["Date", words("What sold"), "Channel", "Who", "Quantity", "Takings", "Currency", "Refunded", "Order number"]),
  ];
  for (const r of rows) {
    lines.push(csvRow([r.date, r.what, channelWords(r.channel), r.who, r.qty, (Math.round(r.amount * 100) / 100).toFixed(2), r.cur, r.refunded ? "Yes" : "", r.orderId || ""]));
  }
  return lines.join("\n");
}

/** The file's name: `all-sales-<channel>-<period>-<today>.csv`. */
export const salesCsvName = (channel: string, period: string, today = new Date().toISOString().slice(0, 10)) =>
  `all-sales-${channel || "every-channel"}-${period}-${today}.csv`;
