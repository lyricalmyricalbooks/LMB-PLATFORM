// The maths behind six Overview widgets added 19 October 2026: Sales calendar, Month goal, Days to ship, Launch curves,
// Book of the week and Signed or not. Pure: every function takes the orders the board already loaded (real paid orders,
// the owner's own left out) and a "today" day key, so nothing here reads data. Days are the shop's Toronto days.
import { addDays, orderDay, refundedAmount, type Book, type Order } from "./overviewInsights";
import { preorderClockStart } from "../../features/site/preorder";

const num = (v: unknown) => Number(v) || 0;
const net = (o: Order) => Math.max(0, num(o.total) - refundedAmount(o));
const DAY = 86_400_000;
const dayIndex = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY);
/** Monday = 0 … Sunday = 6. */
export const weekdayOf = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── Sales calendar ───────────────────────────────────────────────────────────────────────────────

export interface CalendarDay { date: string; revenue: number; orders: number }
export interface SalesCalendar {
  /** Columns of 7 (Mon–Sun); days before the first day or after today are null. */
  weeks: Array<Array<CalendarDay | null>>;
  /** Column index where each month starts, for the labels above. */
  months: Array<{ col: number; label: string }>;
  total: number; daysWithSale: number; days: number; max: number;
  longest: { length: number; from: string; to: string } | null;
  busiest: CalendarDay | null;
}

/** The last `days` Toronto days ending today, laid out as weeks, with the year's headline facts. */
export function salesCalendar(paid: Order[], todayKey: string, days = 365): SalesCalendar {
  const firstKey = addDays(todayKey, -(days - 1));
  const byDay = new Map<string, CalendarDay>();
  for (const o of paid) {
    const k = orderDay(o.createdAt);
    if (!k || k < firstKey || k > todayKey) continue;
    const d = byDay.get(k) || { date: k, revenue: 0, orders: 0 };
    d.revenue += net(o); d.orders += 1;
    byDay.set(k, d);
  }
  const weeks: Array<Array<CalendarDay | null>> = [];
  const months: Array<{ col: number; label: string }> = [];
  let col: Array<CalendarDay | null> = Array(weekdayOf(firstKey)).fill(null);
  let total = 0, daysWithSale = 0, max = 0, run = 0, runStart = "";
  let longest: SalesCalendar["longest"] = null, busiest: CalendarDay | null = null;
  let lastMonth = "";
  for (let i = 0; i < days; i++) {
    const k = addDays(firstKey, i);
    const d = byDay.get(k) || { date: k, revenue: 0, orders: 0 };
    if (k.slice(0, 7) !== lastMonth) {
      lastMonth = k.slice(0, 7);
      // The column this day sits in (the week being filled).
      months.push({ col: weeks.length, label: new Date(`${k}T12:00:00Z`).toLocaleString("en-CA", { month: "short", timeZone: "UTC" }) });
    }
    col.push(d);
    if (col.length === 7) { weeks.push(col); col = []; }
    total += d.revenue; max = Math.max(max, d.revenue);
    if (d.orders > 0) {
      daysWithSale += 1;
      if (run === 0) runStart = k;
      run += 1;
      if (!longest || run > longest.length) longest = { length: run, from: runStart, to: k };
      if (!busiest || d.revenue > busiest.revenue) busiest = d;
    } else run = 0;
  }
  if (col.length) weeks.push([...col, ...Array(7 - col.length).fill(null)]);
  // A month is labelled on the week holding its 1st; a label too close to the next one (a part month at the start) is dropped.
  const spaced = months.filter((m, i) => i === months.length - 1 || months[i + 1].col - m.col >= 2);
  return { weeks, months: spaced, total, daysWithSale, days, max, longest, busiest };
}

/** 0 = no sale, 1–4 = how busy the day was against the year's best day (quarters). */
export const calendarLevel = (revenue: number, max: number) => (revenue <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((revenue / max) * 4))));

/** What each shade means in money: level 1–4 = up to a quarter, half, three quarters and all of the best day. */
export function calendarLegend(max: number): Array<{ level: number; upTo: number }> {
  if (max <= 0) return [];
  return [1, 2, 3, 4].map(level => ({ level, upTo: (max * level) / 4 }));
}

