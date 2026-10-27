// The records behind the Overview's figures: each figure row can open to list the orders (or books) that make it up.
// Pure: every function takes the same orders the figure was computed from and picks the ones that belong to one line.
import { refundedAmount, type Book, type Order } from "./overviewInsights";
import { methodOf } from "./overviewCohorts";
import type { DrillItem } from "./OverviewParts";

const num = (v: unknown) => Number(v) || 0;
const ts = (v: unknown) => { const t = new Date(v as any).getTime(); return Number.isNaN(t) ? 0 : t; };
const money = (n: number) => `CA$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const when = (v: unknown) => {
  const t = ts(v);
  return t ? new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }) : "";
};
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Toronto" });

/** What an order brought in after partial refunds (the Overview's revenue rule). */
export const orderNet = (o: Order) => Math.max(0, num(o.total) - refundedAmount(o));

/** The order's books as one line: "2 × Poems (Signed); Zine". */
export function booksLine(o: Order) {
  return (o.items || []).map((i: any) => {
    const q = num(i.quantity) || 1;
    const ed = String(i.variantName || "").trim();
    return `${q > 1 ? `${q} × ` : ""}${i.title || i.name || "Untitled"}${ed ? ` (${ed})` : ""}`;
  }).join("; ") || "No books listed";
}

/**
 * One order as a drill-down line: who bought, when, what, from where and how they paid, with its net as the value.
 * `extra` adds a fact that explains why the order is on this list (e.g. the discount given or the time to ship).
 */
export function orderItem(o: Order, extra?: string): DrillItem {
  const who = String(o.customer?.name || "").trim();
  const email = String(o.customer?.email || "").trim();
  const country = String(o.customer?.address?.country || "").trim();
  const facts = [when(o.paidAt || o.createdAt), country, methodOf(o), num(o.discount) > 0 ? `${money(num(o.discount))} off` : "", refundedAmount(o) > 0 ? `${money(refundedAmount(o))} refunded` : "", extra || ""].filter(Boolean);
  return {
    key: String(o.id),
    title: `${who || email || "Customer"} · #${o.id}`,
    sub: `${booksLine(o)}\n${facts.join(" · ")}`,
    value: money(orderNet(o)),
    href: o.id ? `#orders/${encodeURIComponent(String(o.id))}` : undefined,
    tone: refundedAmount(o) > 0 ? "danger" : undefined,
  };
}

/** Newest first, as drill-down lines. */
export const orderItems = (orders: Order[], extra?: (o: Order) => string | undefined) =>
  [...orders].sort((a, b) => ts(b.paidAt || b.createdAt) - ts(a.paidAt || a.createdAt)).map(o => orderItem(o, extra?.(o)));

// ─── Which orders belong to one line ──────────────────────────────────────────────────────────────────────────────

export const ordersWithBook = (orders: Order[], bookId: string) => orders.filter(o => (o.items || []).some((i: any) => i.id === bookId));

/** Units of one title in an order, for "2 copies" on a best seller's list. */
export const copiesOf = (o: Order, bookId: string) => (o.items || []).filter((i: any) => i.id === bookId).reduce((n: number, i: any) => n + num(i.quantity), 0);

/** Same format rule as formatMix: the line's own format, else the book's, else "Unspecified". */
export function ordersWithFormat(orders: Order[], books: Book[], format: string) {
  const byId = new Map(books.map(b => [b.id, b]));
  return orders.filter(o => (o.items || []).some((i: any) => (i.format || byId.get(i.id)?.format || "Unspecified") === format));
}

/** Same country rule as topCountries ("Unknown" when no address). */
export const ordersToCountry = (orders: Order[], country: string) =>
  orders.filter(o => (String(o.customer?.address?.country || "").trim() || "Unknown") === country);

/** Orders placed on a weekday (Mon…Sun), Toronto time, like weekdayMix. */
export const ordersOnWeekday = (orders: Order[], day: string) =>
  orders.filter(o => { const t = ts(o.createdAt); return t > 0 && WEEKDAY.format(t) === day; });

