// Pure traffic, marketing and audience calculations for the admin Overview.
// Inputs are the daily `analytics/<date>` docs and the paid, non-test orders already loaded by the page.
// Nothing is estimated: a signal that was never recorded is reported as missing (`recordedSince` is null), not as 0.
import { addDays, dayOf, isRealPaidOrder, orderDay, shopDayKey, trafficPeriodKeys, refundedAmount, type Book, type Order } from "./overviewInsights";
import { analyticsKey } from "../../lib/analyticsKeys";

export const SHOP_TIME_ZONE = "America/Toronto";

export type Daily = Record<string, any>;
const num = (v: unknown) => Number(v) || 0;

/** Daily docs inside the period's calendar days, and inside the equally long block before it. */
export function dailyWindow(daily: Daily[], days: number, now = Date.now()) {
  // Daily docs are keyed by UTC day (analytics/<YYYY-MM-DD>), so traffic windows count UTC days.
  const { startKey, prevStartKey, endKey } = trafficPeriodKeys(days, now);
  const key = (d: Daily) => dayOf(d.date);
  return {
    current: daily.filter(d => key(d) >= startKey && key(d) <= endKey),
    previous: daily.filter(d => key(d) >= prevStartKey && key(d) < startKey),
    // The earliest recorded day, so a 1-year view can say "traffic recorded for 41 days" instead of pretending.
    firstKey: daily.map(key).filter(Boolean).sort()[0] || null,
    startKey, prevStartKey, endKey,
  };
}

/** How many daily traffic docs a period needs: the period plus the equally long block before it (and a day of slack). */
export const dailyDocsNeeded = (days: number) => Math.min(800, Math.max(70, days * 2 + 3));

export const sumField = (rows: Daily[], field: string) => rows.reduce((s, d) => s + num(d[field]), 0);

/** Adds up a `{ key: count }` map across days (sources, devices, searches, bookViews …). */
export function sumMap(rows: Daily[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of rows) {
    const m = d?.[field];
    if (!m || typeof m !== "object") continue;
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + num(v);
  }
  return out;
}

export const rankMap = (m: Record<string, number>, limit = 8) =>
  Object.entries(m).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([key, count]) => ({ key, count }));

/** First day a signal was recorded at all — panels show "Recorded since …" and never a made-up zero. */
export function recordedSince(daily: Daily[], field: string): string | null {
  const days = daily.filter(d => d?.[field] && typeof d[field] === "object" && Object.keys(d[field]).length > 0).map(d => dayOf(d.date)).filter(Boolean).sort();
  return days[0] || null;
}

/** Share of visitors who ended in a paid order, from the same orders the revenue figures use. */
export const conversionRate = (paidOrders: number, visits: number) => (visits > 0 ? (paidOrders / visits) * 100 : 0);

export function funnelTotals(rows: Daily[]) {
  const f = (k: string) => rows.reduce((s, d) => s + num(d.funnel?.[k]), 0);
  return { view: f("view"), add_to_cart: f("add_to_cart"), checkout_start: f("checkout_start"), purchase: f("purchase") };
}

export const FUNNEL_STEPS = [
  { key: "view", label: "Product views" },
  { key: "add_to_cart", label: "Added to cart" },
  { key: "checkout_start", label: "Started checkout" },
  { key: "purchase", label: "Completed purchase" },
] as const;

/** Each step with its share of the step before it (`ofPrevious`) and of the first step (`ofFirst`). */
export function funnelRates(f: ReturnType<typeof funnelTotals>) {
  return FUNNEL_STEPS.map((s, i) => {
    const count = f[s.key];
    const before = i === 0 ? null : f[FUNNEL_STEPS[i - 1].key];
    return {
      ...s, count,
      ofPrevious: before === null ? null : before > 0 ? (count / before) * 100 : null,
      ofFirst: f.view > 0 ? (count / f.view) * 100 : null,
    };
  });
}

// Stored under the same key the storefront used for the visit ("duckduckgo.com" -> "duckduckgo com"), so a source's visits and orders join.
export const sourceOf = (o: Order) => analyticsKey(String(o.referralSource || "direct").trim().toLowerCase()) || "direct";

export interface SourceRow { source: string; visits: number; orders: number; revenue: number; conversion: number | null }

/** Visits per source (recorded on the storefront) beside the paid orders and revenue that carried the same source. */
export function sourcePerformance(visitsBySource: Record<string, number>, orders: Order[]): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  const row = (source: string) => { let r = rows.get(source); if (!r) { r = { source, visits: 0, orders: 0, revenue: 0, conversion: null }; rows.set(source, r); } return r; };
  Object.entries(visitsBySource).forEach(([s, n]) => { row(analyticsKey(s.trim().toLowerCase()) || "direct").visits += num(n); });
  orders.filter(isRealPaidOrder).forEach(o => { const r = row(sourceOf(o)); r.orders += 1; r.revenue += Math.max(0, num(o.total) - refundedAmount(o)); });
  const out = [...rows.values()];
  out.forEach(r => { r.conversion = r.visits > 0 ? (r.orders / r.visits) * 100 : null; });
  return out.sort((a, b) => b.visits - a.visits || b.revenue - a.revenue || a.source.localeCompare(b.source));
}

