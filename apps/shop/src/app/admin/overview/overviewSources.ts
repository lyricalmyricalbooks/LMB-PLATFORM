// Where the Overview's traffic figures come from: Google Analytics 4 when it is connected (Settings › General ›
// Google Analytics), otherwise the shop's own daily counters (`analytics/<date>`, UTC-keyed). One shape for both,
// so every panel reads visitors, the funnel and visitors per day the same way. Pure.
import { addDays, dayOf } from "./overviewInsights";
import type { Range } from "./overviewRange";
import type { Ga4Report } from "../googleAnalytics";

export type Funnel = { view: number; add_to_cart: number; checkout_start: number; purchase: number };
export interface TrafficFigures {
  source: "google" | "shop";
  visitors: { cur: number; prev: number };
  sessions: { cur: number; prev: number } | null;
  funnel: Funnel; prevFunnel: Funnel;
  /** Visitors on a Toronto day of the range or its comparison window. */
  visitsOn: (dayKey: string) => number;
  /** First day the shop's own counter has anything (null for Google, which keeps its own history). */
  firstKey: string | null;
}

const num = (v: unknown) => Number(v) || 0;
const sumFunnel = (rows: any[]): Funnel => {
  const f = (k: keyof Funnel) => rows.reduce((s, d) => s + num(d?.funnel?.[k]), 0);
  return { view: f("view"), add_to_cart: f("add_to_cart"), checkout_start: f("checkout_start"), purchase: f("purchase") };
};
const gaFunnel = (events: Record<string, number> = {}): Funnel => ({
  view: num(events.view_item), add_to_cart: num(events.add_to_cart), checkout_start: num(events.begin_checkout), purchase: num(events.purchase),
});

/** The shop's daily docs between two Toronto days (inclusive), read at `shift` days later (UTC keys). */
export function shopRowsIn(daily: any[], from: string, to: string, shift: number): any[] {
  const lo = addDays(from, shift), hi = addDays(to, shift);
  return daily.filter(d => { const k = dayOf(d?.date); return k !== "" && k >= lo && k <= hi; });
}

/** The shop's own counters for a range. `shift` maps Toronto keys onto the UTC-keyed docs (overviewRange.trafficShift). */
export function shopTraffic(daily: any[], range: Range, shift: number): TrafficFigures {
  const byKey = new Map<string, any[]>();
  daily.forEach(d => { const k = dayOf(d?.date); if (k) byKey.set(k, [...(byKey.get(k) || []), d]); });
  const rowsBetween = (from: string, to: string) => {
    const out: any[] = [];
    for (let k = addDays(from, shift), end = addDays(to, shift); k <= end; k = addDays(k, 1)) out.push(...(byKey.get(k) || []));
    return out;
  };
  const cur = rowsBetween(range.startKey, range.endKey), prev = rowsBetween(range.prevStartKey, range.prevEndKey);
  const visits = (rows: any[]) => rows.reduce((s, d) => s + num(d.visits), 0);
  return {
    source: "shop",
    visitors: { cur: visits(cur), prev: visits(prev) },
    sessions: null,
    funnel: sumFunnel(cur), prevFunnel: sumFunnel(prev),
    visitsOn: (k) => visits(byKey.get(addDays(k, shift)) || []),
    firstKey: [...byKey.keys()].sort()[0] || null,
  };
}

/** Google Analytics' figures for the same range (its days are the property's time zone — set it to Toronto). */
export function googleTraffic(report: Ga4Report): TrafficFigures {
  const byDay = new Map<string, number>();
  [...(report.byDate?.current || []), ...(report.byDate?.previous || [])].forEach(d => byDay.set(String(d.date), num(d.activeUsers)));
  const t = report.totals || { current: {}, previous: {} };
  return {
    source: "google",
    visitors: { cur: num(t.current?.activeUsers), prev: num(t.previous?.activeUsers) },
    sessions: { cur: num(t.current?.sessions), prev: num(t.previous?.sessions) },
    funnel: gaFunnel(report.events?.current), prevFunnel: gaFunnel(report.events?.previous),
    visitsOn: (k) => byDay.get(k) || 0,
    firstKey: null,
  };
}

/** Google answered but recorded no visitor on any day of the chosen window (no daily rows, no people). */
export function googleRecordedNothing(report: Ga4Report): boolean {
  return !(report.byDate?.current || []).some(d => num(d.activeUsers) > 0) && num(report.totals?.current?.activeUsers) === 0;
}

/**
 * Why the visitor figures may not be Google's, or may be missing:
 * - `fallback`: Google recorded nobody for these days while the shop's own counter did, so the counter is shown;
 * - `empty`: Google recorded nobody and the counter has nothing either — "nothing recorded", never a real zero;
 * - `mismatch` (with either, or alone): the GA property doesn't hold the tag the storefront sends.
 */
export interface TrafficGap { kind: "fallback" | "empty" | null; mismatch: { tag: string; propertyTags: string[] } | null }

/**
 * The traffic every panel reads. Google's figures when it is connected and recorded visitors; the shop's own counter
 * when Google recorded nobody but the counter did (a silent 0 from Google made the Visitors chart flat-line with -100%).
 * `streamIds` are the property's web tags (null = unknown), `shopTag` the G-… ID the storefront sends.
 */
export function pickTraffic(report: Ga4Report | undefined, shop: TrafficFigures | null,
  opts: { streamIds?: string[] | null; shopTag?: string } = {}): { traffic: TrafficFigures | null; gap: TrafficGap | null } {
  if (!report) return { traffic: shop, gap: null };
  const tag = String(opts.shopTag || "").toUpperCase();
  const tags = Array.isArray(opts.streamIds) ? opts.streamIds.map(t => String(t).toUpperCase()) : null;
  const mismatch = tag && tags && !tags.includes(tag) ? { tag, propertyTags: tags } : null;
  if (!googleRecordedNothing(report)) return { traffic: googleTraffic(report), gap: mismatch ? { kind: null, mismatch } : null };
  if (shop && shop.visitors.cur > 0) return { traffic: shop, gap: { kind: "fallback", mismatch } };
  return { traffic: googleTraffic(report), gap: { kind: "empty", mismatch } };
}

/** Each funnel step with its share of the step before. */
export function funnelSteps(f: Funnel) {
  const steps = [
    { key: "view", label: "Viewed a book", count: f.view },
    { key: "add_to_cart", label: "Added to bag", count: f.add_to_cart },
    { key: "checkout_start", label: "Started checkout", count: f.checkout_start },
    { key: "purchase", label: "Bought", count: f.purchase },
  ];
  return steps.map((s, i) => ({ ...s, ofPrevious: i === 0 ? null : steps[i - 1].count > 0 ? (s.count / steps[i - 1].count) * 100 : null }));
}
