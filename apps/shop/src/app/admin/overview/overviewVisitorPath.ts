// Two Overview widgets from the shop's own counter (`analytics/<UTC day>`, written by lib/commerce.ts), 19 October 2026:
// "Where visitors drop off" (one path from a visit to a paid order) and "Looked at but not added" (book pages opened
// with few bag adds). Pure maths; OverviewVisitorPath.tsx draws it. A signal that was never recorded is reported as
// missing (null / left out), never as a zero.
import { sumMap, type Daily } from "./overviewTraffic";
import { analyticsKey } from "../../lib/analyticsKeys";
import type { Book } from "./overviewInsights";

const num = (v: unknown) => Number(v) || 0;
const dayOf = (d: Daily) => String(d?.date || "").slice(0, 10);
const hasMap = (d: Daily, field: string) => !!d?.[field] && typeof d[field] === "object" && Object.keys(d[field]).length > 0;

// ─── Where visitors drop off ─────────────────────────────────────────────────────────────────────────────────────

export interface PathStep {
  key: string;
  label: string;
  /** How the step reads inside "between … and …". */
  short: string;
  count: number;
  /** The same step in the period before; null when it wasn't recorded then. */
  prevCount: number | null;
  /** Share of the step before who went no further (0–100); null for the first step or when the step before is 0. */
  stopShare: number | null;
  prevStopShare: number | null;
  /** People lost since the step before (0 when this step counted more). */
  lost: number;
}

export interface DropOffPath {
  steps: PathStep[];
  /** Index into `steps` of the biggest leak (largest share that stopped, same rule the Funnel chart marks); -1 if none. */
  worst: number;
  /** "Most people stop between the bag and checkout", or null when nothing leaks. */
  headline: string | null;
  /** False when the checkout steps (email … Pay) were never recorded: they are left out of `steps`. */
  checkoutSteps: boolean;
  /** First day the checkout steps were counted, when that is inside this period (earlier days have none). */
  checkoutSince: string | null;
}

const PATH = [
  { key: "visit", label: "Visited the shop", short: "arriving", from: "visits" },
  { key: "view", label: "Opened a book page", short: "a book page", from: "funnel.view" },
  { key: "bag", label: "Put a book in the bag", short: "the bag", from: "funnel.add_to_cart" },
  { key: "checkout", label: "Started checkout", short: "checkout", from: "funnel.checkout_start" },
  { key: "email", label: "Typed an email", short: "the email", from: "checkout.email", checkout: true },
  { key: "address", label: "Finished the address", short: "the address", from: "checkout.address", checkout: true },
  { key: "delivery", label: "Saw the delivery price", short: "the delivery price", from: "checkout.delivery", checkout: true },
  { key: "pay", label: "Pressed Pay", short: "pressing Pay", from: "checkout.pay", checkout: true },
  { key: "bought", label: "Bought", short: "buying", from: "funnel.purchase" },
] as const;

function countOf(rows: Daily[], from: string) {
  if (from === "visits") return rows.reduce((s, d) => s + num(d?.visits), 0);
  const [field, key] = from.split(".");
  return num(sumMap(rows, field)[key]);
}

const recordedPath = (rows: Daily[]) => rows.some(d => num(d?.visits) > 0 || hasMap(d, "funnel"));

/**
 * The path from a visit to a paid order for the current period, with the period before for "was". Returns null when
 * the period has no visit or funnel counts at all. `checkoutSince` is `recordedSince(dailyAll, "checkout")`: null means
 * the checkout steps were never recorded, so they are left out rather than drawn as zeros; a day inside the period
 * means only part of it was counted (said in the footnote, and the period before then has no checkout figures).
 */