export interface BookInterest { id: string; title: string; views: number; sold: number; viewToSale: number | null }

/** Product-page views beside units sold. `watch` = looked at a lot, never bought in the period. */
export function bookInterest(viewsById: Record<string, number>, orders: Order[], books: Book[], minViews = 5) {
  const titles = new Map(books.map(b => [b.id, b.title || "Untitled"]));
  const sold = new Map<string, number>();
  orders.forEach(o => (o.items || []).forEach((i: any) => { if (i.id) sold.set(i.id, (sold.get(i.id) || 0) + num(i.quantity)); }));
  const rows: BookInterest[] = Object.entries(viewsById).filter(([, n]) => n > 0).map(([id, views]) => ({
    id, title: titles.get(id) || "Removed book", views, sold: sold.get(id) || 0,
    viewToSale: views > 0 ? ((sold.get(id) || 0) / views) * 100 : null,
  })).sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
  return { rows, watch: rows.filter(r => r.views >= minViews && r.sold === 0) };
}

export interface SeriesPoint { date: string; revenue: number; orders: number; visits: number; prevRevenue: number; prevOrders: number; prevVisits: number }

/**
 * One point per calendar day (zero days included) for the last `days` days, each carrying the same day of the previous
 * block as `prev*`, so the chart can overlay "compared with before". Revenue is net of refunds, from paid orders.
 */
export function buildSeries(paid: Order[], daily: Daily[], days: number, now = Date.now()): SeriesPoint[] {
  const revenue = new Map<string, { revenue: number; orders: number }>();
  paid.forEach(o => {
    const k = orderDay(o.createdAt); if (!k) return;
    const r = revenue.get(k) || { revenue: 0, orders: 0 };
    r.revenue += Math.max(0, num(o.total) - refundedAmount(o)); r.orders += 1; revenue.set(k, r);
  });
  const visits = new Map<string, number>();
  daily.forEach(d => { const k = dayOf(d.date); if (k) visits.set(k, (visits.get(k) || 0) + num(d.visits)); });
  const at = (k: string) => ({ revenue: revenue.get(k)?.revenue || 0, orders: revenue.get(k)?.orders || 0, visits: visits.get(k) || 0 });
  const today = shopDayKey(now);
  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = addDays(today, -i), p = addDays(today, -(i + days));
    const cur = at(k), prev = at(p);
    out.push({ date: k, ...cur, prevRevenue: prev.revenue, prevOrders: prev.orders, prevVisits: prev.visits });
  }
  return out;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Orders and revenue by day of the week, in the shop's own time zone (an evening order is still that evening). */
export function weekdayMix(orders: Order[], timeZone = SHOP_TIME_ZONE) {
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
  const rows = WEEKDAYS.map(day => ({ day, orders: 0, revenue: 0 }));
  orders.forEach(o => {
    const t = new Date(o.createdAt ?? "").getTime(); if (Number.isNaN(t)) return;
    const r = rows.find(x => x.day === fmt.format(t)); if (!r) return;
    r.orders += 1; r.revenue += Math.max(0, num(o.total) - refundedAmount(o));
  });
  return rows;
}

/** What shoppers who left a cart did next. Only carts started inside the period count. */
export function cartRecovery(carts: Array<Record<string, any>>, startMs: number) {
  const inPeriod = carts.filter(c => { const t = new Date(c.createdAt || c.updatedAt).getTime(); return !Number.isNaN(t) && t >= startMs; });
  const recovered = inPeriod.filter(c => c.recovered === true);
  const open = inPeriod.filter(c => c.recovered !== true);
  const sum = (rows: Array<Record<string, any>>) => rows.reduce((s, c) => s + num(c.subtotal), 0);
  return {
    total: inPeriod.length, recovered: recovered.length, reminded: inPeriod.filter(c => c.notified === true).length,
    recoveryRate: inPeriod.length ? (recovered.length / inPeriod.length) * 100 : 0,
    openValue: sum(open), recoveredValue: sum(recovered),
  };
}

export interface CartRow {
  id: string; email: string; name: string; place: string; value: number; leftAt: string; updatedAt: string;
  books: Array<{ title: string; edition: string; quantity: number; price: number }>;
  /** "sent" = a reminder email went out; "skipped" = the reminder was held back (already sent to that address). */
  reminder: "sent" | "skipped" | "none"; remindedAt: string;
  recovered: boolean; recoveredAt: string; orderId: string | null;
}

/**
 * The carts behind `cartRecovery`'s figures, newest first: who, which books, the bag's value, the reminder and whether
 * they came back. A came-back cart is linked to its order by the order's `cartId`, else the same email's first order
 * placed after the cart was started.
 */