/** Same key as discountPerformance: the code upper-cased, or "#<id>" for an automatic offer. */
export const ordersWithCode = (orders: Order[], key: string) => orders.filter(o => {
  const a = o.appliedDiscount || {};
  return (a.automatic && a.id ? `#${a.id}` : String(a.code || "").trim().toUpperCase()) === key;
});

/** Orders with a book in a shop category, by the same rule as categoryBreakdown (no category = PUBLICATIONS). */
export function ordersInCategory(orders: Order[], books: Book[], name: string) {
  const byId = new Map(books.map(b => [b.id, b]));
  const key = name.toUpperCase().trim();
  return orders.filter(o => (o.items || []).some((i: any) => {
    const cats: string[] = byId.get(i.id)?.categories || byId.get(i.id)?.genres || [];
    return (cats.length ? cats : ["PUBLICATIONS"]).some(c => String(c).toUpperCase().trim() === key);
  }));
}

export const ordersPaidBy = (orders: Order[], method: string) => orders.filter(o => methodOf(o) === method);
export const ordersInCurrency = (orders: Order[], cur: string) => orders.filter(o => String(o.checkoutCurrency || o.expectedCurrency || "CAD").toUpperCase() === cur);
export const discountedOrders = (orders: Order[]) => orders.filter(o => num(o.discount) > 0);
export const refundedOrders = (orders: Order[]) => orders.filter(o => refundedAmount(o) > 0);
export const giftCardOrders = (orders: Order[]) => orders.filter(o => num(o.giftCardAmount) > 0);

/** Hours from payment to dispatch, as operations() measures it; null when not shipped. */
export function hoursToShip(o: Order): number | null {
  const paid = Date.parse(o.paidAt || o.createdAt || ""), sent = Date.parse(o.shippedAt || "");
  return Number.isNaN(paid) || Number.isNaN(sent) || sent < paid ? null : (sent - paid) / 3_600_000;
}
export const shipTimeText = (h: number) => (h < 48 ? `${Math.round(h)} hours to ship` : `${(h / 24).toFixed(1)} days to ship`);

/** Shipped orders, slowest first (the ones worth looking at). */
export const shippedSlowestFirst = (orders: Order[]) =>
  orders.filter(o => hoursToShip(o) !== null).sort((a, b) => (hoursToShip(b) as number) - (hoursToShip(a) as number));

/** Titles in a set of orders, most revenue first: what a country, weekday or code actually sold. */
export function titlesIn(orders: Order[]): DrillItem[] {
  const m = new Map<string, { title: string; units: number; revenue: number; orders: number }>();
  orders.forEach(o => {
    const seen = new Set<string>();
    (o.items || []).forEach((i: any) => {
      const k = String(i.id || i.title || "?");
      const r = m.get(k) || { title: String(i.title || i.name || "Untitled"), units: 0, revenue: 0, orders: 0 };
      r.units += num(i.quantity); r.revenue += num(i.quantity) * num(i.price);
      if (!seen.has(k)) { r.orders += 1; seen.add(k); }
      m.set(k, r);
    });
  });
  return [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([k, r]) => ({
    key: k, title: r.title, sub: `${r.units} sold in ${r.orders} order${r.orders === 1 ? "" : "s"}`, value: money(r.revenue),
  }));
}

/**
 * Day-by-day counts behind a shop-counter figure: `field` is the daily map (e.g. "searches"), `key` one entry of it,
 * or a fixed-key map entry such as funnel.view. Newest day first; days with nothing are left out.
 */
export function countsByDay(daily: Array<Record<string, any>>, field: string, key: string, unit = "time"): DrillItem[] {
  return daily.map(d => ({ date: String(d?.date || ""), n: num(d?.[field]?.[key]) })).filter(r => r.date && r.n > 0)
    .sort((a, b) => b.date.localeCompare(a.date)).map(r => ({
      key: r.date,
      title: new Date(`${r.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
      value: `${r.n.toLocaleString()} ${r.n === 1 ? unit : /(s|sh|ch)$/.test(unit) ? `${unit}es` : `${unit}s`}`,
    }));
}
