import { change, type BestSeller, type PeriodTotals } from "./overviewInsights";

// The Overview's front-page headline: one plain sentence about the period, plus a short line under it.
// Pure so the wording is tested; money is formatted by the caller so currency stays in one place.

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "yesterday", "the 30 days before", "the year before" — what the period is compared with. */
export function comparedWith(days: number): string {
  if (days === 1) return "yesterday";
  if (days === 365) return "the year before";
  return `the ${days} days before`;
}

export interface LeadStory { headline: string; dek: string }

export function leadStory({ cur, prev, top, days, phrase, money, before: compared }: {
  cur: PeriodTotals; prev: PeriodTotals; top?: BestSeller | null; days: number; phrase: string; money: (n: number) => string;
  /** What the period is compared with, when it isn't the equally long block before (overviewRange's `before`). */
  before?: string;
}): LeadStory {
  const before = compared || comparedWith(days);
  if (cur.orders === 0) {
    return {
      headline: `No paid orders ${days === 1 ? "yet today" : `in ${phrase}`}`,
      dek: prev.orders > 0
        ? `${before[0].toUpperCase()}${before.slice(1)} brought ${plural(prev.orders, "paid order", "paid orders")} (${money(prev.net)}).`
        : "Revenue shows here as soon as a customer pays.",
    };
  }
  const c = change(cur.net, prev.net);
  const trend = c === null ? "with nothing to compare against before"
    : Math.abs(c) < 0.5 ? `level with ${before}`
    : `${c > 0 ? "up" : "down"} ${Math.abs(c).toFixed(0)}% on ${before}`;
  const leader = top && top.units > 0 ? ` ${top.title} led with ${plural(top.units, "copy", "copies")}.` : "";
  return {
    headline: `${money(cur.net)} taken, ${trend}`,
    dek: `${plural(cur.orders, "paid order", "paid orders")}, ${plural(cur.units, "book", "books")} sold.${leader}`,
  };
}
