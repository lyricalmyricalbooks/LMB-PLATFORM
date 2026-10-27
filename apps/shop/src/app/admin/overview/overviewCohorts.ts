// Customer cohorts and the shop's operating figures for the Overview. Pure; from real paid orders only.
import { orderDay, refundedAmount, type Order } from "./overviewInsights";

const DAY = 86_400_000;
const num = (v: unknown) => Number(v) || 0;
const emailOf = (o: Order) => String(o.customer?.email || "").trim().toLowerCase();
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
const monthKey = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

export interface CohortRow {
  /** "2026-09": the month of these customers' first order (Toronto). */
  month: string; customers: number; revenue: number;
  /** `cells[k]` = % of the cohort who bought again k+1 months after their first month; null = that month hasn't happened. */
  cells: Array<number | null>;
}

/** Monthly cohorts (newest first, at most `months`), with repeat-purchase rates for the next `span` months. */
export function cohortRetention(paid: Order[], todayKey: string, months = 12, span = 6): CohortRow[] {
  const byCustomer = new Map<string, Set<number>>();
  const firstMonth = new Map<string, number>();
  const spend = new Map<string, number>();
  for (const o of paid) {
    const e = emailOf(o); const day = orderDay(o.createdAt);
    if (!e || !day) continue;
    const mi = monthIndex(day);
    if (!byCustomer.has(e)) byCustomer.set(e, new Set());
    byCustomer.get(e)!.add(mi);
    firstMonth.set(e, Math.min(firstMonth.get(e) ?? mi, mi));
    spend.set(e, (spend.get(e) || 0) + Math.max(0, num(o.total) - refundedAmount(o)));
  }
  const now = monthIndex(todayKey);
  const cohorts = new Map<number, string[]>();
  firstMonth.forEach((mi, e) => { if (now - mi < months) cohorts.set(mi, [...(cohorts.get(mi) || []), e]); });
  return [...cohorts.entries()].sort((a, b) => b[0] - a[0]).map(([mi, people]) => ({
    month: monthKey(mi),
    customers: people.length,
    revenue: people.reduce((s, e) => s + (spend.get(e) || 0), 0),
    cells: Array.from({ length: span }, (_, k) => {
      const target = mi + k + 1;
      if (target > now) return null;
      return (people.filter(e => byCustomer.get(e)!.has(target)).length / people.length) * 100;
    }),
  }));
}

/** How long customers take to come back: median days to a second order, and the share back within 90 days. */
export function repeatTiming(paid: Order[], now = Date.now()) {
  const times = new Map<string, number[]>();
  for (const o of paid) {
    const e = emailOf(o); const t = Date.parse(o.createdAt ?? "");
    if (!e || Number.isNaN(t)) continue;
    times.set(e, [...(times.get(e) || []), t]);
  }
  const gaps: number[] = [];
  let eligible = 0, within90 = 0;
  times.forEach(ts => {
    ts.sort((a, b) => a - b);
    if (ts.length > 1) gaps.push((ts[1] - ts[0]) / DAY);
    // Only customers whose first order is at least 90 days old can have come back within 90 days.
    if (now - ts[0] >= 90 * DAY) { eligible++; if (ts.length > 1 && ts[1] - ts[0] <= 90 * DAY) within90++; }
  });
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null;
  return { medianDays: median === null ? null : Math.round(median), returned: gaps.length, within90Rate: eligible ? (within90 / eligible) * 100 : null, eligible };
}

/** New vs returning revenue in the period: a returning customer bought before the period began. */
export function newVsReturningRevenue(paid: Order[], current: Order[], startKey: string) {
  const before = new Set(paid.filter(o => { const k = orderDay(o.createdAt); return k && k < startKey; }).map(emailOf).filter(Boolean));
  let fresh = 0, returning = 0;
  current.forEach(o => { const v = Math.max(0, num(o.total) - refundedAmount(o)); if (before.has(emailOf(o))) returning += v; else fresh += v; });
  return { fresh, returning, returningShare: fresh + returning > 0 ? (returning / (fresh + returning)) * 100 : 0 };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const methodOf = (o: Order) => {
  const m = String(o.paymentMethod || "").toLowerCase();
  if (o.paypalOrderId || /paypal/.test(m)) return "PayPal";
  if (num(o.total) === 0) return "Free / gift card";
  if (o.stripePaymentIntentId || o.stripeCheckoutSessionId || /stripe|card|apple|google/.test(m)) return "Card";
  return String(o.paymentMethod || "Other").slice(0, 40) || "Other";
};

/** How fast orders ship, how customers pay, and in what currency — for the period's paid orders. */
export function operations(current: Order[]) {
  const hours: number[] = [];
  let shippedWithin2Days = 0;
  current.forEach(o => {
    const paid = Date.parse(o.paidAt || o.createdAt || ""), sent = Date.parse(o.shippedAt || "");
    if (Number.isNaN(paid) || Number.isNaN(sent) || sent < paid) return;
    const h = (sent - paid) / 3_600_000; hours.push(h);
    if (h <= 48) shippedWithin2Days++;
  });
  const tally = (f: (o: Order) => string) => {
    const m = new Map<string, { key: string; orders: number; revenue: number }>();
    current.forEach(o => { const k = f(o); const r = m.get(k) || { key: k, orders: 0, revenue: 0 }; r.orders++; r.revenue += Math.max(0, num(o.total) - refundedAmount(o)); m.set(k, r); });
    return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
  };
  return {
    shipped: hours.length,
    medianHoursToShip: median(hours),
    within2DaysRate: hours.length ? (shippedWithin2Days / hours.length) * 100 : null,
    payments: tally(methodOf),
    currencies: tally(o => String(o.checkoutCurrency || o.expectedCurrency || "CAD").toUpperCase()),
    partlyRefunded: current.filter(o => num(o.refundedAmountMinor) > 0).length,
  };
}

const HOUR_FMT = new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", weekday: "short", timeZone: "America/Toronto" });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Orders by weekday × hour (Toronto): rows Mon…Sun, 24 columns each. */
export function hourHeatmap(current: Order[]) {
  const grid = DAYS.map(day => ({ day, hours: Array.from({ length: 24 }, () => 0) }));
  current.forEach(o => {
    const t = Date.parse(o.createdAt ?? ""); if (Number.isNaN(t)) return;
    const parts = HOUR_FMT.formatToParts(t);
    const wd = parts.find(p => p.type === "weekday")?.value?.slice(0, 3) || "";
    const h = Number(parts.find(p => p.type === "hour")?.value) % 24;
    const row = grid.find(r => r.day === wd);
    if (row && Number.isFinite(h)) row.hours[h]++;
  });
  return { grid, max: Math.max(0, ...grid.flatMap(r => r.hours)) };
}
