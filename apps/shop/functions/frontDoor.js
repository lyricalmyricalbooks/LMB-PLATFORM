// The front door (the shared system, LMB-PLATFORM docs/shared-system.md, step 5): one Hosting site answers for every
// shop's web address, and this function tells the shops apart by the address the visitor typed.
//
//   addresses/{host}          { shopId }   which shop an address belongs to: the free address and any own domain.
//                                          Written only by the platform; no browser can read it (outside shops/).
//   shops/{shopId}            .profile     the shop's public profile (profile/shop-profile.schema.json), written by
//                                          the platform with the record.
//   shops/<id>/site/<file>    in the bucket: the shop's own published files (its pages as first drawn, sitemap, robots,
//                                          catalogue file, product feeds), written by the shop's publish run.
//
// What it answers (Hosting sends it only these paths; firebase.json `rewrites` in the shared deploy):
//   /shop-profile.js, /stockroom/shop-profile.js   the shop's profile, as the apps read it at page open
//   SITE_FILES (sitemap.xml, robots.txt, …)        the shop's own published file, or a plain default
//   /google<hex>.html                              Google's Search Console proof file, put there by Connect Google
//   a storefront page (/, /books/x, …)             the shop's page as first drawn, or the app's blank page (spa.html)
//                                                  made the shop's own (`shopShell`); 404 for a page the shop doesn't
//                                                  have, 301 for one the owner redirected (frontDoorRoutes.js); asked
//                                                  for on another of the shop's addresses, 301 to its main address
// An address that names no shop, or a closed shop, gets a short page saying so. Nothing here writes.

const zlib = require("node:zlib");
const { usageLine } = require("./usageLog");
const { isShopId } = require("./shopScope");

/** Files every shop publishes for itself, served from its own site folder. */
const SITE_FILES = new Set([
  "sitemap.xml", "robots.txt", "storefront-data.json", "llms.txt", "google-merchant-feed.xml", "social-product-feed.csv",
  "seo-published-fingerprint.txt",
]);
/** Google's Search Console proof file, which the platform's Connect Google puts in the shop's site folder. */
const VERIFICATION_FILE = /^google[0-9a-f]{8,32}\.html$/;
const PROFILE_PATHS = new Set(["/shop-profile.js", "/stockroom/shop-profile.js"]);
const SNAPSHOT_KINDS = new Set(["books", "products", "page", "collections"]);
const TYPES = {
  ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".html": "text/html; charset=utf-8",
};
const ADDRESS_TTL_MS = 60 * 1000;
const SHELL_TTL_MS = 5 * 60 * 1000;
const FILE_CACHE_TTL_MS = 60 * 1000;
const FILE_MISS_TTL_MS = 30 * 1000;
const FILE_CACHE_MAX_BYTES = 16 * 1024 * 1024;
const FILE_CACHE_MAX_ENTRIES = 2000;
const PUBLIC_PAGE_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
const PUBLIC_FILE_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";
/** The app's own script a page loads ("index-abc123.js"), or null when it names none. */
const appScript = (html) => /<script[^>]+src="[^"]*\/assets\/(index-[\w-]+\.js)"/.exec(String(html ?? ""))?.[1] ?? null;

/** The address the visitor typed, lower case, without a port; "" when it isn't a plain host name. */
function hostOf(req) {
  const raw = String(req.get?.("x-forwarded-host") || req.headers?.["x-forwarded-host"] || req.hostname || req.headers?.host || "");
  const host = raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host) && host.length <= 253 ? host : "";
}

