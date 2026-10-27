// Overview › Visitors › how visitors move (20 October 2026): pure maths over the Google Analytics report's 5th batch
// (functions/googleAnalytics.js `moves`, `landingPaths`, `lists`, `deviceSteps`). Every function returns null when
// nothing is recorded to draw — never a made-up zero. A report from an older server has none of these keys: callers
// check `report.moves === undefined` ("Needs the latest server update").
import type { Ga4Report } from "../googleAnalytics";
import { pageLabel } from "./overviewVisitors";
import type { BookRecord } from "../../../shared/records";

type Report = Ga4Report | null | undefined;
type Book = BookRecord;


const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const cleanPath = (p: string) => {
  let s = String(p || "").trim().replace(/[?#].*$/, "");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
};
const bareHost = (h: string) => String(h || "").trim().toLowerCase().replace(/^www\./, "");

// ------------------------------------------------------------------------------------------- Where people go next

export interface PageMove { key: string; from: string; to: string; fromLabel: string; toLabel: string; count: number }
export interface PageLink { path: string; label: string; count: number }
export interface MovesResult {
  moves: PageMove[];
  /** Page views that came from another page of the shop. */ total: number;
  /** Pages that appear in any move, busiest first (for "Follow one page"). */ pages: PageLink[];
}

/**
 * Page → page moves inside the shop. A view counts when the page it came from (`pageReferrer`, a full URL) is on one of
 * `ownHosts` (www. ignored); views from other sites or with no referrer are entries, shown by Sources and Landing pages.
 */
export function pageMoves(report: Report, books: Book[] | null | undefined, ownHosts: string[]): MovesResult | null {
  const raw = report?.moves;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const hosts = new Set(ownHosts.map(bareHost).filter(Boolean));
  const byKey = new Map<string, { from: string; to: string; count: number }>();
  raw.forEach(r => {
    let from: string;
    try {
      const u = new URL(String(r.pageReferrer || ""));
      if (!hosts.has(bareHost(u.hostname))) return;
      from = cleanPath(u.pathname);
    } catch { return; }
    const to = cleanPath(r.pagePath);
    if (from === to) return;
    const key = `${from} → ${to}`;
    const cur = byKey.get(key) || { from, to, count: 0 };
    cur.count += num(r.screenPageViews);
    byKey.set(key, cur);
  });
  const moves: PageMove[] = [...byKey.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({ key, ...v, fromLabel: pageLabel(v.from, books), toLabel: pageLabel(v.to, books) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (moves.length === 0) return null;
  const touch = new Map<string, number>();
  moves.forEach(m => { touch.set(m.from, (touch.get(m.from) || 0) + m.count); touch.set(m.to, (touch.get(m.to) || 0) + m.count); });
  const pages = [...touch.entries()].map(([path, count]) => ({ path, label: pageLabel(path, books), count })).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  return { moves, total: moves.reduce((s, m) => s + m.count, 0), pages };
}

/** For one page: where its visitors came from (inside the shop) and where they went next, busiest first. */
export function followPage(res: MovesResult, path: string): { cameFrom: PageLink[]; wentTo: PageLink[] } {
  const p = cleanPath(path);
  return {
    cameFrom: res.moves.filter(m => m.to === p).map(m => ({ path: m.from, label: m.fromLabel, count: m.count })),
    wentTo: res.moves.filter(m => m.from === p).map(m => ({ path: m.to, label: m.toLabel, count: m.count })),
  };
}

// ------------------------------------------------------------------------------------------- First page, then what

export interface LandingJourney {
  key: string; path: string; label: string;
  visits: number; engaged: number; views: number; purchases: number;
  /** Pages seen per visit. */ pagesPerVisit: number;
  /** Engaged visits ÷ visits (stayed 10 s, saw a second page or bought), 0..1. */ engagedShare: number;
  /** Purchases ÷ visits, 0..1. */ buyShare: number;
  channels: Array<{ channel: string; visits: number; purchases: number }>;
}
export interface LandingResult { rows: LandingJourney[]; channels: string[]; channel: string | null }

const MIN_LANDING_VISITS = 5;

/** Per first page (optionally for one channel): visits, pages per visit, the engaged share and purchases. */
export function landingJourneys(report: Report, books: Book[] | null | undefined, channel?: string | null): LandingResult | null {
  const raw = report?.landingPaths;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const perChannel = new Map<string, number>();
  raw.forEach(r => { const c = String(r.sessionDefaultChannelGroup || ""); if (c && c !== "(not set)") perChannel.set(c, (perChannel.get(c) || 0) + num(r.sessions)); });
  const channels = [...perChannel.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const pick = channel && channels.includes(channel) ? channel : null;
  const byPath = new Map<string, LandingJourney>();
  raw.forEach(r => {
    const ch = String(r.sessionDefaultChannelGroup || "");
    if (pick && ch !== pick) return;
    const path = cleanPath(r.landingPage);
    if (path === "(not set)") return;
    const cur = byPath.get(path) || { key: path, path, label: pageLabel(path, books), visits: 0, engaged: 0, views: 0, purchases: 0, pagesPerVisit: 0, engagedShare: 0, buyShare: 0, channels: [] };
    cur.visits += num(r.sessions); cur.engaged += num(r.engagedSessions); cur.views += num(r.screenPageViews); cur.purchases += num(r.ecommercePurchases);
    const c = cur.channels.find(x => x.channel === ch);
    if (c) { c.visits += num(r.sessions); c.purchases += num(r.ecommercePurchases); } else if (ch) cur.channels.push({ channel: ch, visits: num(r.sessions), purchases: num(r.ecommercePurchases) });
    byPath.set(path, cur);
  });
  const rows = [...byPath.values()].filter(r => r.visits >= MIN_LANDING_VISITS).map(r => ({
    ...r,
    pagesPerVisit: r.visits > 0 ? r.views / r.visits : 0,
    engagedShare: r.visits > 0 ? Math.min(1, r.engaged / r.visits) : 0,
    buyShare: r.visits > 0 ? Math.min(1, r.purchases / r.visits) : 0,
    channels: r.channels.sort((a, b) => b.visits - a.visits),
  })).sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path));
  if (rows.length === 0) return null;
  return { rows, channels, channel: pick };
}

// ------------------------------------------------------------------------------------------- Book lists that get clicks

export interface ListRow { key: string; label: string; seen: number; opened: number; rate: number | null }

const MIN_LIST_VIEWS = 20;

/** Book-card lists (shop grid, search, related, recently viewed, Studio sections): cards seen, cards opened and the click rate (only once a list was seen 20 times). */
export function listClicks(report: Report): ListRow[] | null {
  const raw = report?.lists;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw
    .map(r => ({ name: String(r.itemListName || "").trim(), seen: num(r.itemsViewedInList), opened: num(r.itemsClickedInList) }))
    .filter(r => r.name && r.name !== "(not set)" && (r.seen > 0 || r.opened > 0))
    .map(r => ({ key: r.name, label: r.name, seen: r.seen, opened: r.opened, rate: r.seen >= MIN_LIST_VIEWS ? Math.min(1, r.opened / r.seen) : null }))
    .sort((a, b) => b.seen - a.seen || a.key.localeCompare(b.key));
  return rows.length ? rows : null;
}

// ------------------------------------------------------------------------------------------- Phones vs computers

export const DEVICE_STEPS = [
  { key: "session_start", label: "Visited" },
  { key: "view_item", label: "Opened a book" },
  { key: "add_to_cart", label: "Added to bag" },
  { key: "begin_checkout", label: "Started checkout" },
  { key: "purchase", label: "Bought" },
] as const;
const DEVICE_NAMES: Record<string, string> = { mobile: "Phones", desktop: "Computers", tablet: "Tablets" };

export interface DeviceStep { key: string; label: string; people: number; ofPrevious: number | null }
export interface DevicePath { key: string; label: string; steps: DeviceStep[] }
export interface DeviceGap { step: string; phone: number; computer: number }
export interface DeviceResult { devices: DevicePath[]; gap: DeviceGap | null }

/** The visit → purchase path per device, and the step where phones fall furthest behind computers. */
export function deviceSteps(report: Report): DeviceResult | null {
  const raw = report?.deviceSteps;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const by = new Map<string, Map<string, number>>();
  raw.forEach(r => {
    const d = String(r.deviceCategory || "").toLowerCase();
    if (!DEVICE_NAMES[d]) return;
    const m = by.get(d) || new Map<string, number>();
    m.set(String(r.eventName), (m.get(String(r.eventName)) || 0) + num(r.activeUsers));
    by.set(d, m);
  });
  const devices: DevicePath[] = ["mobile", "desktop", "tablet"].filter(d => (by.get(d)?.get("session_start") || 0) > 0).map(d => {
    const m = by.get(d)!;
    const steps = DEVICE_STEPS.map((s, i) => {
      const people = m.get(s.key) || 0;
      const before = i === 0 ? 0 : m.get(DEVICE_STEPS[i - 1].key) || 0;
      return { key: s.key, label: s.label, people, ofPrevious: i === 0 ? null : before > 0 ? Math.min(1, people / before) : null };
    });
    return { key: d, label: DEVICE_NAMES[d], steps };
  });
  if (devices.length === 0) return null;
  const phone = devices.find(d => d.key === "mobile"), computer = devices.find(d => d.key === "desktop");
  let gap: DeviceGap | null = null;
  if (phone && computer) {
    phone.steps.forEach((s, i) => {
      const p = s.ofPrevious, c = computer.steps[i].ofPrevious;
      if (p === null || c === null || c <= 0 || p >= c) return;
      if (!gap || c - p > gap.computer - gap.phone) gap = { step: s.label, phone: p, computer: c };
    });
  }
  return { devices, gap };
}
