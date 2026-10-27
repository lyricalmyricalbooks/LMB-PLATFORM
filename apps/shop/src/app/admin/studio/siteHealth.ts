// Studio Health across the whole shop (Studio 3.0 phase 7). Pure parts: which pages to check, how the per-page
// findings add up, and the short history of past runs kept in this browser. The runner that loads each page into a
// hidden preview is StudioSiteHealth.tsx; the checks themselves are healthAudit.ts (read-only).
import { alternatesFor, bookTemplateSurface } from "../../features/site/templateAlternates";
import { POLICY_KEYS, policySlug, policyTitle } from "../../features/site/policyPages";
import type { HealthFinding, HealthCategory, HealthSeverity, HealthOwner } from "./healthAudit";

export type HealthRouteGroup = "Home" | "Books" | "Pages" | "Categories" | "Other";
export type HealthRoute = { id: string; label: string; group: HealthRouteGroup; /** Shop path, without the site's sub-path. */ path: string };

export type RouteInput = {
  design: any;
  /** Published books as Studio previews them (`slug` = the storefront address). */
  books: any[];
  /** Custom pages (Studio › Pages); only published ones are checked. */
  pages: any[];
  /** settings.policies: a policy page exists only for the ones written. */
  policies?: Record<string, string | undefined>;
  /** The shop's categories as Studio lists them for Preview collection. */
  collections?: { slug: string; label: string }[];
  /** Most custom pages / categories checked per run (the rest are counted as skipped). */
  maxPages?: number;
  maxCategories?: number;
};

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const enc = (slug: string) => encodeURIComponent(slug);

/** Every kind of page a shopper can reach, each once: one book per book-page template, every published page. */
export function healthRoutes(i: RouteInput): { routes: HealthRoute[]; skipped: number } {
  const d = i.design || {};
  const routes: HealthRoute[] = [];
  let skipped = 0;
  if (d.showHero !== false) {
    routes.push({ id: "home", label: "Home", group: "Home", path: "/" });
    routes.push({ id: "catalog", label: "Shop (all books)", group: "Home", path: "/?catalog=true" });
  } else routes.push({ id: "catalog", label: "Shop (all books)", group: "Home", path: "/" });

  const books = (i.books || []).filter(b => b && clean(b.slug));
  if (books.length) {
    const title = (b: any) => clean(b.title) || clean(b.slug);
    const usesDefault = books.find(b => bookTemplateSurface(d, b) === "productPage") || books[0];
    routes.push({ id: "book:default", label: `Book page · ${title(usesDefault)}`, group: "Books", path: `/books/${enc(clean(usesDefault.slug))}?template=default` });
    for (const alt of alternatesFor(d, "productPage")) {
      const book = books.find(b => clean(b.templateId) === alt.id) || books[0];
      routes.push({ id: `book:${alt.id}`, label: `Book page (${alt.name}) · ${title(book)}`, group: "Books", path: `/books/${enc(clean(book.slug))}?template=${alt.id}` });
    }
  }

  const maxPages = i.maxPages ?? 30;
  const published = (i.pages || []).filter(p => p && clean(p.slug) && p.status === "published");
  const policies = POLICY_KEYS.filter(k => clean(i.policies?.[k]));
  const pageRoutes: HealthRoute[] = [
    ...published.map(p => ({ id: `page:${clean(p.slug)}`, label: clean(p.title) || clean(p.slug), group: "Pages" as const, path: `/page/${enc(clean(p.slug))}` })),
    ...policies.map(k => ({ id: `page:${policySlug(k)}`, label: policyTitle(d, k) || k, group: "Pages" as const, path: `/page/${policySlug(k)}` })),
  ];
  routes.push(...pageRoutes.slice(0, maxPages));
  skipped += Math.max(0, pageRoutes.length - maxPages);

  const maxCategories = i.maxCategories ?? 12;
  const seen = new Set<string>();
  const cats = [{ slug: "publications", label: "All publications" }, ...(i.collections || [])]
    .filter(c => c && clean(c.slug) && !seen.has(c.slug) && seen.add(c.slug));
  routes.push(...cats.slice(0, maxCategories).map(c => ({ id: `collection:${c.slug}`, label: `Category · ${c.label}`, group: "Categories" as const, path: `/collections/${enc(c.slug)}` })));
  skipped += Math.max(0, cats.length - maxCategories);

  routes.push(
    { id: "wishlist", label: "Wishlist", group: "Other", path: "/wishlist" },
    { id: "account", label: "Customer account", group: "Other", path: "/account" },
    { id: "track", label: "Order tracking", group: "Other", path: "/track" },
    { id: "404", label: "Missing page (404)", group: "Other", path: "/studio-missing-page" },
  );
  return { routes, skipped };
}

/** A finding as kept after its page has been closed (no element to point at any more). */
export type SiteFinding = { id: string; category: HealthCategory; severity: HealthSeverity; title: string; detail: string; count: number; owner: HealthOwner | null };
export type PageWeight = { imageBytes: number; fontBytes: number };
export type PageResult = { route: HealthRoute; findings: SiteFinding[]; weight?: PageWeight; /** Why the page couldn't be checked. */ error?: string };
export type SharedFinding = SiteFinding & { pages: string[] };
export type SiteReport = {
  /** Each page's own problems; `sharedIssues` counts the "On several pages" ones that are also on it. */
  pages: (PageResult & { sharedIssues: number })[];
  /** Problems found on two or more pages (a header colour, a footer link…): fix once, listed once. */
  shared: SharedFinding[];
  totals: { pages: number; checked: number; failed: number; issues: number; tips: number };
};