/** Net revenue per calendar month in the calendar, oldest first, and the best one (null when nothing sold). */
export function calendarMonths(cal: SalesCalendar): { months: Array<{ month: string; revenue: number; orders: number }>; best: { month: string; revenue: number } | null } {
  const by = new Map<string, { month: string; revenue: number; orders: number }>();
  for (const w of cal.weeks) for (const d of w) {
    if (!d) continue;
    const m = d.date.slice(0, 7);
    const r = by.get(m) || { month: m, revenue: 0, orders: 0 };
    r.revenue += d.revenue; r.orders += d.orders;
    by.set(m, r);
  }
  const months = [...by.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  const best = months.reduce<{ month: string; revenue: number } | null>((b, m) => (m.revenue > 0 && (!b || m.revenue > b.revenue) ? m : b), null);
  return { months, best: best ? { month: best.month, revenue: best.revenue } : null };
}

/** Round axis steps (1, 2 or 5 × 10ⁿ) from 0 to at least `max`, about `count` of them. */
export function niceTicks(max: number, count = 3): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) || 10 * p;
  const out: number[] = [];
  for (let v = 0; v < max + step && out.length < 12; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

// ── Month goal ───────────────────────────────────────────────────────────────────────────────────

export interface MonthGoal {
  month: string; soFar: number; goal: number; share: number; daysIn: number; daysInMonth: number;
  /** Where an even pace would be today, 0–100. */ paceShare: number;
  ahead: boolean; projected: number; needPerDay: number | null;
}

/** This Toronto month's net revenue against a goal, with where an even pace would put it today. */
export function monthGoal(paid: Order[], todayKey: string, goal: number): MonthGoal {
  const first = `${todayKey.slice(0, 7)}-01`;
  const [y, m] = todayKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysIn = Number(todayKey.slice(8, 10));
  const soFar = paid.reduce((s, o) => { const k = orderDay(o.createdAt); return k >= first && k <= todayKey ? s + net(o) : s; }, 0);
  const g = Math.max(0, goal);
  const paceShare = (daysIn / daysInMonth) * 100;
  const share = g > 0 ? (soFar / g) * 100 : 0;
  const left = daysInMonth - daysIn;
  return {
    month: new Date(`${first}T12:00:00Z`).toLocaleString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }),
    soFar, goal: g, share, daysIn, daysInMonth, paceShare,
    ahead: share >= paceShare, projected: (soFar / Math.max(1, daysIn)) * daysInMonth,
    needPerDay: g > soFar && left > 0 ? (g - soFar) / left : null,
  };
}

/**
 * The goal in plain money terms: how much is still to go, what that is a day for the days left, and how far ahead
 * or behind an even pace the month is today (positive = ahead).
 */
export function goalGap(g: MonthGoal): { toGo: number; perDay: number | null; daysLeft: number; paceGap: number } {
  const daysLeft = Math.max(0, g.daysInMonth - g.daysIn);
  const toGo = Math.max(0, g.goal - g.soFar);
  return { toGo, perDay: toGo > 0 && daysLeft > 0 ? toGo / daysLeft : null, daysLeft, paceGap: g.soFar - (g.goal * g.paceShare) / 100 };
}

/** A typed goal ("2,000", "$1500") as a whole number of dollars, or null when it isn't one. */
export function parseGoal(text: string): number | null {
  const n = Number(String(text).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n) : null;
}

// ── Days to ship ─────────────────────────────────────────────────────────────────────────────────

/** Days from payment (or a pre-order's release) to dispatch; null when not shipped or unreadable. */
export function daysToShip(o: Order): number | null {
  const paid = Date.parse(o.paidAt || o.createdAt || ""), sent = Date.parse(o.shippedAt || "");
  if (Number.isNaN(paid) || Number.isNaN(sent)) return null;
  const start = Math.max(paid, preorderClockStart(o, o.operations || {}));
  return sent < start ? (sent >= paid ? 0 : null) : (sent - start) / DAY;
}

export interface ShipWeek { week: string; label: string; median: number | null; shipped: number }

