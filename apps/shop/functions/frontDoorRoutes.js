// Does a storefront page that hasn't been drawn yet really exist? (the front door, frontDoor.js, shared system step 5)
//
// The front door draws nothing itself: a shop's pages as first drawn are made by its publish run, which runs after a
// release, not after every catalogue change. A product added since then has no drawn page and still answers with the
// app's blank page, so the shopper sees it. A product that was never there, or was taken down, must answer "not found"
// (404) instead of a 200 that search engines file as a soft 404. And an old address the owner sent on in URL redirects
// (Settings › URL redirects, features/site/redirects.ts) answers with a real 301 rather than leaving the move to the page.
//
// It reads the shop's own folder at the database root (shops/<id>/…), only the few fields it needs, once per shop every
// five minutes, and only when a page is asked for that has no drawn copy. Any failure answers "unknown", and the front
// door keeps the blank page with a 200: never a false 404 for a real page.

const TTL_MS = 5 * 60 * 1000;
const MAX_SHOPS = 2000;
const POLICY_KEYS = ["shipping", "returns", "privacy", "terms", "accessibility"];
const MAX_HOPS = 5;
const REDIRECT_PAGES = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

// The storefront's own slug for a book saved without one (features/site/productRouteData.mjs titleSlug).
const titleSlug = (title = "") => String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Every address the storefront opens a live product at (features/site/productRoutes.ts findProduct): its id, its saved
 * slug, the slug made from its title. A few more than the storefront takes (a slug two books share), never fewer, so a
 * real product is never answered "not found".
 */
function productSlugs(books) {
  const slugs = new Set();
  for (const book of books) {
    if (book.status && book.status !== "published") continue;
    for (const slug of [book.id, book.slug, titleSlug(book.title)]) if (typeof slug === "string" && slug) slugs.add(slug);
  }
  return slugs;
}

// The redirect list's own rules (features/site/redirects.ts normalizePath / normalizeTarget; parity-tested).
function normalizePath(input) {
  let s = String(input || "").trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//")) return "";
  s = s.replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!s) return "/";
  try { s = decodeURI(s); } catch { /* keep as typed */ }
  return s.toLowerCase();
}

function normalizeTarget(input) {
  const s = String(input || "").trim().slice(0, 500);
  if (!s || /\s/.test(s)) return "";
  if (/^https:\/\/[^/\s]+/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//")) return "";
  return s.startsWith("/") ? s : "/" + s;
}

// Would `from` → `to` lead back to `from`, itself or through the earlier rules? (redirects.ts redirectProblemIn)
function loops(map, from, to) {
  let at = /^https:\/\//i.test(to) ? "" : normalizePath(to);
  for (let i = 0; at && i < MAX_HOPS + 1; i++) {
    if (at === from) return true;
    const next = map.get(at);
    at = next !== undefined && !/^https:\/\//i.test(next) ? normalizePath(next) : "";
  }
  return false;
}

/** Old address → new one, first one wins, as the storefront reads the list (redirects.ts redirectsFromStore). */
function redirectMap({ pages = [], legacy = null }) {
  const kept = pages.filter(p => REDIRECT_PAGES.has(p.id)).sort((a, b) => Number(a.id) - Number(b.id));
  const items = kept.length || legacy?.paged === true
    ? kept.flatMap(p => (Array.isArray(p.items) ? p.items : []))
    : (Array.isArray(legacy?.items) ? legacy.items : []);
  const map = new Map();
  for (const item of items) {
    const from = normalizePath(item?.from);
    const to = normalizeTarget(item?.to);
    if (!from || from === "/" || !to || map.has(from) || loops(map, from, to)) continue;
    map.set(from, to);
  }
  return map;
}

/** What one shop has, read at the database root inside its own folder. */
async function readCatalog(db, shopId) {
  const shop = db().collection("shops").doc(shopId);
  const [books, pages, settings, redirectPages, legacy] = await Promise.all([
    shop.collection("books").select("slug", "title", "status").get(),
    shop.collection("pages").select("slug", "status").get(),
    shop.collection("settings").doc("website").get(),
    shop.collection("redirects").get(),
    shop.collection("settings").doc("redirects").get(),
  ]);
  const pageSlugs = new Set();
  for (const doc of pages.docs) {
    const page = doc.data() || {};
    if (page.status === "published" && typeof page.slug === "string" && page.slug) pageSlugs.add(page.slug);
  }
  const policies = settings.exists ? settings.data()?.policies || {} : {};
  for (const key of POLICY_KEYS) if (typeof policies[key] === "string" && policies[key].trim()) pageSlugs.add(`policy-${key}`);
  return {
    products: productSlugs(books.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    pages: pageSlugs,
    redirects: redirectMap({
      pages: redirectPages.docs.map(doc => ({ id: doc.id, items: doc.data()?.items })),
      legacy: legacy.exists ? legacy.data() : null,
    }),
  };
}

/**
 * `check(shop, pathname)` for a storefront page with no drawn copy: { state: "live" | "missing" | "unknown", to? }.
 * `to` is set only for a missing page the owner redirected (an on-site path or an https address, as saved).
 * Collections come from the published design and are left "unknown" (the page itself says noindex when empty).
 */
function routeChecker({ db, now = () => Date.now(), read = readCatalog, log = console }) {
  const cache = new Map();
  async function catalog(shopId) {
    const hit = cache.get(shopId);
    if (hit && now() - hit.at < TTL_MS) return hit.data;
    const data = await read(db, shopId);
    if (cache.size >= MAX_SHOPS) cache.clear();
    cache.set(shopId, { at: now(), data });
    return data;
  }
  return async function check(shop, pathname) {
    const parts = String(pathname || "").replace(/\/+$/, "").split("/");
    if (parts.length !== 3) return { state: "unknown" };
    const [, kind, raw] = parts;
    let slug;
    try { slug = decodeURIComponent(raw); } catch { return { state: "unknown" }; }
    let data;
    try {
      data = await catalog(shop.id);
    } catch (err) {
      log.error?.(`shop ${shop.id}: couldn't check ${pathname}: ${err?.message || err}`);
      return { state: "unknown" };
    }
    let live = null;
    if (kind === "books" || kind === "products") live = data.products.has(slug);
    else if (kind === "page") live = data.pages.has(slug);
    if (live === null) return { state: "unknown" };
    if (live) return { state: "live" };
    // A real page is never sent on (the storefront's own rule), so only a page known to be missing is.
    const to = data.redirects.get(normalizePath(pathname));
    return to ? { state: "missing", to } : { state: "missing" };
  };
}

module.exports = { routeChecker, readCatalog, productSlugs, redirectMap, normalizePath, normalizeTarget, titleSlug, TTL_MS };