export function cartRows(carts: Array<Record<string, any>>, startMs: number, orders: Order[] = []): CartRow[] {
  const ms = (v: unknown) => { const t = new Date(v as any).getTime(); return Number.isNaN(t) ? 0 : t; };
  return carts.filter(c => { const t = ms(c.createdAt || c.updatedAt); return t > 0 && t >= startMs; }).map(c => {
    const id = String(c.id || c.cartKey || "");
    const email = String(c.email || "").toLowerCase();
    const started = ms(c.createdAt || c.updatedAt);
    let orderId: string | null = null;
    if (c.recovered === true) {
      const byCart = orders.find(o => (o as any).cartId && ((o as any).cartId === id || (o as any).cartId === c.cartKey));
      const byEmail = orders.filter(o => String((o as any).customer?.email || "").toLowerCase() === email && ms(o.createdAt) >= started)
        .sort((a, b) => ms(a.createdAt) - ms(b.createdAt))[0];
      orderId = (byCart || byEmail)?.id || null;
    }
    const name = String(c.customer?.name || "").trim();
    const a = c.customer?.address || {};
    const place = [a.city, a.state, a.country].map((v: unknown) => String(v || "").trim()).filter(Boolean).join(", ");
    return {
      id, email, name, place, value: num(c.subtotal), leftAt: String(c.createdAt || c.updatedAt || ""), updatedAt: String(c.updatedAt || ""),
      books: (Array.isArray(c.items) ? c.items : []).map((i: any) => ({ title: String(i?.title || "Untitled"), edition: String(i?.variantName || ""), quantity: num(i?.quantity) || 1, price: num(i?.price) })),
      reminder: (c.notified === true ? (c.notifySkipped ? "skipped" : "sent") : "none") as CartRow["reminder"], remindedAt: String(c.notifiedAt || ""),
      recovered: c.recovered === true, recoveredAt: String(c.recoveredAt || ""), orderId,
    };
  }).sort((a, b) => ms(b.leftAt) - ms(a.leftAt));
}

export interface DemandRow { bookId: string; title: string; edition: string; waiting: number; stock: number | null }

/** People waiting on "Notify me when back in stock", by title and edition — a reprint signal. */
export function stockDemand(alerts: Array<Record<string, any>>, books: Book[]): DemandRow[] {
  const byId = new Map(books.map(b => [b.id, b]));
  const rows = new Map<string, DemandRow>();
  alerts.filter(a => a.status === "waiting" && a.bookId).forEach(a => {
    const edition = String(a.variantName || "");
    const key = `${a.bookId}\u0000${edition}`;
    const book = byId.get(a.bookId);
    const r = rows.get(key) || { bookId: a.bookId, title: book?.title || a.bookTitle || "Removed book", edition, waiting: 0, stock: book ? num(book.stockLevel) : null };
    r.waiting += 1; rows.set(key, r);
  });
  return [...rows.values()].sort((a, b) => b.waiting - a.waiting || a.title.localeCompare(b.title));
}

/** Category names from `design.categories` (strings or `{ name }` objects), deduplicated, in menu order. */
export function categoryNames(raw: unknown): string[] {
  const list = Array.isArray(raw) && raw.length ? raw : ["PUBLICATIONS", "EPHEMERA", "IMPRINT", "OUT OF PRINT"];
  const seen = new Set<string>();
  return list.map((c: any) => String(typeof c === "string" ? c : c?.name || "").trim()).filter(n => {
    const k = n.toUpperCase(); if (!n || seen.has(k)) return false; seen.add(k); return true;
  });
}

/** Sales and recorded visits per shop category for the period (a book in two categories counts in both). */
export function categoryBreakdown(orders: Order[], books: Book[], names: string[], dailyRows: Daily[]) {
  const byId = new Map(books.map(b => [b.id, b]));
  const sales = new Map<string, { sold: number; revenue: number }>();
  orders.forEach(o => (o.items || []).forEach((i: any) => {
    const cats: string[] = byId.get(i.id)?.categories || byId.get(i.id)?.genres || [];
    (cats.length ? cats : ["PUBLICATIONS"]).forEach(c => {
      const k = String(c).toUpperCase().trim();
      const s = sales.get(k) || { sold: 0, revenue: 0 };
      s.sold += num(i.quantity); s.revenue += num(i.quantity) * num(i.price); sales.set(k, s);
    });
  }));
  const views = sumMap(dailyRows, "categoryViews");
  const viewsByKey: Record<string, number> = {};
  Object.entries(views).forEach(([k, n]) => { const u = k.toUpperCase().trim(); viewsByKey[u] = (viewsByKey[u] || 0) + n; });
  return names.map(name => {
    const k = name.toUpperCase();
    return { name, views: viewsByKey[k] || 0, sold: sales.get(k)?.sold || 0, revenue: sales.get(k)?.revenue || 0 };
  });
}

// Pure and shared with the storefront's analytics writes, so they live outside the admin code (see lib/analyticsKeys.ts).
export { cleanSearchTerm, deviceOf } from "../../lib/analyticsKeys";
