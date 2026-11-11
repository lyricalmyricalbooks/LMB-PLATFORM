// The Analytics page (11 November 2026): store traffic for one period, from Google Analytics when it is connected and
// recorded visitors, otherwise the shop's own daily counters. Pure; the page (AnalyticsPage.tsx) only loads and draws.
// Rule: a signal that was never recorded is `null` ("Not recorded yet"), never a made-up zero.
import { addDays, orderDay } from "../../lib/shopDay";
import type { Ga4Report } from "../googleAnalytics";
import { isOwnOrder } from "../../lib/ownerDevice";
import { autoGrain, bucketKey, bucketLabel, daysBetween, type Range } from "../overview/overviewRange";
import { funnelSteps, pickTraffic, shopRowsIn, shopTraffic, type TrafficGap } from "../overview/overviewSources";
import { bookInterest, rankMap, sourcePerformance, sumMap } from "../overview/overviewTraffic";
import { isRealPaidOrder } from "../overview/overviewInsights";

const num = (v: unknown) => Number(v) || 0;

export interface Pair { cur: number; prev: number }
export interface Row { key: string; label: string; value: number; sub?: string; extra?: string }
export interface Bar { key: string; label: string; visitors: number; orders: number }

export interface AnalyticsModel {
  /** Where the visitor figures come from; null while neither source has answered. */
  source: "google" | "shop" | null;
  gap: TrafficGap | null;
  visitors: Pair | null;
  /** Google's sessions, or null on the shop's counter (it counts one visit per person per day). */
  sessions: Pair | null;
  /** Google's page views; on the shop's counter, product pages opened. */
  views: (Pair & { what: "pages" | "products" }) | null;
  orders: Pair;
  /** Paid orders ÷ visitors, in %; null with no visitors. */
  conversion: { cur: number | null; prev: number | null };
  bars: Bar[];
  grain: "day" | "week" | "month";
  /** Where visitors came from. Google: channels; the shop's counter: sources with the orders they brought. */
  sources: Row[] | null;
  pages: Row[] | null;
  products: Row[] | null;
  devices: Row[] | null;
  countries: Row[] | null;
  funnel: Array<{ key: string; label: string; count: number; ofPrevious: number | null }> | null;
  searches: Row[] | null;
  /** Searches that found nothing (shop counter). */
  noResults: Row[] | null;
}