export const toSiteFinding = ({ element: _element, ...f }: HealthFinding): SiteFinding => ({ ...f, owner: f.owner ? { ...f.owner } : null });

const tally = (list: SiteFinding[], severity: HealthSeverity) => list.filter(f => f.severity === severity).reduce((n, f) => n + f.count, 0);

/**
 * Adds up a run: problems on several pages are counted once and listed under "On several pages"; each page keeps
 * only its own. Pages that couldn't be checked come first, then the pages with the most to fix.
 */
export function mergeSiteFindings(results: PageResult[]): SiteReport {
  const where = new Map<string, { finding: SiteFinding; pages: string[] }>();
  for (const r of results) {
    for (const f of r.findings) {
      const key = `${f.id}|${f.title}`;
      const hit = where.get(key);
      if (hit) { hit.pages.push(r.route.label); hit.finding = { ...hit.finding, count: Math.max(hit.finding.count, f.count), severity: hit.finding.severity === "issue" ? "issue" : f.severity }; }
      else where.set(key, { finding: f, pages: [r.route.label] });
    }
  }
  const sharedKeys = new Set([...where].filter(([, v]) => v.pages.length > 1).map(([k]) => k));
  const shared: SharedFinding[] = [...where].filter(([k]) => sharedKeys.has(k)).map(([, v]) => ({ ...v.finding, pages: v.pages }))
    .sort((a, b) => (a.severity === b.severity ? b.pages.length - a.pages.length : a.severity === "issue" ? -1 : 1));
  const isShared = (f: SiteFinding) => sharedKeys.has(`${f.id}|${f.title}`);
  const pages = results.map(r => ({ ...r, findings: r.findings.filter(f => !isShared(f)), sharedIssues: r.findings.filter(f => isShared(f) && f.severity === "issue").length }));
  const rank = (r: PageResult) => (r.error ? -1 : 0);
  pages.sort((a, b) => rank(a) - rank(b) || tally(b.findings, "issue") + b.sharedIssues - tally(a.findings, "issue") - a.sharedIssues || tally(b.findings, "tip") - tally(a.findings, "tip"));
  const own = pages.flatMap(p => p.findings);
  return {
    pages, shared,
    totals: {
      pages: results.length, checked: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length,
      issues: tally(own, "issue") + tally(shared, "issue"), tips: tally(own, "tip") + tally(shared, "tip"),
    },
  };
}

/** Pictures and fonts the page downloaded, from the browser's own resource list. An estimate: pictures from another
 *  server that doesn't share timing details report no size. */
export function pageWeight(entries: { name: string; initiatorType?: string; transferSize?: number; encodedBodySize?: number }[]): PageWeight {
  let imageBytes = 0, fontBytes = 0;
  for (const e of entries || []) {
    const size = Number(e.encodedBodySize) || Number(e.transferSize) || 0;
    if (!size) continue;
    const path = String(e.name || "").split(/[?#]/)[0].toLowerCase();
    if (/\.(woff2?|ttf|otf)$/.test(path)) fontBytes += size;
    else if (e.initiatorType === "img" || /\.(avif|webp|png|jpe?g|gif|svg)$/.test(path)) imageBytes += size;
  }
  return { imageBytes, fontBytes };
}

export const formatBytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

// ── history (this browser only) ───────────────────────────────────────────────────────────────────
export type SiteRunSummary = { at: number; device: "desktop" | "tablet" | "mobile"; pages: number; issues: number; tips: number; failed: number };
export const SITE_HISTORY_MAX = 10;
export const siteHistoryKey = (base: string, uid: string) => `studio-site-health-v1:${base}:${uid}`;

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
export function parseSiteHistory(raw: string | null): SiteRunSummary[] {
  try {
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list.flatMap((r: any) => {
      const at = count(r?.at), pages = count(r?.pages), issues = count(r?.issues), tips = count(r?.tips), failed = count(r?.failed) ?? 0;
      const device = ["desktop", "tablet", "mobile"].includes(r?.device) ? r.device : null;
      return at && pages != null && issues != null && tips != null && device ? [{ at, device, pages, issues, tips, failed }] : [];
    }).slice(-SITE_HISTORY_MAX);
  } catch { return []; }
}
export const addSiteRun = (history: SiteRunSummary[], run: SiteRunSummary) => [...history, run].slice(-SITE_HISTORY_MAX);
export function loadSiteHistory(key: string): SiteRunSummary[] {
  try { return parseSiteHistory(localStorage.getItem(key)); } catch { return []; }
}
export function saveSiteHistory(key: string, history: SiteRunSummary[]) {
  try { localStorage.setItem(key, JSON.stringify(history.slice(-SITE_HISTORY_MAX))); } catch { /* private window: history is only a convenience */ }
}

/** "Issues 12 → 8 · suggestions 20 → 17" for the last two runs at the same size; null with fewer than two. */
export function historyTrend(history: SiteRunSummary[]): string | null {
  const last = history[history.length - 1];
  if (!last) return null;
  const before = [...history.slice(0, -1)].reverse().find(r => r.device === last.device);
  if (!before) return null;
  return `To fix ${before.issues} → ${last.issues} · suggestions ${before.tips} → ${last.tips}`;
}
