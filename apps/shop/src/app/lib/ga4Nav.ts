// Google Analytics: how visitors move around the shop. Two events, loaded only when Google Analytics is configured
// (`startNavTracking` is called by configureGa4, like lib/ga4Lists.ts), and every event still goes through ga4Event's
// consent, owner, preview and admin-page checks.
//  - `nav_click` { menu, link_text }: a click on a link or button in the header, the category bar, the phone navigation
//    or the footer. One delegated listener; a region names itself with `data-ga-menu` ("header" | "categories" |
//    "phone" | "footer"), else the shop's `<header data-fm-header>` / `<footer data-fm-footer>` count as header/footer.
//    Sections placed inside the header (`data-fm-section`) are not navigation. Drop-down panels are drawn at the end of
//    the page, so NavDropdown copies its menu name onto the panel.
//  - `scroll_depth` { percent: 25 | 50 | 75 | 100 }: once per threshold per page (a new address starts again), from a
//    passive scroll listener read once per frame. Only scrolls the visitor made count (a page opened at the top, or
//    moved there by the router, reports nothing until it is scrolled).
import { cleanLocation, ga4Event, isUntrackedPath } from "./ga4";

export type NavMenu = "header" | "categories" | "phone" | "footer";
const MENUS: readonly NavMenu[] = ["header", "categories", "phone", "footer"];
const CLICKABLE = "a[href], button, [role='menuitem'], [role='tab']";
const REGION = "[data-ga-menu], [data-fm-section], [data-fm-header], [data-fm-footer]";
export const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;

const clean = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

/** The label a shopper sees on a nav entry: its aria-label (icon links and the bag button, whose text is a count),
 *  else its text, else its title. Trimmed, at most 100 characters. */
export function linkTextOf(el: Element): string {
  return (clean(el.getAttribute("aria-label")) || clean(el.textContent) || clean(el.getAttribute("title"))).slice(0, 100);
}

/** Which menu an element sits in, or null when it isn't in the shop's navigation. */
export function navMenuOf(el: Element | null): NavMenu | null {
  const region = el?.closest(REGION);
  if (!region) return null;
  const named = region.getAttribute("data-ga-menu");
  if (named !== null) return (MENUS as readonly string[]).includes(named) ? (named as NavMenu) : null;
  if (region.hasAttribute("data-fm-section")) return null;
  return region.hasAttribute("data-fm-footer") ? "footer" : "header";
}

/** The nav_click for a click target, or null (not navigation, a menu opener, or nothing to name it by). */
export function navClickOf(target: Element | null): { menu: NavMenu; link_text: string } | null {
  const el = target?.closest(CLICKABLE);
  if (!el) return null;
  // Opening a drop-down or the phone menu isn't a move; the pick inside it is.
  if (el.hasAttribute("aria-haspopup")) return null;
  const menu = navMenuOf(el);
  if (!menu) return null;
  const link_text = linkTextOf(el);
  return link_text ? { menu, link_text } : null;
}

/** How far down the page the visitor has seen, 0–100 (the bottom of the screen against the page's height). */
export function scrollPercent(scrollY: number, viewportHeight: number, pageHeight: number): number {
  if (!(pageHeight > 0) || !(viewportHeight > 0)) return 0;
  // A couple of pixels short of the end (rounding, zoom) still counts as the bottom.
  const seen = Math.min(pageHeight, Math.max(0, scrollY) + viewportHeight + 2);
  return Math.max(0, Math.min(100, (seen / pageHeight) * 100));
}

/** Thresholds reached at `percent` that haven't been sent yet, lowest first. */
export function newThresholds(percent: number, reached: ReadonlySet<number>): number[] {
  return SCROLL_THRESHOLDS.filter(t => percent >= t && !reached.has(t));
}

let started = false;
let scrollPath = "";
let reached = new Set<number>();
let frame = 0;

function checkScroll() {
  frame = 0;
  const path = window.location.pathname;
  if (path !== scrollPath) { scrollPath = path; reached = new Set(); }
  if (isUntrackedPath(path)) return;
  const doc = document.documentElement;
  const viewport = window.innerHeight || doc.clientHeight;
  const height = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
  // Nothing to scroll, or back at the very top (the router's scroll-to-top on a new page): no depth to report.
  if (window.scrollY <= 0 || height <= viewport) return;
  for (const percent of newThresholds(scrollPercent(window.scrollY, viewport, height), reached)) {
    reached.add(percent);
    ga4Event("scroll_depth", { percent, page_location: cleanLocation(window.location.href) });
  }
}

/** Starts the nav-click and scroll-depth listeners once Google Analytics is configured (idempotent; no-op outside a browser). */
export function startNavTracking(): void {
  if (started || typeof window === "undefined" || typeof document === "undefined") return;
  started = true;
  scrollPath = window.location.pathname;

  // Capture phase: runs before the router moves, so the event names the page the click was made on.
  document.addEventListener("click", e => {
    if (isUntrackedPath(window.location.pathname)) return;
    const hit = navClickOf(e.target instanceof Element ? e.target : null);
    if (hit) ga4Event("nav_click", { ...hit, page_location: cleanLocation(window.location.href) });
  }, true);

  window.addEventListener("scroll", () => {
    if (!frame) frame = window.requestAnimationFrame(checkScroll);
  }, { passive: true });
}

/** Test hook. */
export function __resetGa4NavForTests() { started = false; scrollPath = ""; reached = new Set(); frame = 0; }
