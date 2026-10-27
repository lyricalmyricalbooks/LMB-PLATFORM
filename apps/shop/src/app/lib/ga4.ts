// Google Analytics 4 on the storefront. The measurement ID ("G-…") is set in Settings › General › Google Analytics
// and published as `settings/website.analytics.ga4MeasurementId`. Google's tag loads only when the visit may be
// counted (`googleTrackingAllowed`: analytics not declined, not the Studio preview or a share link, not the shop owner
// signed in), never in the prerender (it declines analytics) and never on admin pages. A later "decline" stops it at
// once (`ga-disable-<id>`). Events: page_view per route, view_item_list / select_item (book cards, lib/ga4Lists.ts),
// view_item, add_to_cart, add_to_wishlist, search, begin_checkout, add_shipping_info, add_payment_info, purchase,
// newsletter_signup and back_in_stock_signup; how visitors move: nav_click and scroll_depth (lib/ga4Nav.ts),
// pdp_interact, page_not_found, filter_use and view_cart (the helpers below).
// Google only ever sees `cleanLocation()`: emailed links carry addresses, signed tokens and private order keys in
// their query string, so only `ref`/`utm_*`/click ids are kept.
import { CONSENT_EVENT, consentAllows } from "./consent";
import { googleTrackingAllowed } from "./trackingGuard";
import { afterPageLoad } from "./afterPageLoad";
import { readSiteCache } from "../features/site/siteCache";

type Params = Record<string, unknown>;
export interface Ga4Item { item_id: string; item_name: string; price: number; quantity: number; item_variant?: string }
export interface Ga4ListItem { item_name: string; item_id?: string; item_list_name?: string; index?: number }

const MAX_QUEUE = 40;
let measurementId = "";
let loaded = false;
let allowed: Promise<boolean> | null = null;
let queue: Array<[string, Params]> = [];

/** "G-ABC123" (any case, spaces trimmed) or "" when it isn't a GA4 measurement ID. */
export function cleanMeasurementId(value: unknown): string {
  const v = String(value ?? "").trim().toUpperCase();
  return /^G-[A-Z0-9]{4,20}$/.test(v) ? v : "";
}

