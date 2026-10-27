// Gross profit and the per-title table for the Overview. A line's revenue is what the customer paid for it: its
// price × copies, less its share of the order's discount and of any partial refund. Its cost is the cost price saved
// in Inventory (admin-only inventoryCosts/{bookId}) or on the book (Books › edit › Pricing); a digital edition costs
// nothing to send. Lines with no cost known are left out of profit and reported as "cost unknown" — never guessed.
// Gift cards are money held, not sales, so they are left out. Shipping and tax are not product profit. Pure.
import { titleFlag, TITLE_FLAG_WORDS, type TitleFlag } from "./overviewSignals";
import { isDigitalBook, type Book, type Order } from "./overviewInsights";
import type { TitleStock } from "./overviewInsights";

const num = (v: unknown) => Number(v) || 0;

/** Cost per copy (CAD) for a book, or null when nobody has entered one. */
export function costOf(bookId: string, books: Map<string, Book>, costs: Record<string, number>): number | null {
  const saved = num(costs[bookId]);
  if (saved > 0) return saved;
  const onBook = num(books.get(bookId)?.costPrice);
  return onBook > 0 ? onBook : null;
}

const isDigitalLine = (line: any, book?: Book) => {
  const flag = line?.digital ?? line?.isDigital;
  return flag === true || (flag == null && isDigitalBook(book));
};

export interface LineFigures { id: string; title: string; units: number; revenue: number; cost: number | null }

/** Every sold book line of the orders with its net revenue and cost (null = unknown). Gift cards are skipped. */
export function soldLines(orders: Order[], books: Book[], costs: Record<string, number>): LineFigures[] {
  const byId = new Map(books.map(b => [b.id, b]));
  const out: LineFigures[] = [];
  for (const o of orders) {
    const lines = (o.items || []).filter((i: any) => i?.id && i.giftCard !== true && num(i.quantity) > 0);
    const gross = lines.reduce((s: number, i: any) => s + num(i.price) * num(i.quantity), 0);
    if (gross <= 0) continue;
    // The order's discount is shared across its book lines by value (gift cards are never discounted, so they are
    // left out of the base even though the order's subtotal includes them); a partial refund is shared the same way.
    const discountShare = Math.min(1, num(o.discount) / gross);
    const total = num(o.total);
    const refundShare = total > 0 ? Math.min(1, Math.max(0, num(o.refundedAmountMinor) > 0 ? refundedShare(o) : 0)) : 0;
    for (const i of lines) {
      const book = byId.get(i.id);
      const units = num(i.quantity);
      const revenue = num(i.price) * units * (1 - discountShare) * (1 - refundShare);
      const perCopy = isDigitalLine(i, book) ? 0 : costOf(i.id, byId, costs);
      out.push({ id: i.id, title: i.title || i.name || book?.title || "Untitled", units, revenue, cost: perCopy === null ? null : perCopy * units });
    }
  }
  return out;
}

function refundedShare(o: Order): number {
  const minor = num(o.refundedAmountMinor), expected = num(o.expectedAmountMinor);
  if (expected > 0) return minor / expected;
  const cur = String(o.checkoutCurrency || o.expectedCurrency || "CAD").toUpperCase();
  return cur === "CAD" && num(o.total) > 0 ? minor / 100 / num(o.total) : 0;
}

export interface ProfitSummary { revenue: number; cost: number; profit: number; margin: number | null; costedUnits: number; units: number; coverage: number }

/** Profit over the lines whose cost is known, and how much of what sold that covers (by copies). */
export function profitSummary(orders: Order[], books: Book[], costs: Record<string, number>): ProfitSummary {
  const lines = soldLines(orders, books, costs);
  const units = lines.reduce((s, l) => s + l.units, 0);
  const costed = lines.filter(l => l.cost !== null);
  const revenue = costed.reduce((s, l) => s + l.revenue, 0);
  const cost = costed.reduce((s, l) => s + (l.cost as number), 0);
  const costedUnits = costed.reduce((s, l) => s + l.units, 0);
  return { revenue, cost, profit: revenue - cost, margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null, costedUnits, units, coverage: units > 0 ? (costedUnits / units) * 100 : 0 };
}

export interface TitleRow {
  id: string; title: string; units: number; revenue: number; prevUnits: number; prevRevenue: number;
  views: number | null; viewToSale: number | null; profit: number | null; margin: number | null;
  stock: number | null; coverDays: number | null;
  /** Times put in the bag (once per visit); null until bag adds were recorded (18 October 2026). */
  adds: number | null;
  /** What the views/bag/bought numbers suggest (overviewSignals.titleFlag). */
  flag: TitleFlag;
}

/**
 * One row per title that sold (now or in the comparison window) or was viewed: sales, change, interest, profit and
 * stock. `views` is null when book views were never recorded, so "0 views" is never shown for missing data.
 */