/** "+12%" / "−8%" / "New" / null against the period before. */
export function change(p: Pair): string | null {
  if (p.prev <= 0) return p.cur > 0 ? "New" : null;
  const pct = Math.round(((p.cur - p.prev) / p.prev) * 100);
  return pct === 0 ? "No change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

const DEVICE_WORDS: Record<string, string> = { mobile: "Phone", phone: "Phone", desktop: "Computer", computer: "Computer", tablet: "Tablet" };
const deviceWord = (k: string) => DEVICE_WORDS[k.toLowerCase()] || (k ? k[0].toUpperCase() + k.slice(1) : "Other");
const SOURCE_WORDS: Record<string, string> = { direct: "Typed in or bookmarked", "(direct)": "Typed in or bookmarked" };
/** A counter source key ("google com", "instagram") as people write it ("Google.com", "Instagram"). */
export function sourceWord(k: string): string {
  if (SOURCE_WORDS[k.toLowerCase()]) return SOURCE_WORDS[k.toLowerCase()];
  const s = k.trim().replace(/ (com|ca|org|net|co|io|uk)\b/g, ".$1").replace(/_/g, " ");
  return s ? s[0].toUpperCase() + s.slice(1) : "Other";
}
const share = (n: number, all: number) => (all > 0 ? `${Math.round((n / all) * 100)}%` : undefined);

/** Every day key of the range, in order. */
export function daysOf(range: Pick<Range, "startKey" | "endKey">): string[] {
  const out: string[] = [];
  for (let k = range.startKey, i = 0; k <= range.endKey && i <= 800; k = addDays(k, 1), i++) out.push(k);
  return out;
}

export function analyticsModel(input: {
  range: Range; shift: number;
  /** The shop's daily counter docs (null = not loaded or failed). */
  daily: any[] | null;
  /** Google's report when it is connected and answered. */
  report?: Ga4Report;
  streamIds?: string[] | null; shopTag?: string;
  orders: any[] | null; books: any[];
}): AnalyticsModel {
  const { range, shift, daily, report, books } = input;
  const shop = daily ? shopTraffic(daily, range, shift) : null;
  const { traffic, gap } = pickTraffic(report, shop, { streamIds: input.streamIds, shopTag: input.shopTag });
  const google = traffic?.source === "google" ? report : undefined;
  const rows = daily ? shopRowsIn(daily, range.startKey, range.endKey, shift) : [];
  // A shop counter map counts only once it has been recorded on some day of the loaded window.
  const recorded = (field: string) => !!daily && daily.some(d => d?.[field] && typeof d[field] === "object" && Object.keys(d[field]).length > 0);

  const paid = (input.orders || []).filter(o => isRealPaidOrder(o) && !isOwnOrder(o));
  const inDays = (from: string, to: string) => paid.filter(o => { const k = orderDay(o.createdAt); return k !== "" && k >= from && k <= to; });
  const cur = inDays(range.startKey, range.endKey), prev = inDays(range.prevStartKey, range.prevEndKey);
  const orders = { cur: cur.length, prev: prev.length };
  const rate = (o: number, v: number) => (v > 0 ? (o / v) * 100 : null);

  // Visitors per day, grouped so a long range stays readable.
  const days = daysBetween(range.startKey, range.endKey) + 1;
  const grain = autoGrain(days);
  const ordersByDay = new Map<string, number>();
  cur.forEach(o => { const k = orderDay(o.createdAt); ordersByDay.set(k, (ordersByDay.get(k) || 0) + 1); });
  const buckets = new Map<string, Bar>();
  daysOf(range).forEach(k => {
    const b = bucketKey(k, grain);
    const bar = buckets.get(b) || { key: b, label: bucketLabel(b, grain), visitors: 0, orders: 0 };
    bar.visitors += traffic ? traffic.visitsOn(k) : 0;
    bar.orders += ordersByDay.get(k) || 0;
    buckets.set(b, bar);
  });

  const sources: Row[] | null = google
    ? (() => { const all = google.channels.reduce((s, c) => s + num(c.sessions), 0); return google.channels.slice(0, 8).map(c => ({ key: String(c.sessionDefaultChannelGroup), label: String(c.sessionDefaultChannelGroup || "Other"), value: num(c.sessions), sub: `${num(c.activeUsers).toLocaleString("en-CA")} people`, extra: share(num(c.sessions), all) })); })()
    : recorded("sources")
      ? sourcePerformance(sumMap(rows, "sources"), cur).slice(0, 8).map(r => ({ key: r.source, label: sourceWord(r.source), value: r.visits, sub: r.orders ? `${r.orders} ${r.orders === 1 ? "order" : "orders"}` : undefined, extra: r.conversion !== null && r.orders ? `${r.conversion.toFixed(1)}%` : undefined }))
      : null;

  const pages: Row[] | null = google
    ? google.pages.slice(0, 10).map(p => ({ key: String(p.pagePath), label: String(p.pagePath || "/"), value: num(p.screenPageViews), sub: `${num(p.activeUsers).toLocaleString("en-CA")} people` }))
    : null;

  const products: Row[] | null = recorded("bookViews")
    ? bookInterest(sumMap(rows, "bookViews"), cur, books).rows.slice(0, 8).map(r => ({ key: r.id, label: r.title, value: r.views, sub: r.sold ? `${r.sold} sold` : "None sold yet", extra: r.viewToSale !== null && r.sold ? `${r.viewToSale.toFixed(1)}%` : undefined }))
    : null;

  const devices: Row[] | null = google
    ? (() => { const all = google.devices.reduce((s, d) => s + num(d.activeUsers), 0); return google.devices.map(d => ({ key: String(d.deviceCategory), label: deviceWord(String(d.deviceCategory)), value: num(d.activeUsers), extra: share(num(d.activeUsers), all) })); })()
    : recorded("devices")
      ? (() => { const m = sumMap(rows, "devices"); const all = Object.values(m).reduce((s, n) => s + n, 0); return rankMap(m, 5).map(r => ({ key: r.key, label: deviceWord(r.key), value: r.count, extra: share(r.count, all) })); })()
      : null;

  const countries: Row[] | null = google
    ? google.countries.slice(0, 8).map(c => ({ key: String(c.country), label: String(c.country || "Unknown"), value: num(c.activeUsers) }))
    : null;

  const anyFunnel = traffic && (traffic.funnel.view + traffic.funnel.add_to_cart + traffic.funnel.checkout_start + traffic.funnel.purchase) > 0;
  const funnel = traffic && (traffic.source === "google" || recorded("funnel") || anyFunnel) ? funnelSteps(traffic.funnel) : null;

  const searches = recorded("searches") ? rankMap(sumMap(rows, "searches"), 8).map(r => ({ key: r.key, label: r.key, value: r.count })) : null;
  const noResults = recorded("noResults") ? rankMap(sumMap(rows, "noResults"), 5).map(r => ({ key: r.key, label: r.key, value: r.count })) : null;

  const views = google
    ? { cur: num(google.totals.current?.screenPageViews), prev: num(google.totals.previous?.screenPageViews), what: "pages" as const }
    : traffic && funnel ? { cur: traffic.funnel.view, prev: traffic.prevFunnel.view, what: "products" as const } : null;

  return {
    source: traffic?.source ?? null, gap,
    visitors: traffic ? traffic.visitors : null,
    sessions: traffic?.sessions ?? null,
    views,
    orders,
    conversion: traffic ? { cur: rate(orders.cur, traffic.visitors.cur), prev: rate(orders.prev, traffic.visitors.prev) } : { cur: null, prev: null },
    bars: [...buckets.values()], grain,
    sources, pages, products, devices, countries, funnel, searches, noResults,
  };
}
