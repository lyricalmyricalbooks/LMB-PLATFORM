// Overview › Visitors › the shop's own events (20 October 2026): pure maths over the Google Analytics report's 6th batch
// (standard dimensions: `newEvents`, `notFound`, `bagPeeks`) and 7th batch (the events' parameters as custom dimensions:
// `navClicks`, `pdpActions`, `pdpTabs`, `filters`, `scrollDepth`; functions/googleAnalytics.js). Four states before any
// maths, from `sourceState`:
//   - "needsUpdate": the key is missing (undefined) → the shop's server is older than these reports;
//   - "notRegistered": a 7th-batch key is null and named in `refusedReports` → Google refused it (400) because the owner
//     hasn't registered its parameters yet (Admin › Custom definitions); `CUSTOM_DEFINITIONS` names them;
//   - "notAnswered": any other null key → Google refused or didn't answer that report this time (Refresh asks again);
//   - "ready": the key holds rows. They may still be empty: the data functions then return null ("Not recorded yet"),
//     never a made-up zero. The data functions treat a null key the same way, so callers choose the message.
import type { Ga4Report } from "../googleAnalytics";
import { pageLabel } from "./overviewVisitors";
import type { BookRecord } from "../../../shared/records";

type Report = Ga4Report | null | undefined;
type Book = BookRecord;