/** The typical (median) days to ship for each of the last `weeks` Monday weeks, by the week the parcel left. */
export function shipWeeks(paid: Order[], todayKey: string, weeks = 12): ShipWeek[] {
  const thisMonday = addDays(todayKey, -weekdayOf(todayKey));
  const firstMonday = addDays(thisMonday, -7 * (weeks - 1));
  const buckets = new Map<string, number[]>();
  for (const o of paid) {
    const d = daysToShip(o); if (d === null) continue;
    const k = orderDay(o.shippedAt); if (!k || k < firstMonday || k > todayKey) continue;
    const wk = addDays(k, -weekdayOf(k));
    buckets.set(wk, [...(buckets.get(wk) || []), d]);
  }
  return Array.from({ length: weeks }, (_, i) => {
    const wk = addDays(firstMonday, 7 * i);
    const xs = buckets.get(wk) || [];
    return { week: wk, label: new Date(`${wk}T12:00:00Z`).toLocaleString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }), median: median(xs), shipped: xs.length };
  });
}

/** The last 4 weeks' typical days to ship against the 4 before (null = nothing shipped then). */
export function shipHeadline(paid: Order[], todayKey: string) {
  const weeks = shipWeeks(paid, todayKey, 8);
  const pool = (ws: ShipWeek[]) => {
    const from = ws[0].week, to = addDays(ws[ws.length - 1].week, 6);
    return median(paid.filter(o => { const k = orderDay(o.shippedAt); return k >= from && k <= to; }).map(daysToShip).filter((d): d is number => d !== null));
  };
  return { recent: pool(weeks.slice(4)), before: pool(weeks.slice(0, 4)), shipped: weeks.slice(4).reduce((s, w) => s + w.shipped, 0) };
}

// ── Launch curves ────────────────────────────────────────────────────────────────────────────────

export interface LaunchCurve { id: string; title: string; firstDay: string; points: number[]; daysSoFar: number; total: number }

/**
 * The newest `limit` titles by first sale, each as copies sold so far on day 0…`span` after its first sale
 * (cumulative). `daysSoFar` stops at today for a launch younger than the span. Gift cards are left out.
 */
export function launchCurves(paid: Order[], books: Book[], todayKey: string, limit = 4, span = 30): LaunchCurve[] {
  const byId = new Map(books.map(b => [String(b.id), b]));
  const first = new Map<string, string>();
  const title = new Map<string, string>();
  for (const o of paid) {
    const k = orderDay(o.createdAt); if (!k) continue;
    for (const i of o.items || []) {
      if (!i?.id || num(i.quantity) <= 0 || i.productType === "giftCard" || byId.get(String(i.id))?.productType === "giftCard") continue;
      const id = String(i.id);
      if (!first.has(id) || k < first.get(id)!) first.set(id, k);
      if (!title.has(id)) title.set(id, String(byId.get(id)?.title || i.title || i.name || "Untitled"));
    }
  }
  const newest = [...first.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).slice(0, limit);
  return newest.map(([id, firstDay]) => {
    const perDay = Array(span + 1).fill(0);
    for (const o of paid) {
      const k = orderDay(o.createdAt); if (!k) continue;
      const d = dayIndex(k) - dayIndex(firstDay);
      if (d < 0 || d > span) continue;
      for (const i of o.items || []) if (String(i?.id) === id) perDay[d] += num(i.quantity);
    }
    const daysSoFar = Math.min(span, Math.max(0, dayIndex(todayKey) - dayIndex(firstDay)));
    const points: number[] = [];
    let running = 0;
    for (let d = 0; d <= daysSoFar; d++) { running += perDay[d]; points.push(running); }
    return { id, title: title.get(id)!, firstDay, points, daysSoFar, total: running };
  });
}

// ── Book of the week ─────────────────────────────────────────────────────────────────────────────

export interface WeekBook { id: string; title: string; copies: number; revenue: number; before: number; beforeRank: number | null; runnerUp: string | null }

