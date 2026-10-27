// The Overview's main chart: one point per day of the range (empty days included), each paired with the same
// position in the comparison window, then grouped into days, weeks or months. Revenue is net of partial refunds
// from real paid orders (overviewInsights.ts); visitors come from Google Analytics when it is connected, else the
// shop's own daily counters. Pure.
import { addDays, orderDay, refundedAmount, type Order } from "./overviewInsights";
import { bucketKey, bucketLabel, type Grain, type Range } from "./overviewRange";

export interface DayPoint {
  date: string; revenue: number; orders: number; units: number; visits: number;
  prevDate: string; prevRevenue: number; prevOrders: number; prevUnits: number; prevVisits: number;
}
export interface Bucket extends DayPoint { label: string; days: number }

export type ChartMetric = "revenue" | "orders" | "units" | "aov" | "visitors" | "conversion";
export const CHART_METRICS: Array<{ id: ChartMetric; label: string; kind: "money" | "count" | "percent"; needsTraffic?: boolean }> = [
  { id: "revenue", label: "Net revenue", kind: "money" },
  { id: "orders", label: "Orders", kind: "count" },
  { id: "units", label: "Books sold", kind: "count" },
  { id: "aov", label: "Average order", kind: "money" },
  { id: "visitors", label: "Visitors", kind: "count", needsTraffic: true },
  { id: "conversion", label: "Conversion", kind: "percent", needsTraffic: true },
];

const num = (v: unknown) => Number(v) || 0;
const copies = (o: Order) => (o.items || []).reduce((n: number, i: any) => n + num(i?.quantity), 0);

export function buildRangeSeries(paid: Order[], range: Range, visitsOn: (dayKey: string) => number): DayPoint[] {
  const byDay = new Map<string, { revenue: number; orders: number; units: number }>();
  paid.forEach(o => {
    const k = orderDay(o.createdAt); if (!k) return;
    const r = byDay.get(k) || { revenue: 0, orders: 0, units: 0 };
    r.revenue += Math.max(0, num(o.total) - refundedAmount(o)); r.orders += 1; r.units += copies(o);
    byDay.set(k, r);
  });
  const at = (k: string) => ({ ...(byDay.get(k) || { revenue: 0, orders: 0, units: 0 }), visits: visitsOn(k) || 0 });
  const out: DayPoint[] = [];
  for (let i = 0; i < range.days; i++) {
    const k = addDays(range.startKey, i);
    const p = addDays(range.prevStartKey, i);
    const cur = at(k);
    const prev = p <= range.prevEndKey ? at(p) : { revenue: 0, orders: 0, units: 0, visits: 0 };
    out.push({ date: k, ...cur, prevDate: p, prevRevenue: prev.revenue, prevOrders: prev.orders, prevUnits: prev.units, prevVisits: prev.visits });
  }
  return out;
}

const SUM_FIELDS = ["revenue", "orders", "units", "visits", "prevRevenue", "prevOrders", "prevUnits", "prevVisits"] as const;

/** Groups day points into weeks (Monday) or months; a day grain returns the points with labels. */
export function bucketSeries(points: DayPoint[], grain: Grain): Bucket[] {
  const out: Bucket[] = [];
  for (const p of points) {
    const key = bucketKey(p.date, grain);
    let b = out[out.length - 1];
    if (!b || b.date !== key) {
      b = { ...p, date: key, prevDate: p.prevDate, label: bucketLabel(key, grain), days: 0 };
      SUM_FIELDS.forEach(f => { (b as any)[f] = 0; });
      out.push(b);
    }
    SUM_FIELDS.forEach(f => { (b as any)[f] += p[f]; });
    b.days += 1;
  }
  return out;
}

/** A bucket's value for a metric (null = nothing to divide by, drawn as a gap). */
export function metricValue(b: Pick<DayPoint, typeof SUM_FIELDS[number]>, metric: ChartMetric, prev = false): number | null {
  const g = (f: "revenue" | "orders" | "units" | "visits") => (prev ? b[`prev${f[0].toUpperCase()}${f.slice(1)}` as keyof typeof b] : b[f]) as number;
  switch (metric) {
    case "revenue": return g("revenue");
    case "orders": return g("orders");
    case "units": return g("units");
    case "visitors": return g("visits");
    case "aov": return g("orders") > 0 ? g("revenue") / g("orders") : null;
    case "conversion": return g("visits") > 0 ? (g("orders") / g("visits")) * 100 : null;
  }
}

/** Total, per-day average and best bucket for the chart's summary line. */
export function seriesSummary(buckets: Bucket[], metric: ChartMetric) {
  const total = buckets.reduce((s, b) => ({ revenue: s.revenue + b.revenue, orders: s.orders + b.orders, units: s.units + b.units, visits: s.visits + b.visits,
    prevRevenue: s.prevRevenue + b.prevRevenue, prevOrders: s.prevOrders + b.prevOrders, prevUnits: s.prevUnits + b.prevUnits, prevVisits: s.prevVisits + b.prevVisits }),
  { revenue: 0, orders: 0, units: 0, visits: 0, prevRevenue: 0, prevOrders: 0, prevUnits: 0, prevVisits: 0 });
  let best: Bucket | null = null, bestValue = -Infinity;
  for (const b of buckets) { const v = metricValue(b, metric); if (v !== null && v > bestValue) { bestValue = v; best = b; } }
  const days = buckets.reduce((s, b) => s + b.days, 0);
  const value = metricValue(total, metric);
  const additive = metric === "revenue" || metric === "orders" || metric === "units" || metric === "visitors";
  return { value, previous: metricValue(total, metric, true), perDay: additive && days > 0 && value !== null ? value / days : null, best: best && bestValue > 0 ? { label: best.label, value: bestValue } : null };
}

/**
 * The rest of the current calendar month at this month's daily pace — a labelled projection, not a forecast model.
 * null before the month has 3 days of history (too little to say anything).
 */
export function monthPace(paid: Order[], todayKey: string): { soFar: number; projected: number; daysIn: number; daysInMonth: number } | null {
  const first = `${todayKey.slice(0, 7)}-01`;
  const daysIn = Number(todayKey.slice(8, 10));
  if (daysIn < 3) return null;
  const [y, m] = todayKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const soFar = paid.reduce((s, o) => { const k = orderDay(o.createdAt); return k >= first && k <= todayKey ? s + Math.max(0, num(o.total) - refundedAmount(o)) : s; }, 0);
  return { soFar, projected: (soFar / daysIn) * daysInMonth, daysIn, daysInMonth };
}
