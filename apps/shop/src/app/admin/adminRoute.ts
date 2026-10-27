// The admin page lives in the address bar (`/admin#orders/<id>`, `/admin#settings/payments`), so a reload,
// the browser Back/Forward buttons and a copied link all land on the same page. Pure and tested.
// Studio links (`#designer?…`) are read by `parseStudioLocation`; gift-card links keep `#gift-cards/<id>`.
// A page split into sub tabs adds a readable slug for the open one (`#settings/general/visitors`, `#inventory/link`);
// the first (default) sub tab has none, so the older addresses stay as they were.

export type AdminRoute = { tab: string; settingsTab?: string; orderId?: string; giftCardId?: string; subTab?: string; bookId?: string };

export const ADMIN_TABS = ["overview", "analytics", "orders", "customers", "inventory", "catalog", "discounts", "giftCards", "reviews", "messages", "settings"] as const;
/** Old Settings page ids that now open another page (Email sender was merged into the one email page). */
export const SETTINGS_TAB_ALIASES: Record<string, string> = { communications: "notifications" };
/** The Settings page an id really opens (an alias resolves to its page). */
export const settingsPageOf = (id: string): string => SETTINGS_TAB_ALIASES[id] || id;

export const SETTINGS_TABS = ["general", "shipping", "payments", "notifications", "taxes", "communications", "designer"] as const;

/** Sub tabs per page (a Settings page id, or a top-level tab): address slug → the page's own tab id. The first is the default. */
export const SUB_TABS: Record<string, Array<[slug: string, id: string]>> = {
  general: [["store", "gs-store"], ["details", "gs-details"], ["visitors", "gs-visitors"], ["tools", "gs-tools"]],
  payments: [["status", "pay-status"], ["methods", "pay-methods"], ["more", "pay-more"]],
  notifications: [["templates", "email-templates"], ["setup", "email-setup"], ["deliveries", "email-deliveries"]],
  shipping: [["overview", "overview"], ["profiles", "profiles"], ["carrier", "carrier"], ["local", "local"]],
  inventory: [["stock", "inv-stock"], ["link", "inv-link"]],
};
/** Old Settings page ids that open a particular sub tab (Email sender's address opens Sending setup). */
const ALIAS_SUB_TABS: Record<string, string> = { communications: "email-setup" };

/** The page whose sub tabs a route names: the Settings page (aliases resolved) or the top-level tab. */
export function subTabPage(r: Pick<AdminRoute, "tab" | "settingsTab">): string {
  return r.tab === "settings" ? settingsPageOf(r.settingsTab || "general") : r.tab;
}
/** A slug from the address → that page's tab id; the default tab and unknown slugs give undefined. */
export function subTabFromSlug(page: string, slug: string | undefined): string | undefined {
  const tabs = SUB_TABS[page];
  const hit = slug && tabs ? tabs.find(([s]) => s === slug) : undefined;
  return hit && hit !== tabs[0] ? hit[1] : undefined;
}
/** A page's tab id → its address slug; the default tab and unknown ids give "". */
export function slugForSubTab(page: string, id: string | undefined): string {
  const tabs = SUB_TABS[page];
  const hit = id && tabs ? tabs.find(([, t]) => t === id) : undefined;
  return hit && hit !== tabs[0] ? hit[0] : "";
}
const withSub = (r: AdminRoute, slug?: string): AdminRoute => {
  const subTab = subTabFromSlug(subTabPage(r), slug);
  return subTab ? { ...r, subTab } : r;
};

const TABS = new Set<string>(ADMIN_TABS);
const SETTINGS = new Set<string>(SETTINGS_TABS);
const decode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };

/** Read an admin hash. Studio (`#designer…`) and unknown hashes return null. */
export function routeFromHash(hash: string): AdminRoute | null {
  const h = hash.replace(/^#/, "").split("?")[0];
  if (!h) return null;
  const [head, rest] = [h.split("/")[0], h.split("/").slice(1).join("/")];
  if (head === "gift-cards") return { tab: "giftCards", ...(rest ? { giftCardId: decode(rest) } : {}) };
  if (head === "orders") return { tab: "orders", ...(rest ? { orderId: decode(rest) } : {}) };
  // A book opened from the inventory app's search: Books with that book in the editor.
  if (head === "catalog" && rest.startsWith("book/")) {
    const bookId = decode(rest.slice(5)).trim();
    return BOOK_ID.test(bookId) ? { tab: "catalog", bookId } : { tab: "catalog" };
  }
  const [page, slug] = rest.split("/");
  if (head === "settings") {
    const known = SETTINGS.has(page) && page !== "designer";
    const route: AdminRoute = { tab: "settings", settingsTab: known ? settingsPageOf(page) : "general" };
    if (known && !slug && ALIAS_SUB_TABS[page]) return { ...route, subTab: ALIAS_SUB_TABS[page] };
    return known ? withSub(route, slug) : route;
  }
  // Shipping and Payments can also be top-level tabs; they are Settings pages.
  if (head === "shipping" || head === "payments") return withSub({ tab: "settings", settingsTab: head }, page);
  if (TABS.has(head)) return withSub({ tab: head }, page);
  return null;
}

const BOOK_ID = /^[^/\s]{1,200}$/;
export const SEARCH_HASH_KEY = "search";
const SEARCH_MAX = 100;

/** `#search=<text>` (the inventory app's "Search the website for …"): the text to open the admin search with, else null. */
export function searchFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith(`${SEARCH_HASH_KEY}=`)) return null;
  const text = decode(raw.slice(SEARCH_HASH_KEY.length + 1)).replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  return text || null;
}

/** The hash for the page on screen. Studio returns `#designer` (its own links add the query). */
export function hashForRoute(r: AdminRoute): string {
  const page = subTabPage(r);
  // An alias with no sub tab chosen yet opens the sub tab it stands for.
  const slug = slugForSubTab(page, r.subTab || (r.tab === "settings" ? ALIAS_SUB_TABS[r.settingsTab || ""] : undefined));
  const sub = slug ? `/${slug}` : "";
  if (r.tab === "shipping" || r.tab === "payments") return `#settings/${r.tab}${sub}`;
  if (r.tab === "settings") return r.settingsTab === "designer" ? "#designer" : `#settings/${page}${sub}`;
  if (r.tab === "orders") return r.orderId ? `#orders/${encodeURIComponent(r.orderId)}` : "#orders";
  if (r.tab === "giftCards") return "#gift-cards";
  return TABS.has(r.tab) ? `#${r.tab}${sub}` : "#overview";
}

/** Same page, only a different order or sub tab open? Then the address is replaced instead of adding a Back step. */
export function sameSection(a: string, b: string): boolean {
  const orders = (h: string) => /^#?orders(\/|$)/.test(h);
  if (orders(a) && orders(b)) return true;
  const [ra, rb] = [routeFromHash(a), routeFromHash(b)];
  return !!(ra && rb && ra.tab !== "orders" && ra.tab === rb.tab && ra.settingsTab === rb.settingsTab);
}

/** The address already shows this page with a sub tab of its own (`#overview/visitors/move` for `#overview`): keep it. */
export function keepsSubTab(current: string, next: string): boolean {
  return next === "#overview" && /^#overview\/[a-z]/.test(current);
}

/**
 * Fired after the Overview writes its own sub tab into the address (it does so without Dashboard), so Dashboard's
 * record of the last address it saw stays current for Back/Forward and for putting the address back under an editor.
 */
export const OVERVIEW_HASH_EVENT = "lm:overview-hash";

/** Browser-tab title for the page on screen. */
export function adminDocumentTitle(pageTitle: string): string {
  return `${pageTitle} · Lyricalmyrical admin`;
}