/** The title with most copies sold in the last 7 Toronto days (today included), against the 7 days before. */
export function bookOfTheWeek(paid: Order[], todayKey: string): WeekBook | null {
  const from = addDays(todayKey, -6), prevFrom = addDays(todayKey, -13), prevTo = addDays(todayKey, -7);
  const tally = (a: string, b: string) => {
    const m = new Map<string, { id: string; title: string; copies: number; revenue: number }>();
    for (const o of paid) {
      const k = orderDay(o.createdAt); if (!k || k < a || k > b) continue;
      for (const i of o.items || []) {
        const q = num(i?.quantity); if (!i?.id || q <= 0 || i.productType === "giftCard") continue;
        const r = m.get(String(i.id)) || { id: String(i.id), title: String(i.title || i.name || "Untitled"), copies: 0, revenue: 0 };
        r.copies += q; r.revenue += q * num(i.price);
        m.set(String(i.id), r);
      }
    }
    return [...m.values()].sort((x, y) => y.copies - x.copies || y.revenue - x.revenue);
  };
  const now = tally(from, todayKey);
  if (!now.length) return null;
  const before = tally(prevFrom, prevTo);
  const top = now[0];
  const at = before.findIndex(r => r.id === top.id);
  return { ...top, before: at >= 0 ? before[at].copies : 0, beforeRank: at >= 0 ? at + 1 : null, runnerUp: now[1]?.title || null };
}

// ── Signed or not ────────────────────────────────────────────────────────────────────────────────

const SIGNED = /\bsigned\b/i;
const UNSIGNED = /\bun-?signed\b|\bnot signed\b/i;
const isSignedText = (s: unknown) => SIGNED.test(String(s || "")) && !UNSIGNED.test(String(s || ""));

/** Whether an order line is a signed copy: its edition name, the catalog edition it points at, or the line's own name. */
export function isSignedLine(i: any, book?: Book): boolean {
  if (isSignedText(i?.variantName)) return true;
  const v = (book?.variants || []).find((x: any) => x && i?.variantId && String(x.id) === String(i.variantId));
  if (v && isSignedText(v.name || v.title || v.label)) return true;
  return !v && !i?.variantName && isSignedText(i?.title || i?.name) && !isSignedText(book?.title);
}

/** Books that sell a signed edition (an edition whose name says "signed"). */
export const hasSignedEdition = (b: Book) => (b?.variants || []).some((v: any) => isSignedText(v?.name || v?.title || v?.label));

export interface SignedRow { id: string; title: string; signed: number; unsigned: number; share: number; signedPrice: number | null; unsignedPrice: number | null }

/** For each book with a signed edition, copies sold signed vs not in the period, and the average price of each. */
export function signedMix(current: Order[], books: Book[]) {
  const byId = new Map(books.map(b => [String(b.id), b]));
  const rows = new Map<string, SignedRow & { sRev: number; uRev: number }>();
  for (const o of current) for (const i of o.items || []) {
    const q = num(i?.quantity); if (!i?.id || q <= 0) continue;
    const book = byId.get(String(i.id));
    const signed = isSignedLine(i, book);
    if (!signed && !(book && hasSignedEdition(book))) continue;
    const r = rows.get(String(i.id)) || { id: String(i.id), title: String(book?.title || i.title || "Untitled"), signed: 0, unsigned: 0, share: 0, signedPrice: null, unsignedPrice: null, sRev: 0, uRev: 0 };
    if (signed) { r.signed += q; r.sRev += q * num(i.price); } else { r.unsigned += q; r.uRev += q * num(i.price); }
    rows.set(String(i.id), r);
  }
  const list = [...rows.values()].map(r => ({
    id: r.id, title: r.title, signed: r.signed, unsigned: r.unsigned, share: r.signed + r.unsigned > 0 ? (r.signed / (r.signed + r.unsigned)) * 100 : 0,
    signedPrice: r.signed ? r.sRev / r.signed : null, unsignedPrice: r.unsigned ? r.uRev / r.unsigned : null,
  })).sort((a, b) => b.signed + b.unsigned - (a.signed + a.unsigned));
  // The premium is compared within each book (signed vs unsigned of the same title), weighted by signed copies.
  let w = 0, diff = 0;
  for (const r of list) if (r.signedPrice !== null && r.unsignedPrice !== null) { w += r.signed; diff += r.signed * (r.signedPrice - r.unsignedPrice); }
  const signed = list.reduce((s, r) => s + r.signed, 0), all = list.reduce((s, r) => s + r.signed + r.unsigned, 0);
  return { rows: list, premium: w > 0 ? diff / w : null, signed, all, share: all ? (signed / all) * 100 : 0, booksWithSigned: books.filter(hasSignedEdition).length };
}
