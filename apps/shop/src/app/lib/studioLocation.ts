// Links that open the Design studio at a particular place: `/admin#designer?t=productPage&b=night-pages&tab=style`.
// Used by What's new and the book editor.

export type StudioLocation = {
  templateId?: string; showGlobal?: boolean; productSlug?: string; collectionSlug?: string;
  leftTab?: "sections" | "style" | "text" | "menus" | "pages" | "media" | "themes"; device?: "desktop" | "tablet" | "mobile";
};

const TABS = new Set(["sections", "style", "text", "menus", "pages", "media", "themes"]);
// The old Shared layout tab became Page layout's Header / Footer groups (Studio 2.0 · 1.5).
const RETIRED_TABS: Record<string, StudioLocation["leftTab"]> = { shared: "sections" };
const DEVICES = new Set(["desktop", "tablet", "mobile"]);
const TEMPLATE = /^(heroPage|storefront|productPage|collectionPage|cartPage|page|page404|wishlistPage|accountPage|trackingPage|page:[\w-]{1,120})$/;
const SLUG = /^[\w-]{1,160}$/;

/** Read `#designer?…` (or just its query). Unknown or malformed values are ignored. */
export function parseStudioLocation(hashOrQuery: string): StudioLocation | null {
  const m = hashOrQuery.match(/^#?designer(?:\?(.*))?$/) || (hashOrQuery.startsWith("?") ? [hashOrQuery, hashOrQuery.slice(1)] : null);
  if (!m) return null;
  const q = new URLSearchParams(m[1] || "");
  const loc: StudioLocation = {};
  const t = q.get("t"); if (t && TEMPLATE.test(t)) loc.templateId = t;
  if (q.get("g") === "1") loc.showGlobal = true;
  const b = q.get("b"); if (b && SLUG.test(b)) { loc.productSlug = b; loc.templateId ??= "productPage"; }
  const c = q.get("c"); if (c && SLUG.test(c)) { loc.collectionSlug = c; loc.templateId ??= "collectionPage"; }
  const tab = q.get("tab"); if (tab && TABS.has(tab)) loc.leftTab = tab as StudioLocation["leftTab"]; else if (tab && RETIRED_TABS[tab]) loc.leftTab = RETIRED_TABS[tab];
  const d = q.get("d"); if (d && DEVICES.has(d)) loc.device = d as StudioLocation["device"];
  return loc;
}

export function studioHash(loc: StudioLocation): string {
  const q = new URLSearchParams();
  if (loc.templateId) q.set("t", loc.templateId);
  if (loc.showGlobal) q.set("g", "1");
  if (loc.productSlug) q.set("b", loc.productSlug);
  if (loc.collectionSlug) q.set("c", loc.collectionSlug);
  if (loc.leftTab) q.set("tab", loc.leftTab);
  if (loc.device) q.set("d", loc.device);
  const query = q.toString();
  return `#designer${query ? "?" + query : ""}`;
}

/** The Studio location matching a storefront address. */
export function locationForPath(pathname: string, base = "/"): StudioLocation {
  const path = "/" + pathname.slice(base.length).replace(/^\/+/, "");
  const decode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/books\/([^/]+)/))) return { templateId: "productPage", productSlug: decode(m[1]) };
  if ((m = path.match(/^\/collections\/([^/]+)/))) return { templateId: "collectionPage", collectionSlug: decode(m[1]) };
  if ((m = path.match(/^\/page\/([^/]+)/))) return { templateId: `page:${decode(m[1])}` };
  if (path === "/checkout") return { templateId: "cartPage" };
  if (path === "/wishlist") return { templateId: "wishlistPage" };
  if (path.startsWith("/account")) return { templateId: "accountPage" };
  if (path === "/track") return { templateId: "trackingPage" };
  return { templateId: "heroPage" };
}