export function dropOffPath(dailyCur: Daily[], dailyPrev: Daily[] = [], opts: { checkoutSince?: string | null } = {}): DropOffPath | null {
  if (!recordedPath(dailyCur)) return null;
  const since = opts.checkoutSince ?? null;
  const checkoutSteps = since !== null;
  const curDays = dailyCur.map(dayOf).filter(Boolean).sort();
  const prevDays = dailyPrev.map(dayOf).filter(Boolean).sort();
  const prevRecorded = recordedPath(dailyPrev);
  // The period before has checkout figures only when it was counted throughout.
  const prevCheckout = checkoutSteps && prevRecorded && prevDays.length > 0 && prevDays[0] >= since!;
  const defs = PATH.filter(p => checkoutSteps || !("checkout" in p));
  const counts = defs.map(p => countOf(dailyCur, p.from));
  const prev = defs.map(p => (!prevRecorded ? null : "checkout" in p && !prevCheckout ? null : countOf(dailyPrev, p.from)));
  const share = (now: number, before: number | null) => (before === null || before <= 0 ? null : Math.max(0, Math.min(100, (1 - now / before) * 100)));
  const steps: PathStep[] = defs.map((p, i) => ({
    key: p.key, label: p.label, short: p.short, count: counts[i], prevCount: prev[i],
    stopShare: i === 0 ? null : share(counts[i], counts[i - 1]),
    prevStopShare: i === 0 || prev[i] === null ? null : share(prev[i]!, prev[i - 1]),
    lost: i === 0 ? 0 : Math.max(0, counts[i - 1] - counts[i]),
  }));
  // Same rule as OverviewViz Funnel's "biggest drop" mark, so the sentence and the chart agree.
  let worst = -1, best = 0;
  steps.forEach((s, i) => { if (s.stopShare !== null && s.stopShare > best) { best = s.stopShare; worst = i; } });
  const headline = worst > 0 ? `Most people stop between ${steps[worst - 1].short} and ${steps[worst].short}` : null;
  return { steps, worst, headline, checkoutSteps, checkoutSince: checkoutSteps && curDays.length > 0 && since! > curDays[0] ? since : null };
}

// ─── Looked at but not added ─────────────────────────────────────────────────────────────────────────────────────

export interface LookedRow {
  id: string; title: string; book: Book | null;
  views: number; adds: number;
  /** Bag adds per book-page visit, 0–100. */
  addRate: number;
  /** Below LOW_ADD_RATE: shown as a warning. */
  low: boolean;
}

export const LOW_ADD_RATE = 5;
export const DEFAULT_MIN_VIEWS = 5;

export interface LookedNotAdded {
  rows: LookedRow[];
  /** Books opened at least once in the period (before the minimum-views cut). */
  viewedBooks: number;
  /** First day bag adds were counted, when inside this period: views before it are left out so the rate stays fair. */
  addsSince: string | null;
}

/**
 * Books hardly anyone puts in the bag (add rate under LOW_ADD_RATE) first, then the most book-page visits that ended
 * without a bag add (views − adds, then the lower add rate), from the
 * once-per-session `bookViews` and `bookAdds` counters. Only books with at least `minViews` views. Returns null when
 * book views or bag adds were never recorded (`addsSince` = `recordedSince(dailyAll, "bookAdds")`).
 */
export function lookedNotAdded(dailyCur: Daily[], books: Book[], minViews = DEFAULT_MIN_VIEWS, opts: { addsSince?: string | null } = {}): LookedNotAdded | null {
  const since = opts.addsSince ?? null;
  if (since === null) return null;
  const rows = dailyCur.filter(d => !dayOf(d) || dayOf(d) >= since);
  if (!rows.some(d => hasMap(d, "bookViews"))) return null;
  const views = sumMap(rows, "bookViews");
  const adds = sumMap(rows, "bookAdds");
  const byKey = new Map<string, Book>();
  books.forEach(b => { if (b?.id) { byKey.set(String(b.id), b); byKey.set(analyticsKey(String(b.id)), b); } });
  const min = Math.max(1, Math.round(minViews) || DEFAULT_MIN_VIEWS);
  const out: LookedRow[] = [];
  let viewedBooks = 0;
  for (const [id, n] of Object.entries(views)) {
    if (n <= 0) continue;
    viewedBooks++;
    if (n < min) continue;
    const a = Math.min(n, num(adds[id]));
    const rate = (a / n) * 100;
    const book = byKey.get(id) || null;
    out.push({ id, title: String(book?.title || "Removed book"), book, views: n, adds: a, addRate: rate, low: rate < LOW_ADD_RATE });
  }
  // Books hardly anyone puts in the bag first, then by visits that ended without a bag add.
  out.sort((x, y) => Number(y.low) - Number(x.low) || (y.views - y.adds) - (x.views - x.adds) || x.addRate - y.addRate || x.title.localeCompare(y.title));
  const curDays = dailyCur.map(dayOf).filter(Boolean).sort();
  return { rows: out, viewedBooks, addsSince: curDays.length > 0 && since > curDays[0] ? since : null };
}