/** The prerender's own rule for a slug that can be a file name (scripts/routeSafety.mjs safeSlug; parity-tested). */
function safeSlug(slug) {
  const value = String(slug ?? "");
  return !!value && value.length <= 200 && value !== "." && value !== ".." && !/[\\/%\x00-\x1f<>:"|?*]/.test(value) && !/[. ]$/.test(value);
}

/**
 * The shop's file for a storefront page, as the prerender names it (apps/shop/scripts/prerenderHtml.mjs
 * routeOutputPath): "/" is index.html, "/books/x" is books/x.html. Null for any other path or an unsafe name.
 */
function snapshotFile(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "index.html";
  const parts = pathname.replace(/\/+$/, "").split("/");
  if (parts.length !== 3 || !SNAPSHOT_KINDS.has(parts[1])) return null;
  let slug;
  try { slug = decodeURIComponent(parts[2]); } catch { return null; }
  if (!safeSlug(slug)) return null;
  return `${parts[1]}/${slug}.html`;
}

/** The profile script the apps read at page open (same text as profile/profile.js profileScript). */
function profileScript(profile) {
  const json = JSON.stringify(profile, null, 2).replace(/</g, "\\u003c");
  return `// Written by the platform. Do not edit by hand.\nwindow.__SHOP_PROFILE__ = ${json};\n`;
}

// The owner's private bookings calendar (Google or Apple Calendar subscribes to it).
const CALENDAR_PATH = /^\/calendar\/([a-f0-9]{48})\.ics$/;
// One booking as a calendar file, for the customer (its id and the customer's own key).
const BOOKING_CALENDAR_PATH = /^\/calendar\/b\/([A-Za-z0-9_-]{6,40})\/([a-f0-9]{48})\.ics$/;

// The words the app's blank page (index.html, built once for every shop) is written with. The front door puts the
// shop's own name and address in their place before sending it (`shopShell`); apps/shop/scripts/indexShell.test.ts keeps
// index.html using exactly these.
const TEMPLATE_NAME = "Your Press";
const STATIC_JSON_LD = /<script type="application\/ld\+json" id="seo-jsonld-static">[\s\S]*?<\/script>\s*/;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The shop's main address from its profile (https, no path), or "". */
function siteOf(profile) {
  try {
    const url = new URL(String(profile?.siteUrl || ""));
    return url.protocol === "https:" && url.pathname.replace(/\/+$/, "") === "" && !url.search ? url.origin : "";
  } catch {
    return "";
  }
}

/** A storefront page's own address, as the pages name it (lib/canonicalUrl.ts: no trailing slash on a content page). */
function pageUrl(site, pathname) {
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return site + path;
}

/**
 * The app's blank page as this shop's: its address in place of the template's (og:url names the page itself, with a
 * canonical link when the page exists), its name in place of the template's, its country in og:locale, and none of the
 * template's no-JS shop description. A page that doesn't exist says noindex. Only <head> is changed.
 */
function shopShell(html, profile, pathname, { missing = false } = {}) {
  const site = siteOf(profile);
  const end = html.indexOf("</head>");
  if (end < 0) return html;
  let head = html.slice(0, end).replace(STATIC_JSON_LD, "");
  const here = site ? pageUrl(site, pathname) : "";
  if (here) {
    head = head.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeHtml(here)}$2`);
    head = head.replace(/\s*<link rel="canonical"[^>]*>/g, "");
    if (!missing) head += `  <link rel="canonical" href="${escapeHtml(here)}" />\n  `;
  }
  const name = typeof profile?.name === "string" ? profile.name.trim() : "";
  if (name) head = head.split(TEMPLATE_NAME).join(escapeHtml(name));
  if (profile?.currency === "USD") head = head.replace(/(<meta property="og:locale" content=")[^"]*(")/, "$1en_US$2");
  if (missing) head = head.replace(/(<meta name="robots" content=")[^"]*(")/, "$1noindex$2");
  return head + html.slice(end);
}

const page = (title, words) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.4rem">${title}</h1><p>${words}</p></body></html>`;

/**
 * @param {object} deps
 * @param {() => any} deps.rootDb   Firestore at the database root (unscoped), read only for addresses and records
 * @param {() => any} deps.bucket   the shared file bucket (unscoped), read only under shops/<id>/site/
 * @param {(id: string) => Promise<object|null>} deps.loadShop  shopEntry's record reader (cached)
 * @param {() => string} deps.shellUrl  where the app's blank page is (the shared site's /spa.html)
 * @param {(shop: object, pathname: string) => Promise<{ state: string, to?: string }>} [deps.routeCheck]  does a page
 *   with no drawn copy exist (frontDoorRoutes.js routeChecker); without it every such page answers the blank page
 * @param {(shop: object, token: string) => Promise<string|null>} [deps.calendarFeed]  the owner's bookings calendar (bookings.js bookingsFeed)
 */
/** The path and query the visitor asked for, as given ("/books/x?ref=1"); the bare path when that can't be read. */
function pathOf(req, pathname) {
  const raw = String(req.originalUrl || req.url || "");
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : pathname;
}

// Hosting passes this function's answers on as they are, so it squeezes its own: a drawn page of about 80 KB goes out
// as about 15 KB. Brotli where the browser or crawler takes it (Googlebot does), else gzip; small or binary bodies as is.
const SQUEEZE_MIN = 1024;
const SQUEEZABLE = /^(text\/|application\/(json|xml|javascript))/;
function preferredEncoding(req) {
  const accepts = String(req.get?.("accept-encoding") || req.headers?.["accept-encoding"] || "").toLowerCase();
  const takes = (name) => accepts.split(",").some((part) => {
    const [coding, ...params] = part.split(";").map((x) => x.trim());
    const q = params.find((x) => x.startsWith("q="));
    return coding === name && !(q && Number(q.slice(2)) === 0);
  });
  if (takes("br")) return "br";
  if (takes("gzip")) return "gzip";
  return "";
}

function squeeze(req, type, body, cached = null) {
  if (body == null || !SQUEEZABLE.test(type)) return null;
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  if (raw.length < SQUEEZE_MIN) return null;
  const coding = preferredEncoding(req);
  if (!coding) return null;
  if (cached?.[coding]) return { encoding: coding, body: cached[coding] };
  const compressed = coding === "br"
    ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
    : zlib.gzipSync(raw, { level: 6 });
  if (cached) cached[coding] = compressed;
  return { encoding: coding, body: compressed };
}

/** robots.txt for a shop that hasn't published its own yet: the same lines its publish run writes (scripts/sitemapData.mjs). */
function defaultRobots(site) {
  return "User-agent: *\nAllow: /\n" + ["admin", "checkout", "account", "wishlist", "track"].map((route) => `Disallow: /${route}\n`).join("") + `\nSitemap: ${site}/sitemap.xml\n`;
}

function frontDoor({ rootDb, bucket, loadShop, shellUrl, routeCheck = null, calendarFeed = null, bookingCalendar = null, fetch = globalThis.fetch, now = () => Date.now(), log = console, usage = usageLine }) {
  const addresses = new Map();
  const files = new Map();
  let fileCacheBytes = 0;
  let shell = null;

  async function shopIdFor(host) {
    const hit = addresses.get(host);
    if (hit && now() - hit.at < ADDRESS_TTL_MS) return hit.id;
    const snap = await rootDb().collection("addresses").doc(host).get();
    const id = snap.exists && isShopId(snap.data()?.shopId) ? snap.data().shopId : null;
    if (addresses.size >= 5000) addresses.clear(); // made-up Host names can't grow it without end
    addresses.set(host, { at: now(), id });
    return id;
  }

  /** The shop's own published file (cached briefly in memory with pre-compressed variants), or null when missing. */
  async function siteFileEntry(shopId, name) {
    const key = `${shopId}/${name}`;
    const hit = files.get(key);
    const ttl = hit?.body == null ? FILE_MISS_TTL_MS : FILE_CACHE_TTL_MS;
    if (hit && now() - hit.at < ttl) {
      files.delete(key);
      files.set(key, hit);
      return hit;
    }
    if (hit) {
      fileCacheBytes -= hit.bytes;
      files.delete(key);
    }
    const file = bucket().file(`shops/${shopId}/site/${name}`);
    let body = null;
    try {
      const [downloaded] = await file.download();
      body = downloaded;
    } catch (err) {
      if (!(err?.code === 404 || /No such object/i.test(String(err?.message)))) throw err;
    }
    const bytes = body ? Buffer.byteLength(body) : 0;
    const entry = { at: now(), body, bytes, br: null, gzip: null };
    if (bytes <= FILE_CACHE_MAX_BYTES / 4) {
      while (files.size >= FILE_CACHE_MAX_ENTRIES || fileCacheBytes + bytes > FILE_CACHE_MAX_BYTES) {
        const oldest = files.keys().next().value;
        if (!oldest) break;
        fileCacheBytes -= files.get(oldest).bytes;
        files.delete(oldest);
      }
      files.set(key, entry);
      fileCacheBytes += bytes;
    }
    return entry;
  }

  /** The app's blank page, read from the shared site and kept five minutes. */
  async function blankPage(fresh = false) {
    if (!fresh && shell && now() - shell.at < SHELL_TTL_MS) return shell.html;
    const response = await fetch(shellUrl());
    if (!response.ok) throw new Error(`The app's blank page answered ${response.status}.`);
    shell = { at: now(), html: await response.text() };
    return shell.html;
  }

  // A drawn page loads the app it was drawn with. When a shop's pages couldn't be drawn again for the app now online
  // (the drawing failed in a release), that app's files are gone and the page would show with no styling at all, so
  // the blank page of today's app answers instead until the shop's pages are drawn again. A shell that can't be read
  // never hides a drawn page.
  async function sameApp(body) {
    const drawn = appScript(body);
    if (!drawn) return true;
    try {
      if (appScript(await blankPage()) === drawn) return true;
      const current = appScript(await blankPage(true));
      return !current || current === drawn;
    } catch {
      return true;
    }
  }

  return async function answer(req, res) {
    let metered = null;
    // Cached an hour, not for ever: an owner who makes another address main later must not meet an old answer.
    const moved = (to) => res.status(301).set("Location", to).set("Cache-Control", "private, max-age=3600").send("");
    const send = (status, type, body, cache = "no-cache", cached = null) => {
      const squeezed = squeeze(req, type, body, cached);
      if (squeezed) res.set("Content-Encoding", squeezed.encoding);
      if (SQUEEZABLE.test(type)) res.set("Vary", "Accept-Encoding");
      const out = squeezed ? squeezed.body : body;
      // The shop's web traffic, by size (usageLog.js): what each shop's meter counts for the pages it serves, as sent.
      if (metered) {
        try { usage({ shop: metered, kind: "page", bytes: req.method === "HEAD" ? 0 : Buffer.byteLength(out ?? "") }); } catch { /* never breaks the answer */ }
      }
      return res.status(status).set("Content-Type", type).set("Cache-Control", cache).send(out);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, TYPES[".txt"], "Only reading is possible here.");
    const host = hostOf(req);
    const shopId = host ? await shopIdFor(host) : null;
    const shop = shopId ? await loadShop(shopId) : null;
    if (!shop) return send(404, TYPES[".html"], page("There is no shop here", "This address isn't linked to a shop. Check the address, or ask the shop for its current one."));
    metered = shop.id;
    if (shop.status === "closed") return send(410, TYPES[".html"], page("This shop has closed", "Thank you for visiting. This shop is no longer open."));

    const pathname = String(req.path || "/");
    if (PROFILE_PATHS.has(pathname)) {
      const profile = shop.record?.profile;
      if (!profile || profile.shopId !== shop.id) {
        log.error?.(`shop ${shop.id}: its record has no profile for its own id`);
        return send(503, "text/javascript; charset=utf-8", "// This shop's profile isn't ready yet.\n");
      }
      return send(200, "text/javascript; charset=utf-8", profileScript({ ...profile, ...(shop.tenant ? { tenant: shop.tenant } : {}) }), PUBLIC_FILE_CACHE);
    }

    const one = BOOKING_CALENDAR_PATH.exec(pathname);
    if (one) {
      const body = bookingCalendar ? await bookingCalendar(shop, one[1], one[2]) : null;
      if (body) res.set("Content-Disposition", 'inline; filename="booking.ics"');
      return body ? send(200, "text/calendar; charset=utf-8", body, "private, no-store") : send(404, TYPES[".txt"], "This booking isn't on any more. Check your latest email from the shop.");
    }
    const feed = CALENDAR_PATH.exec(pathname);
    if (feed) {
      const body = calendarFeed ? await calendarFeed(shop, feed[1]) : null;
      return body ? send(200, "text/calendar; charset=utf-8", body, "private, max-age=300") : send(404, TYPES[".txt"], "This calendar link no longer works. Get a new one in your shop's Bookings page.");
    }

    const name = pathname.replace(/^\/+/, "");
    if (SITE_FILES.has(name)) {
      const entry = await siteFileEntry(shop.id, name);
      const type = TYPES[name.slice(name.lastIndexOf("."))];
      if (entry.body) return send(200, type, entry.body, PUBLIC_FILE_CACHE, entry);
      if (name === "robots.txt") return send(200, type, defaultRobots(siteOf(shop.record?.profile) || `https://${host}`), PUBLIC_FILE_CACHE);
      return send(404, TYPES[".txt"], "Not published yet.");
    }

    if (VERIFICATION_FILE.test(name)) {
      const entry = await siteFileEntry(shop.id, name);
      return entry.body ? send(200, TYPES[".html"], entry.body, PUBLIC_FILE_CACHE, entry) : send(404, TYPES[".txt"], "Not published.");
    }

    const snapshot = snapshotFile(pathname);
    const profile = shop.record?.profile;
    // One address per shop: a page asked for on another of its addresses (its free address once it has its own domain,
    // a former address) moves for good to the main one, so search engines see one copy. Only when the main address is
    // this same shop's, so a profile that names somewhere else never sends visitors away.
    const site = siteOf(profile);
    // The owner's own previews (Studio's frame, Preview page from the book editor) stay on the address the admin is
    // open on, and a draft they preview is never answered "not found".
    const ownerView = /[?&]preview=/.test(pathOf(req, "")) || String(req.get?.("sec-fetch-dest") || req.headers?.["sec-fetch-dest"] || "") === "iframe";
    // A page asked for with a trailing slash (/books/x/) moves to the one without, the address the sitemap and
    // canonical name, so the two never compete.
    if (snapshot && !ownerView) {
      const main = site ? new URL(site).hostname : host;
      const away = main !== host && (await shopIdFor(main)) === shop.id;
      const slash = pathname !== "/" && pathname.endsWith("/");
      if (away || slash) {
        const asked = pathOf(req, pathname);
        const query = asked.includes("?") ? asked.slice(asked.indexOf("?")) : "";
        return moved((away ? site : `https://${host}`) + (slash ? pathname.replace(/\/+$/, "") : pathname) + query);
      }
    }
    const entry = snapshot ? await siteFileEntry(shop.id, snapshot) : null;
    if (entry?.body && (await sameApp(entry.body))) return send(200, TYPES[".html"], entry.body, ownerView ? "no-cache" : PUBLIC_PAGE_CACHE, entry);
    // Not drawn yet: a product added since the last publish run (blank page, 200), or one that isn't there (404).
    const check = snapshot && snapshot !== "index.html" && routeCheck && !ownerView ? await routeCheck(shop, pathname) : { state: "unknown" };
    if (check.state === "missing" && check.to) {
      const to = /^https:\/\//i.test(check.to) ? check.to : (site || `https://${host}`) + check.to;
      return moved(to);
    }
    const missing = check.state === "missing";
    return send(missing ? 404 : 200, TYPES[".html"], shopShell(await blankPage(), profile, pathname, { missing }), missing || ownerView ? "no-cache" : PUBLIC_PAGE_CACHE);
  };
}

module.exports = { appScript, shopShell, siteOf, defaultRobots, TEMPLATE_NAME, BOOKING_CALENDAR_PATH, CALENDAR_PATH, frontDoor, hostOf, snapshotFile, safeSlug, profileScript, SITE_FILES, TYPES, ADDRESS_TTL_MS, VERIFICATION_FILE, PUBLIC_PAGE_CACHE, PUBLIC_FILE_CACHE };
