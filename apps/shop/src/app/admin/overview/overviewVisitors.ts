// Overview › visitor widgets (19 October 2026): pure maths over the Google Analytics report (functions/googleAnalytics.js,
// 4th batch + realtime pages/minutes) and, for "What visitors do" without Google, the shop's own daily counters.
// Every function returns null when there is nothing recorded to draw — never a made-up zero. A report from a server
// older than this change has no `pageTime`/`when`/`actions`/`outbound`/`realtimePages`/`realtimeMinutes` keys:
// callers detect that with `report.pageTime === undefined` ("Needs the latest server update").
import type { Ga4Report } from "../googleAnalytics";
import { smallPhotoUrl } from "../../features/site/photoSources";
import type { BookRecord } from "../../../shared/records";

type Report = Ga4Report | null | undefined;
type Book = BookRecord;


// ---------------------------------------------------------------------------------------------------------------
// Public signatures (builder B imports exactly these).

/** One page in "Pages people actually read". `seconds` = average engaged seconds per view. */
export interface PageTimeRow {
  key: string; path: string; label: string; bookId: string | null; cover: string | null;
  views: number; people: number; seconds: number;
  /** Scroll-to-90% events ÷ views, 0..1; null when the property sends no scroll events at all. */
  readShare: number | null;
  /** add_to_cart events on this page (0 when none; null when the report has no pageActions). */
  bagAdds: number | null;
}
export interface PageTimeResult { rows: PageTimeRow[]; hasScroll: boolean; sort: "time" | "views" }

/** HeatGrid-ready: rows Mon..Sun, 24 hour cells each (property time zone). */
export interface VisitHeat {
  rows: Array<{ day: string; hours: number[] }>;
  max: number;
  busiest: { day: string; hour: number; visitors: number };
  total: number;
}

export type ActionKey = "readToEnd" | "openedBook" | "wishlist" | "searched" | "addedToBag" | "linkOut" | "download" | "form" | "video" | "share";
export interface ActionRow {
  key: ActionKey; label: string;
  /** Visitors who did it (GA activeUsers; shop counters count once per visit). */ people: number;
  /** Times it happened; null for shop counters (they count visits, not events). */ times: number | null;
  /** The same figure for the period before; null when nothing comparable was recorded. */ prev: number | null;
}
export interface ActionResult { source: "google" | "shop"; rows: ActionRow[] }

export interface OutboundRow { key: string; domain: string; label: string; clicks: number; people: number }

export interface VisitorMix {
  current: { newVisitors: number; returning: number };
  previous: { newVisitors: number; returning: number } | null;
  /** Engagement rate 0..1 per group (from visitorType); null when the server didn't send it. */
  engagement: { newVisitors: number | null; returning: number | null };
  /** Visits per visitor per group; null when unknown. */
  visitsPerVisitor: { newVisitors: number | null; returning: number | null };
}

export interface LivePage { key: string; label: string; people: number; views: number }