const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0; };
const text = (v: unknown) => String(v ?? "").trim();
/** Google's "(not set)" (a parameter the event didn't carry, or one sent before it was registered) and blanks. */
const unset = (v: string) => !v || v === "(not set)" || v === "(other)";
const cleanPath = (p: string) => {
  let s = text(p).replace(/[?#].*$/, "");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
};
const bareHost = (h: string) => text(h).toLowerCase().replace(/^www\./, "");
/** "link_text" → "Link text", "in-stock" → "In stock". */
const humanize = (v: string) => { const s = text(v).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const named = (map: Record<string, string>, v: string) => map[text(v).toLowerCase()] || humanize(v);

// ------------------------------------------------------------------------------------------- Which reports answered

export type CustomKey = "navClicks" | "pdpActions" | "pdpTabs" | "filters" | "scrollDepth";
export type StandardKey = "newEvents" | "notFound" | "bagPeeks";
export type EventSource = "needsUpdate" | "notRegistered" | "notAnswered" | "ready";

/** The event parameters (Google Analytics › Admin › Custom definitions, event scope) each 7th-batch report reads. */
export const CUSTOM_DEFINITIONS: Record<CustomKey, string[]> = {
  navClicks: ["menu", "link_text"], pdpActions: ["action"], pdpTabs: ["tab"], filters: ["filter", "value"], scrollDepth: ["percent"],
};
const CUSTOM_KEYS = Object.keys(CUSTOM_DEFINITIONS) as CustomKey[];

/** Whether a report key can be drawn, or why not (see the file comment). */
export function sourceState(report: Report, key: CustomKey | StandardKey): EventSource {
  const value = report?.[key];
  if (Array.isArray(value)) return "ready";
  if (value === null) {
    const refused = Array.isArray(report?.refusedReports) && report!.refusedReports!.includes(key);
    return refused && CUSTOM_KEYS.includes(key as CustomKey) ? "notRegistered" : "notAnswered";
  }
  return "needsUpdate";
}

/** The parameters still to register among these reports' (de-duplicated, in order); empty when all answered. */
export function missingDefinitions(report: Report, keys: CustomKey[]): string[] {
  const out: string[] = [];
  keys.forEach(k => { if (sourceState(report, k) === "notRegistered") CUSTOM_DEFINITIONS[k].forEach(p => { if (!out.includes(p)) out.push(p); }); });
  return out;
}

/** How often one shop event fired in the period; null when the 6th batch isn't there (older server, or not answered). */
export function eventCount(report: Report, name: string): number | null {
  const raw = report?.newEvents;
  if (!Array.isArray(raw)) return null;
  return raw.filter(r => text(r.eventName) === name).reduce((s, r) => s + num(r.eventCount), 0);
}

// ------------------------------------------------------------------------------------------- 1. Menu links people use

const MENU_NAMES: Record<string, string> = {
  header: "Header menu", main: "Header menu", nav: "Header menu", primary: "Header menu",
  secondary: "Publisher row", publisher: "Publisher row", footer: "Footer", mobile: "Phone menu", phone: "Phone menu",
  categories: "Category bar", category: "Category bar", dropdown: "Drop-down", mega: "Mega menu", breadcrumb: "Breadcrumb",
};
export const menuLabel = (menu: string) => named(MENU_NAMES, menu);

export interface MenuLink { key: string; label: string; count: number }
export interface MenuClicks { key: string; label: string; count: number; links: MenuLink[] }
export interface NavLinksResult { menus: MenuClicks[]; total: number; top: MenuLink & { menu: string } }

/** Menu clicks per menu, busiest first, each with its links. Null when no click carries a menu and a link. */
export function navLinks(report: Report): NavLinksResult | null {
  const raw = report?.navClicks;
  if (!Array.isArray(raw)) return null;
  const menus = new Map<string, MenuClicks>();
  raw.forEach(r => {
    const menu = text(r["customEvent:menu"]), link = text(r["customEvent:link_text"]), n = num(r.eventCount);
    if (unset(menu) || unset(link) || n <= 0) return;
    const m = menus.get(menu) || { key: menu, label: menuLabel(menu), count: 0, links: [] };
    m.count += n;
    const l = m.links.find(x => x.key === link);
    if (l) l.count += n; else m.links.push({ key: link, label: link, count: n });
    menus.set(menu, m);
  });
  const list = [...menus.values()].map(m => ({ ...m, links: m.links.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (list.length === 0) return null;
  let top = { ...list[0].links[0], menu: list[0].label };
  list.forEach(m => { if (m.links[0].count > top.count) top = { ...m.links[0], menu: m.label }; });
  return { menus: list, total: list.reduce((s, m) => s + m.count, 0), top };
}

// ------------------------------------------------------------------------------------------- 2. What people do on a book page

const ACTION_NAMES: Record<string, string> = {
  tab: "Opened a tab", tab_open: "Opened a tab", accordion: "Opened a section", section: "Opened a section",
  photo: "Looked at another photo", photos: "Looked at another photo", gallery: "Looked at another photo", thumbnail: "Looked at another photo",
  zoom: "Enlarged a photo", lightbox: "Enlarged a photo", video: "Played the video",
  edition: "Picked an edition", format: "Picked an edition", variant: "Picked an edition", quantity: "Changed how many", qty: "Changed how many",
  share: "Shared the book", wishlist: "Saved to the wishlist", reviews: "Read the reviews", review: "Read the reviews",
  artist_link: "Followed an artist link", breadcrumb: "Used the breadcrumb", back: "Went back", notify: "Asked to be told when it's back",
};
export const actionLabel = (action: string) => named(ACTION_NAMES, action);
const TAB_NAMES: Record<string, string> = { description: "Description", details: "Details", reviews: "Reviews", shipping: "Shipping" };
export const tabLabel = (tab: string) => named(TAB_NAMES, tab);

export interface BookAction { key: string; label: string; count: number; books: Array<{ path: string; label: string; count: number }> }
export interface BookPageResult {
  actions: BookAction[]; total: number;
  /** Which tab (or accordion) people opened, most first; null when the tab report isn't there or holds nothing. */
  tabs: Array<{ key: string; label: string; count: number }> | null;
  /** Book pages with the most actions. */ books: Array<{ path: string; label: string; count: number }>;
}

/** Book-page actions (pdp_interact) by kind, with the books they happened on and which tabs were opened. */
export function bookPageActions(report: Report, books: Book[] | null | undefined): BookPageResult | null {
  const raw = report?.pdpActions;
  if (!Array.isArray(raw)) return null;
  const byAction = new Map<string, { count: number; pages: Map<string, number> }>();
  const byPage = new Map<string, number>();
  raw.forEach(r => {
    const action = text(r["customEvent:action"]), n = num(r.eventCount);
    if (unset(action) || n <= 0) return;
    const path = cleanPath(r.pagePath);
    const a = byAction.get(action) || { count: 0, pages: new Map<string, number>() };
    a.count += n;
    a.pages.set(path, (a.pages.get(path) || 0) + n);
    byAction.set(action, a);
    byPage.set(path, (byPage.get(path) || 0) + n);
  });
  // Two parameter values with one plain name ("photo", "gallery") are one row.
  const merged = new Map<string, BookAction>();
  byAction.forEach((a, action) => {
    const label = actionLabel(action);
    const row = merged.get(label) || { key: action, label, count: 0, books: [] };
    row.count += a.count;
    a.pages.forEach((count, path) => {
      const b = row.books.find(x => x.path === path);
      if (b) b.count += count; else row.books.push({ path, label: pageLabel(path, books), count });
    });
    merged.set(label, row);
  });
  const actions = [...merged.values()].map(a => ({ ...a, books: a.books.sort((x, y) => y.count - x.count || x.path.localeCompare(y.path)) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (actions.length === 0) return null;
  const tabRows = Array.isArray(report?.pdpTabs) ? report!.pdpTabs!
    .map(r => ({ tab: text(r["customEvent:tab"]), count: num(r.eventCount) }))
    .filter(r => !unset(r.tab) && r.count > 0) : [];
  const tabMap = new Map<string, { key: string; label: string; count: number }>();
  tabRows.forEach(r => { const label = tabLabel(r.tab); const t = tabMap.get(label) || { key: r.tab, label, count: 0 }; t.count += r.count; tabMap.set(label, t); });
  const tabs = [...tabMap.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    actions, total: actions.reduce((s, a) => s + a.count, 0), tabs: tabs.length ? tabs : null,
    books: [...byPage.entries()].map(([path, count]) => ({ path, label: pageLabel(path, books), count })).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
  };
}

// ------------------------------------------------------------------------------------------- 3. Missing pages

export interface CameFrom { key: string; label: string; count: number; kind: "shop" | "site" | "none" }
export interface MissingPage { path: string; count: number; from: CameFrom[] }
export interface NotFoundResult { pages: MissingPage[]; total: number }

/** Where a visit to a missing page came from: a page of the shop (named), another site (its host) or nowhere. */
export function referrerLabel(referrer: string, books: Book[] | null | undefined, ownHosts: string[]): CameFrom & { count: 0 } {
  const raw = text(referrer);
  if (unset(raw)) return { key: "", label: "Typed in or bookmarked", count: 0, kind: "none" };
  try {
    const u = new URL(raw);
    const host = bareHost(u.hostname);
    const own = new Set(ownHosts.map(bareHost).filter(Boolean));
    if (own.has(host)) { const path = cleanPath(u.pathname); return { key: `shop:${path}`, label: pageLabel(path, books), count: 0, kind: "shop" }; }
    return { key: `site:${host}`, label: host, count: 0, kind: "site" };
  } catch {
    return { key: `site:${raw}`, label: raw, count: 0, kind: "site" };
  }
}

/** Addresses that showed "page not found", most first, each with where its visitors came from. */
export function missingPages(report: Report, books: Book[] | null | undefined, ownHosts: string[]): NotFoundResult | null {
  const raw = report?.notFound;
  if (!Array.isArray(raw)) return null;
  const byPath = new Map<string, MissingPage>();
  raw.forEach(r => {
    const n = num(r.eventCount);
    const pathRaw = text(r.pagePath);
    if (n <= 0 || unset(pathRaw)) return;
    const path = cleanPath(pathRaw);
    const page = byPath.get(path) || { path, count: 0, from: [] };
    page.count += n;
    const from = referrerLabel(r.pageReferrer, books, ownHosts);
    const f = page.from.find(x => x.key === from.key);
    if (f) f.count += n; else page.from.push({ ...from, count: n });
    byPath.set(path, page);
  });
  const pages = [...byPath.values()].map(p => ({ ...p, from: p.from.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)) }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  if (pages.length === 0) return null;
  return { pages, total: pages.reduce((s, p) => s + p.count, 0) };
}

/** Missing-page visits sent by the shop's own pages: links inside the shop that point nowhere (fix these first). */
export const brokenInside = (res: NotFoundResult) => res.pages.reduce((s, p) => s + p.from.filter(f => f.kind === "shop").reduce((t, f) => t + f.count, 0), 0);

// ------------------------------------------------------------------------------------------- 4. Filters people use

const FILTER_NAMES: Record<string, string> = {
  format: "Format", price: "Price", price_min: "Lowest price", price_max: "Highest price", in_stock: "In stock only", instock: "In stock only",
  stock: "In stock only", category: "Category", sort: "Sort", search: "Search", clear: "Clear filters", genre: "Category",
};
export const filterLabel = (filter: string) => named(FILTER_NAMES, filter);

export interface FilterUse { key: string; label: string; count: number; values: Array<{ key: string; label: string; count: number }> }
export interface FiltersResult { filters: FilterUse[]; total: number }

/** Shop filters used, most first, with the choices people picked (a choice without a value still counts for its filter). */
export function filtersUsed(report: Report): FiltersResult | null {
  const raw = report?.filters;
  if (!Array.isArray(raw)) return null;
  const byFilter = new Map<string, FilterUse>();
  raw.forEach(r => {
    const filter = text(r["customEvent:filter"]), value = text(r["customEvent:value"]), n = num(r.eventCount);
    if (unset(filter) || n <= 0) return;
    const label = filterLabel(filter);
    const f = byFilter.get(label) || { key: filter, label, count: 0, values: [] };
    f.count += n;
    if (!unset(value)) {
      const v = f.values.find(x => x.key === value);
      if (v) v.count += n; else f.values.push({ key: value, label: humanize(value), count: n });
    }
    byFilter.set(label, f);
  });
  const filters = [...byFilter.values()].map(f => ({ ...f, values: f.values.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  if (filters.length === 0) return null;
  return { filters, total: filters.reduce((s, f) => s + f.count, 0) };
}

// ------------------------------------------------------------------------------------------- 5. Bag peeks

export interface PeekRow { path: string; label: string; peeks: number; checkouts: number; rate: number | null }
export interface BagPeekResult {
  rows: PeekRow[]; peeks: number; checkouts: number;
  /** Checkouts ÷ bag peeks over the whole shop, 0..1; null with too few peeks. */ rate: number | null;
  /** True when checkout starts are recorded on the pages themselves (not only on the checkout page). */ perPage: boolean;
}

const MIN_PEEKS = 10;
const isCheckoutPath = (p: string) => /\/checkout$/.test(p);

/** Bag opened (view_cart) per page against checkout started (begin_checkout). Null when nobody opened the bag. */
export function bagPeeks(report: Report, books: Book[] | null | undefined): BagPeekResult | null {
  const raw = report?.bagPeeks;
  if (!Array.isArray(raw)) return null;
  const byPath = new Map<string, { peeks: number; checkouts: number }>();
  raw.forEach(r => {
    const n = num(r.eventCount);
    if (n <= 0) return;
    const path = cleanPath(r.pagePath);
    const cur = byPath.get(path) || { peeks: 0, checkouts: 0 };
    if (text(r.eventName) === "view_cart") cur.peeks += n; else if (text(r.eventName) === "begin_checkout") cur.checkouts += n;
    byPath.set(path, cur);
  });
  const peeks = [...byPath.values()].reduce((s, v) => s + v.peeks, 0);
  if (peeks <= 0) return null;
  const checkouts = [...byPath.values()].reduce((s, v) => s + v.checkouts, 0);
  const perPage = [...byPath.entries()].some(([path, v]) => v.checkouts > 0 && !isCheckoutPath(path));
  const rows = [...byPath.entries()].filter(([, v]) => v.peeks > 0).map(([path, v]) => ({
    path, label: pageLabel(path, books), peeks: v.peeks, checkouts: perPage ? v.checkouts : 0,
    rate: perPage && v.peeks >= MIN_PEEKS ? Math.min(1, v.checkouts / v.peeks) : null,
  })).sort((a, b) => b.peeks - a.peeks || a.path.localeCompare(b.path));
  return { rows, peeks, checkouts, rate: peeks >= MIN_PEEKS ? Math.min(1, checkouts / peeks) : null, perPage };
}

// ------------------------------------------------------------------------------------------- 6. How far people read

export const DEPTH_MARKS = [50, 75, 100] as const;
export interface DepthRow {
  path: string; label: string;
  /** Visits counted for the page: its page views when Google sent them, else the visits that passed the first mark. */ base: number;
  /** Share of `base` that reached 50 / 75 / 100% of the page, 0..1 (null when that mark wasn't recorded). */
  reached: Record<(typeof DEPTH_MARKS)[number], number | null>;
}
export interface ReadDepthResult { rows: DepthRow[]; fromViews: boolean }

const MIN_DEPTH_BASE = 10;

/**
 * Per page, the share of visits that scrolled to half, three quarters and the end. Each mark fires once per page view;
 * a mark counts the first recorded percent from it up to the next mark, and the end counts the deepest one from 90 up.
 * The base is the page's views from the visitor batch (`pageTime`) when present, else the busiest mark's count.
 */
export function readDepth(report: Report, books: Book[] | null | undefined): ReadDepthResult | null {
  const raw = report?.scrollDepth;
  if (!Array.isArray(raw)) return null;
  const byPath = new Map<string, Map<number, number>>();
  raw.forEach(r => {
    const pct = Math.round(Number(text(r["customEvent:percent"]).replace(/%$/, "")));
    const n = num(r.eventCount);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100 || n <= 0) return;
    const path = cleanPath(r.pagePath);
    const m = byPath.get(path) || new Map<number, number>();
    m.set(pct, (m.get(pct) || 0) + n);
    byPath.set(path, m);
  });
  const views = new Map<string, number>();
  (Array.isArray(report?.pageTime) ? report!.pageTime! : []).forEach(r => { const p = cleanPath(r.pagePath); views.set(p, (views.get(p) || 0) + num(r.screenPageViews)); });
  let fromViews = false;
  const rows: DepthRow[] = [];
  byPath.forEach((marks, path) => {
    const recorded = [...marks.keys()].sort((a, b) => a - b);
    const top = Math.max(...marks.values());
    const viewed = views.get(path) || 0;
    const base = viewed >= top ? viewed : top;
    if (viewed >= top && viewed > 0) fromViews = true;
    if (base < MIN_DEPTH_BASE) return;
    const reached = {} as DepthRow["reached"];
    DEPTH_MARKS.forEach((mark, i) => {
      const next = DEPTH_MARKS[i + 1] ?? 101;
      // The end also takes a 90 (Google's own scroll event fires there), the deepest recorded one winning.
      const p = mark === 100 ? [...recorded].reverse().find(x => x >= 90) : recorded.find(x => x >= mark && x < next);
      reached[mark] = p === undefined ? null : Math.min(1, (marks.get(p) || 0) / base);
    });
    if (DEPTH_MARKS.every(m => reached[m] === null)) return;
    rows.push({ path, label: pageLabel(path, books), base, reached });
  });
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.base - a.base || a.path.localeCompare(b.path));
  return { rows, fromViews };
}