/** Pages that are never shopper traffic. */
export const isUntrackedPath = (path: string) => /(^|\/)(admin|studio-fixture)(\/|\.|$|#|\?)/.test(path);

const KEPT_PARAMS = /^(ref|utm_[a-z_]+|gclid|gbraid|wbraid|fbclid)$/i;

/** The page address Google may see: origin + path + campaign parameters only (no emails, tokens, keys, order ids). */
export function cleanLocation(href: string): string {
  try {
    const u = new URL(href);
    const kept = new URLSearchParams();
    u.searchParams.forEach((v, k) => { if (KEPT_PARAMS.test(k)) kept.append(k, v.slice(0, 100)); });
    const q = kept.toString();
    return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`;
  } catch {
    return "";
  }
}

/** Order lines → GA4 items (gift cards and box sets included; CAD prices as charged per copy). */
export function ga4Items(lines: any[]): Ga4Item[] {
  return (Array.isArray(lines) ? lines : []).filter(l => l && l.id).slice(0, 200).map(l => ({
    item_id: String(l.id),
    item_name: String(l.title || l.name || "Book").slice(0, 100),
    price: Math.round((Number(l.price) || 0) * 100) / 100,
    quantity: Math.max(1, Number(l.quantity) || 1),
    ...(l.variantName ? { item_variant: String(l.variantName).slice(0, 100) } : {}),
  }));
}

/** A book as a GA item from its id, named from the shop data this tab already read (lib/ga4Lists.ts does the same). */
export function ga4BookItem(bookId: string, books: any[] | null | undefined = readSiteCache()?.books): { item_id: string; item_name?: string } {
  const book = Array.isArray(books) ? books.find(b => b && String(b.id) === String(bookId)) : null;
  return { item_id: String(bookId), ...(book?.title ? { item_name: String(book.title).slice(0, 100) } : {}) };
}

/** The purchase event for a paid order, or null for test/sandbox orders. CAD totals, as stored on the order. */
export function purchaseEvent(orderId: string, order: any): Params | null {
  if (!orderId || !order || order.isTest === true || order.sandboxPayment === true) return null;
  return {
    transaction_id: String(order.orderId || orderId),
    currency: "CAD",
    value: Math.round((Number(order.total) || 0) * 100) / 100,
    tax: Number(order.tax) || 0,
    shipping: Number(order.shipping) || 0,
    ...(order.appliedDiscount?.code ? { coupon: String(order.appliedDiscount.code) } : {}),
    items: ga4Items(order.items),
  };
}

function load(id: string) {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function gtag() { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  // Page views are sent by the router (single-page app), so the automatic first one is off. Google's own events
  // (session start, engagement) read the page address and referrer from here, so they get the cleaned ones too.
  const page_referrer = cleanLocation(document.referrer || "");
  w.gtag("config", id, { send_page_view: false, page_location: cleanLocation(window.location.href), ...(page_referrer ? { page_referrer } : {}) });
  afterPageLoad(() => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  });
}

async function flush() {
  if (!measurementId || typeof window === "undefined" || !queue.length) return;
  allowed = allowed || googleTrackingAllowed().catch(() => false);
  const ok = await allowed;
  if (!ok || !consentAllows("analytics")) { queue = []; return; }
  load(measurementId);
  const pending = queue;
  queue = [];
  const gtag = (window as any).gtag;
  for (const [name, params] of pending) {
    const page_location = cleanLocation(String(params.page_location || window.location.href));
    gtag("set", { page_location });
    gtag("event", name, { ...params, page_location, send_to: measurementId });
  }
}

/** Called once the public settings are read. A missing or invalid ID keeps Google Analytics off. */
export function configureGa4(value: unknown) {
  const id = cleanMeasurementId(value);
  // No ID yet may just mean the settings haven't arrived: keep what is queued (MAX_QUEUE bounds it).
  if (!id || measurementId || typeof window === "undefined") return;
  measurementId = id;
  // Book-card views and clicks (lib/ga4Lists.ts), loaded only when there is a Google Analytics ID.
  void import("./ga4Lists").then(m => m.startListTracking()).catch(() => { /* best-effort */ });
  // Menu clicks and scroll depth (lib/ga4Nav.ts), the same way.
  void import("./ga4Nav").then(m => m.startNavTracking()).catch(() => { /* best-effort */ });
  window.addEventListener(CONSENT_EVENT, () => {
    // Declining analytics stops Google's tag immediately (Google's documented opt-out switch).
    (window as any)[`ga-disable-${id}`] = !consentAllows("analytics");
  });
  void flush();
}

export function ga4Event(name: string, params: Params = {}) {
  if (typeof window === "undefined" || isUntrackedPath(window.location.pathname)) return;
  if (queue.length >= MAX_QUEUE) return;
  queue.push([name, params]);
  void flush();
}

/** Sends `name` at most once per browser session for `key` (reloads and back-and-forth don't double count). */
export function ga4Once(key: string, name: string, params: Params = {}) {
  try {
    if (window.sessionStorage.getItem(`ga4_${key}`)) return;
    window.sessionStorage.setItem(`ga4_${key}`, "1");
  } catch {
    // storage unavailable: send it
  }
  ga4Event(name, params);
}

/** Book page actions: swiping or enlarging photos, opening a details tab, switching edition, sharing. */
export type PdpAction = "photo_swipe" | "photo_enlarge" | "tab_open" | "edition_switch" | "share";
export function ga4PdpInteract(action: PdpAction, extra: Params = {}) {
  ga4Event("pdp_interact", { ...extra, action });
}

/** The book page's tab ids, in the names the reports read. */
export const pdpTabName = (id: string) => (id === "specs" ? "details" : id === "reviews" ? "reviews" : id === "policies" ? "shipping_returns" : id === "artist" ? "artist_bio" : "description");

/** A missing page was shown (call only once the shop data is fresh): once per address per session. */
export function ga4PageNotFound() {
  if (typeof window === "undefined") return;
  ga4Once(`404_${window.location.pathname.slice(0, 200)}`, "page_not_found", {});
}

export type FilterName = "format" | "price" | "in_stock" | "on_sale" | "sort" | "category";
/** A shop filter was used. `value` is a short label (format key, sort key, category name, "on"/"off"), never a price. */
export function ga4FilterUse(filter: FilterName, value: unknown) {
  ga4Event("filter_use", { filter, value: String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 100) });
}

/** Which price boxes are filled: "min", "max", "both", or "" when neither (the numbers themselves are never sent). */
export function priceFilterValue(min: unknown, max: unknown): "" | "min" | "max" | "both" {
  const has = (v: unknown) => String(v ?? "").trim() !== "";
  return has(min) && has(max) ? "both" : has(min) ? "min" : has(max) ? "max" : "";
}

/** The bag drawer opened: GA4's view_cart, with the lines in it (CAD catalog prices, like add_to_cart). */
export function ga4ViewCart(lines: any[]) {
  const items = ga4Items(lines);
  if (!items.length) { ga4Event("view_cart", {}); return; }
  const value = Math.round(items.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100;
  ga4Event("view_cart", { currency: "CAD", value, items });
}

/** The last page sent, so an in-app move carries where it came from (Overview › Where people go next). */
let lastPage = "";

export function ga4PageView() {
  if (typeof window === "undefined") return;
  // Captured now (not at send time), so a slow consent check never pairs this view with a later page.
  const page_location = cleanLocation(window.location.href);
  // The first page names the page the visitor came from (cleaned here: gtag would otherwise send document.referrer
  // whole, which can be one of the shop's own /track?…&key=… or payment-return addresses); later ones name the
  // previous page, which the single-page app never reports by itself.
  const page_referrer = lastPage ? (lastPage !== page_location ? lastPage : "") : cleanLocation(document.referrer || "");
  lastPage = page_location;
  ga4Event("page_view", { page_location, page_title: document.title, ...(page_referrer ? { page_referrer } : {}) });
}

/** Test hook: forget the module state between tests. */
export function __resetGa4ForTests() { measurementId = ""; loaded = false; allowed = null; queue = []; lastPage = ""; }