// ---------------------------------------------------------------------------------------------------------------

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());
const cleanPath = (p: string) => {
  let s = String(p || "").trim();
  s = s.replace(/[?#].*$/, "");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
};

function bookForPath(path: string, books: Book[] | null | undefined): Book | null {
  const m = cleanPath(path).match(/\/books\/([^/]+)$/);
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
  const lower = slug.toLowerCase();
  return (books || []).find(b => b && (String(b.slug || "").toLowerCase() === lower || String(b.id || "") === slug)) || null;
}

/** "/" → "Home", "/books/<slug>" → the book's title, "/page/<slug>" → "Slug In Title Case", else a readable path. */
export function pageLabel(path: string, books: Book[] | null | undefined): string {
  const p = cleanPath(path);
  if (p === "/" || p === "(not set)" || p === "") return p === "(not set)" ? "Unknown page" : "Home";
  // A sub-path build (SITE_BASE) still ends in the same route.
  const book = bookForPath(p, books);
  if (book) return String(book.title || book.name || "Book");
  let m = p.match(/\/books\/([^/]+)$/);
  if (m) { try { return titleCase(decodeURIComponent(m[1])); } catch { return titleCase(m[1]); } }
  m = p.match(/\/page\/([^/]+)$/);
  if (m) { try { return titleCase(decodeURIComponent(m[1])); } catch { return titleCase(m[1]); } }
  m = p.match(/\/collections\/([^/]+)$/);
  if (m) { try { return titleCase(decodeURIComponent(m[1])); } catch { return titleCase(m[1]); } }
  const named: Record<string, string> = { "/checkout": "Checkout", "/cart": "Bag", "/wishlist": "Wishlist", "/track": "Order tracking", "/account": "Account" };
  for (const [route, label] of Object.entries(named)) if (p === route || p.endsWith(route)) return label;
  if (p.startsWith("/account")) return "Account";
  return p;
}

const MIN_PAGE_VIEWS = 10;

/** "Pages people actually read": pages with ≥10 views, average time per view and the read-to-the-end share. */
export function pageTimeRows(report: Report, books: Book[] | null | undefined, sort: "time" | "views" = "time"): PageTimeResult | null {
  const raw = report?.pageTime;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const actions = Array.isArray(report?.pageActions) ? report!.pageActions! : null;
  const hasScroll = !!actions && actions.some(a => a.eventName === "scroll" && num(a.eventCount) > 0);
  // GA can report the same page with and without a trailing slash or query: fold them together.
  const byPath = new Map<string, { views: number; people: number; engaged: number }>();
  raw.forEach(r => {
    const path = cleanPath(r.pagePath);
    const cur = byPath.get(path) || { views: 0, people: 0, engaged: 0 };
    cur.views += num(r.screenPageViews); cur.people += num(r.activeUsers); cur.engaged += num(r.userEngagementDuration);
    byPath.set(path, cur);
  });
  const eventsAt = (name: string) => {
    const m = new Map<string, number>();
    (actions || []).forEach(a => { if (a.eventName === name) { const p = cleanPath(a.pagePath); m.set(p, (m.get(p) || 0) + num(a.eventCount)); } });
    return m;
  };
  const scrolls = eventsAt("scroll"), adds = eventsAt("add_to_cart");
  const rows: PageTimeRow[] = [];
  byPath.forEach((v, path) => {
    if (v.views < MIN_PAGE_VIEWS) return;
    const book = bookForPath(path, books);
    rows.push({
      key: path, path, label: pageLabel(path, books), bookId: book ? String(book.id || "") || null : null,
      cover: book ? (smallPhotoUrl(book.photos?.[0], 96) || null) : null,
      views: v.views, people: v.people, seconds: v.views > 0 ? v.engaged / v.views : 0,
      readShare: hasScroll ? Math.min(1, (scrolls.get(path) || 0) / v.views) : null,
      bagAdds: actions ? adds.get(path) || 0 : null,
    });
  });
  if (rows.length === 0) return null;
  rows.sort(sort === "views"
    ? (a, b) => b.views - a.views || b.seconds - a.seconds
    : (a, b) => b.seconds - a.seconds || b.views - a.views);
  return { rows, hasScroll, sort };
}

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "When visitors come": GA's dayOfWeek (0 = Sunday) × hour, re-ordered to start on Monday. */
export function visitHeat(report: Report): VisitHeat | null {
  const raw = report?.when;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const grid = WEEK.map(() => new Array<number>(24).fill(0));
  let total = 0;
  raw.forEach(r => {
    const d = Number(r.dayOfWeek), h = Number(r.hour);
    if (!Number.isInteger(d) || d < 0 || d > 6 || !Number.isInteger(h) || h < 0 || h > 23) return;
    const n = num(r.activeUsers);
    grid[(d + 6) % 7][h] += n; total += n;
  });
  if (total <= 0) return null;
  let busiest = { day: "", hour: 0, visitors: 0 }, max = 0;
  grid.forEach((hours, i) => hours.forEach((n, h) => { if (n > max) { max = n; busiest = { day: WEEK[i], hour: h, visitors: n }; } }));
  return { rows: WEEK.map((day, i) => ({ day, hours: grid[i] })), max, busiest, total };
}

const ACTION_LABELS: Record<ActionKey, string> = {
  readToEnd: "Scrolled to the end of a page",
  openedBook: "Opened a book",
  wishlist: "Saved a book to their wishlist",
  searched: "Searched the shop",
  addedToBag: "Put a book in the bag",
  linkOut: "Followed a link away from the shop",
  download: "Downloaded a file",
  form: "Sent a form",
  video: "Watched a video",
  share: "Shared a page",
};
/** Which GA events make each action. Several events in one action: people = the largest (GA can't de-duplicate), times = sum. */
const ACTION_EVENTS: Array<[ActionKey, string[]]> = [
  ["readToEnd", ["scroll"]],
  ["openedBook", ["view_item"]],
  ["wishlist", ["add_to_wishlist"]],
  ["searched", ["search", "search_no_results"]],
  ["addedToBag", ["add_to_cart"]],
  ["linkOut", ["click"]],
  ["download", ["file_download"]],
  ["form", ["form_submit"]],
  ["video", ["video_start"]],
  ["share", ["share"]],
];

type EventMap = Record<string, { eventCount: number; activeUsers: number }>;
const fromEvents = (map: EventMap | undefined, names: string[]) => {
  let people = 0, times = 0, seen = false;
  names.forEach(n => { const e = map?.[n]; if (e) { seen = true; people = Math.max(people, num(e.activeUsers)); times += num(e.eventCount); } });
  return seen ? { people, times } : null;
};

const sumMap = (days: any[] | null | undefined, field: string): number | null => {
  let seen = false, total = 0;
  (days || []).forEach(d => {
    const m = d?.[field];
    if (m && typeof m === "object") { seen = true; Object.values(m).forEach(v => { total += num(v); }); }
  });
  return seen ? total : null;
};

/**
 * "What visitors do". With a Google report that has `actions`, the GA events; otherwise the shop's own counters
 * (book views, bag adds, wishlist saves, searches) from `dailyCur` / `dailyPrev` (analytics/<day> docs).
 */
export function actionRows(report: Report, dailyCur: any[] | null | undefined, dailyPrev: any[] | null | undefined): ActionResult | null {
  const acts = report?.actions;
  if (acts && acts.current && Object.keys(acts.current).length > 0) {
    const prevSeen = !!acts.previous && Object.keys(acts.previous).length > 0;
    const rows: ActionRow[] = [];
    ACTION_EVENTS.forEach(([key, names]) => {
      const cur = fromEvents(acts.current, names);
      if (!cur || (cur.people <= 0 && cur.times <= 0)) return;
      const prev = prevSeen ? fromEvents(acts.previous, names) : null;
      rows.push({ key, label: ACTION_LABELS[key], people: cur.people, times: cur.times, prev: prevSeen ? (prev ? prev.people : 0) : null });
    });
    if (rows.length) return { source: "google", rows: rows.sort((a, b) => b.people - a.people) };
  }
  const shop: Array<[ActionKey, string[]]> = [["openedBook", ["bookViews"]], ["addedToBag", ["bookAdds"]], ["wishlist", ["wishlistAdds"]], ["searched", ["searches", "noResults"]]];
  const rows: ActionRow[] = [];
  shop.forEach(([key, fields]) => {
    const parts = fields.map(f => sumMap(dailyCur, f));
    if (parts.every(p => p === null)) return;
    const people = parts.reduce<number>((s, p) => s + (p || 0), 0);
    const prevParts = fields.map(f => sumMap(dailyPrev, f));
    const prev = prevParts.every(p => p === null) ? null : prevParts.reduce<number>((s, p) => s + (p || 0), 0);
    rows.push({ key, label: ACTION_LABELS[key], people, times: null, prev });
  });
  if (!rows.length || rows.every(r => r.people <= 0)) return null;
  return { source: "shop", rows: rows.sort((a, b) => b.people - a.people) };
}

const bareHost = (h: string) => String(h || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

/** "Links visitors follow away": domains people left to. `ownHosts` (the shop's own addresses) are left out. */
export function outboundRows(report: Report, ownHosts: string[] = []): OutboundRow[] | null {
  const raw = report?.outbound;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const own = new Set(ownHosts.map(bareHost).filter(Boolean));
  const byDomain = new Map<string, OutboundRow>();
  raw.forEach(r => {
    const domain = bareHost(r.linkDomain);
    if (!domain || domain === "(not set)" || own.has(domain)) return;
    const cur = byDomain.get(domain) || { key: domain, domain, label: domain, clicks: 0, people: 0 };
    cur.clicks += num(r.eventCount); cur.people += num(r.activeUsers);
    byDomain.set(domain, cur);
  });
  const rows = [...byDomain.values()].filter(r => r.clicks > 0).sort((a, b) => b.clicks - a.clicks || b.people - a.people);
  return rows.length ? rows : null;
}

const split = (t: any) => {
  if (!t || typeof t !== "object" || !("activeUsers" in t)) return null;
  const all = num(t.activeUsers), fresh = Math.min(all, Math.max(0, num(t.newUsers)));
  return { newVisitors: fresh, returning: Math.max(0, all - fresh) };
};

/** "New and returning visitors": new = newUsers, returning = activeUsers − newUsers (floored at 0), now and before. */
export function visitorMix(report: Report): VisitorMix | null {
  if (!report) return null;
  const types = Array.isArray(report.visitorType) ? report.visitorType : [];
  const typed = (name: string) => types.find(r => String(r.newVsReturning).toLowerCase() === name);
  let current = split(report.totals?.current);
  if (!current) {
    const n = typed("new"), r = typed("returning");
    if (n || r) current = { newVisitors: num(n?.activeUsers), returning: num(r?.activeUsers) };
  }
  if (!current || current.newVisitors + current.returning <= 0) return null;
  const prev = split(report.totals?.previous);
  const rate = (row: any) => (row && "engagementRate" in row ? num(row.engagementRate) : null);
  const perVisitor = (row: any) => (row && num(row.activeUsers) > 0 ? num(row.sessions) / num(row.activeUsers) : null);
  return {
    current,
    previous: prev && prev.newVisitors + prev.returning > 0 ? prev : null,
    engagement: { newVisitors: rate(typed("new")), returning: rate(typed("returning")) },
    visitsPerVisitor: { newVisitors: perVisitor(typed("new")), returning: perVisitor(typed("returning")) },
  };
}

/** "Being read right now": pages open in the last 30 minutes (GA realtime, page titles), most people first. */
export function livePagesOf(report: Report): LivePage[] | null {
  const raw = report?.realtimePages;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw
    .map(r => {
      const name = String(r.unifiedScreenName || "").trim();
      const label = !name || name === "(not set)" ? "Unknown page" : name;
      return { key: label, label, people: num(r.activeUsers), views: num(r.screenPageViews) };
    })
    .filter(r => r.people > 0 || r.views > 0)
    .sort((a, b) => b.people - a.people || b.views - a.views);
  return rows.length ? rows : null;
}

/** The last 30 minutes of people on the site, oldest first (index 29 = this minute, so the newest bar is on the right). */
export function liveMinutes(report: Report): number[] | null {
  const raw = report?.realtimeMinutes;
  if (!Array.isArray(raw)) return null;
  const out = new Array<number>(30).fill(0);
  raw.forEach(r => { const m = Number(r.minutesAgo); if (Number.isInteger(m) && m >= 0 && m < 30) out[29 - m] = num(r.activeUsers); });
  return out;
}