export function titlePerformance(input: {
  current: Order[]; previous: Order[]; books: Book[]; costs: Record<string, number>;
  viewsById: Record<string, number> | null; stock: TitleStock[];
  addsById?: Record<string, number> | null;
}): TitleRow[] {
  const { current, previous, books, costs, viewsById, stock } = input;
  const addsById = input.addsById ?? null;
  const titles = new Map(books.map(b => [b.id, b.title || "Untitled"]));
  const rows = new Map<string, TitleRow>();
  const row = (id: string, title?: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, title: titles.get(id) || title || "Removed book", units: 0, revenue: 0, prevUnits: 0, prevRevenue: 0, views: viewsById ? 0 : null, viewToSale: null, profit: null, margin: null, stock: null, coverDays: null, adds: addsById ? 0 : null, flag: null };
      rows.set(id, r);
    }
    return r;
  };
  const costedRevenue = new Map<string, { revenue: number; cost: number }>();
  soldLines(current, books, costs).forEach(l => {
    const r = row(l.id, l.title); r.units += l.units; r.revenue += l.revenue;
    if (l.cost !== null) { const c = costedRevenue.get(l.id) || { revenue: 0, cost: 0 }; c.revenue += l.revenue; c.cost += l.cost; costedRevenue.set(l.id, c); }
  });
  soldLines(previous, books, costs).forEach(l => { const r = row(l.id, l.title); r.prevUnits += l.units; r.prevRevenue += l.revenue; });
  if (viewsById) Object.entries(viewsById).forEach(([id, n]) => { if (num(n) > 0 && titles.has(id)) row(id).views = num(n); });
  if (addsById) Object.entries(addsById).forEach(([id, n]) => { if (num(n) > 0 && titles.has(id)) row(id).adds = num(n); });
  const stockById = new Map(stock.map(s => [s.id, s]));
  rows.forEach(r => {
    if (r.views !== null && r.views > 0) r.viewToSale = (r.units / r.views) * 100;
    const c = costedRevenue.get(r.id);
    if (c) { r.profit = c.revenue - c.cost; r.margin = c.revenue > 0 ? (r.profit / c.revenue) * 100 : null; }
    const s = stockById.get(r.id);
    if (s) { r.stock = s.stock; r.coverDays = s.coverDays; }
    r.flag = titleFlag(r);
  });
  return [...rows.values()];
}

export type TitleSort = "revenue" | "units" | "growth" | "views" | "adds" | "conversion" | "profit" | "margin";
export const TITLE_SORTS: Array<{ id: TitleSort; label: string }> = [
  { id: "revenue", label: "Revenue" }, { id: "units", label: "Copies sold" }, { id: "growth", label: "Biggest change" },
  { id: "views", label: "Most viewed" }, { id: "adds", label: "Most added to bag" }, { id: "conversion", label: "Views → sale" }, { id: "profit", label: "Profit" }, { id: "margin", label: "Margin" },
];

export function sortTitles(rows: TitleRow[], by: TitleSort): TitleRow[] {
  const key = (r: TitleRow): number => {
    switch (by) {
      case "units": return r.units;
      case "growth": return Math.abs(r.revenue - r.prevRevenue);
      case "views": return r.views ?? -1;
      case "adds": return r.adds ?? -1;
      case "conversion": return r.viewToSale ?? -1;
      case "profit": return r.profit ?? -Infinity;
      case "margin": return r.margin ?? -Infinity;
      default: return r.revenue;
    }
  };
  return [...rows].sort((a, b) => key(b) - key(a) || b.revenue - a.revenue || a.title.localeCompare(b.title));
}

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
const m2 = (n: number | null) => (n === null ? "" : (Math.round(n * 100) / 100).toFixed(2));

/** The table as CSV (CSV-injection safe), for Overview › Titles › Download. */
export function titlesCsv(rows: TitleRow[], startKey: string, endKey: string): string {
  const head = ["Title", "Copies sold", "Net revenue (CAD)", "Copies before", "Net revenue before", "Product views", "Added to bag", "Views to sale %", "Gross profit", "Margin %", "In stock", "Days of stock", "Note"];
  return [cell(`Titles ${startKey} to ${endKey}`), head.map(cell).join(","), ...rows.map(r => [
    r.title, r.units, m2(r.revenue), r.prevUnits, m2(r.prevRevenue), r.views ?? "", r.adds ?? "", r.viewToSale === null ? "" : r.viewToSale.toFixed(1),
    m2(r.profit), r.margin === null ? "" : r.margin.toFixed(1), r.stock ?? "", r.coverDays ?? "", r.flag ? TITLE_FLAG_WORDS[r.flag].badge : "",
  ].map(cell).join(","))].join("\n");
}
