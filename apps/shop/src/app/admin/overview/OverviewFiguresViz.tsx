import type { ReactNode } from "react";
import { StatusBadge, type BadgeTone } from "../riso/components";
import { orderStatusWords, type Book, type Order } from "./overviewInsights";
import { resolveRange, type Range } from "./overviewRange";
import { bucketSeries, buildRangeSeries, metricValue, type ChartMetric } from "./overviewSeries";
import { smallPhotoUrl } from "../../features/site/photoSources";
import { Cover, Spark } from "./OverviewViz";
import { money, orderHref, shopWhen } from "./OverviewParts";

// Key figures and Newest orders, drawn (19 October 2026): a small line under each figure, and the newest orders with
// covers and status pills. Same data the board already loads; nothing here reads Firestore.

export type FigureLine = { cur: Array<number | null>; prev: Array<number | null> };
export const SPARK_METRICS: ChartMetric[] = ["revenue", "orders", "units", "aov", "visitors", "conversion"];

/**
 * One line per chartable figure over the period, with the period before at the same positions. "Today" uses the last
 * 7 days (like the trend chart); ranges over 14 days are grouped by week so a small line isn't 30 spikes. Pure.
 */
export function figureSeries(paid: Order[], range: Range, visitsOn: (dayKey: string) => number = () => 0): Record<ChartMetric, FigureLine> {
  const r = range.preset === "today" ? resolveRange("7d", { compare: range.compare }) : range;
  const buckets = bucketSeries(buildRangeSeries(paid, r, visitsOn), r.days > 14 ? "week" : "day");
  const out = {} as Record<ChartMetric, FigureLine>;
  for (const m of SPARK_METRICS) out[m] = { cur: buckets.map(b => metricValue(b, m)), prev: buckets.map(b => metricValue(b, m, true)) };
  return out;
}

/** Which way is good for a figure: more revenue is good, more refunds or days to ship are not, some are just facts. */
export type GoodWhen = "up" | "down" | "neutral";

/**
 * The small line under a Key figure; red only when the figure moved the bad way (`goodWhen`, default "up": a fall is
 * bad), ink when it didn't move or the figure is neutral. `null` when there is no line.
 */
export function figureSpark(line: FigureLine | undefined, now: number | null, before: number | null, goodWhen: GoodWhen = "up"): ReactNode {
  if (!line || line.cur.length < 2) return null;
  const tone = now === null || before === null || now === before ? "flat" : now > before ? "up" : "down";
  return <Spark values={line.cur} prev={line.prev} tone={tone} goodWhen={goodWhen} />;
}

/** The status pill for a newest order: glyph + word, in ink; colour only where something needs looking at. */
export function orderPill(words: string): { tone: BadgeTone; glyph: string; word: string } {
  return STATUS_PILL[words] || { tone: "neutral", glyph: "○", word: words };
}

const STATUS_PILL: Record<string, { tone: BadgeTone; glyph: string; word: string }> = {
  "Paid · to send": { tone: "neutral", glyph: "●", word: "To ship" },
  Shipped: { tone: "neutral", glyph: "→", word: "On the way" },
  "Pre-order": { tone: "neutral", glyph: "◷", word: "Pre-order" },
  Completed: { tone: "neutral", glyph: "✓", word: "Completed" },
  Refunded: { tone: "warning", glyph: "↺", word: "Refunded" },
  "Partly refunded": { tone: "warning", glyph: "↺", word: "Partly refunded" },
  "Needs attention": { tone: "danger", glyph: "!", word: "Needs attention" },
};
const itemsOf = (o: Order) => (o.items || []).reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0);
const placeOf = (o: Order) => {
  const a = o.customer?.address || o.shippingAddress || {};
  return [a.city, a.province || a.state, a.country].map(v => String(v || "").trim()).filter(Boolean).slice(0, 2).join(", ");
};

/** Newest orders as rows: the first book's cover, who and where, how many books, when, the total and a status pill. */
export function NewestOrdersList({ orders, books }: { orders: Order[]; books: Book[] }) {
  const byId = new Map(books.map(b => [b.id, b]));
  return (
    <ol className="rp-viz-rank rp-viz-orders" aria-label="Newest orders">
      {orders.map(o => {
        const first = (o.items || [])[0] || {};
        const book = byId.get(first.id);
        const pill = orderPill(orderStatusWords(o));
        const n = itemsOf(o);
        const place = placeOf(o);
        const name = o.customer?.name || o.customer?.email || "Customer";
        return (
          <li key={o.id}>
            <div className="rp-viz-rank-row">
              <Cover url={smallPhotoUrl(book?.photos?.[0], 52) || null} text={String(first.title || book?.title || "")} />
              <span className="rp-viz-rank-main">
                <span className="rp-viz-rank-label">{name}</span>
                <span className="rp-viz-rank-sub">
                  <a className="rp-mono" href={orderHref(o.id)} aria-label={`Open order ${o.orderId || o.id}`}>{o.orderId || o.id}</a>
                  {place && ` · ${place}`} · {n} book{n === 1 ? "" : "s"}{shopWhen(o.createdAt) && ` · ${shopWhen(o.createdAt)}`}
                </span>
              </span>
              <span className="rp-viz-order-end">
                <span className="rp-viz-rank-value">{money(o.total ?? 0)}</span>
                <StatusBadge tone={pill.tone} glyph={pill.glyph}>{pill.word}</StatusBadge>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
