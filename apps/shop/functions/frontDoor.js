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
// An address that names no shop, or a closed shop, gets a short page saying so. Nothing here writes.

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

const page = (title, words) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.4rem">${title}</h1><p>${words}</p></body></html>`;

/**
 * @param {object} deps
 * @param {() => any} deps.rootDb   Firestore at the database root (unscoped), read only for addresses and records
 * @param {() => any} deps.bucket   the shared file bucket (unscoped), read only under shops/<id>/site/
 * @param {(id: string) => Promise<object|null>} deps.loadShop  shopEntry's record reader (cached)
 * @param {() => string} deps.shellUrl  where the app's blank page is (the shared site's /spa.html)
 */
function frontDoor({ rootDb, bucket, loadShop, shellUrl, fetch = globalThis.fetch, now = () => Date.now(), log = console, usage = usageLine }) {
  const addresses = new Map();
  let shell = null;

  async function shopIdFor(host) {
    const hit = addresses.get(host);
    if (hit && now() - hit.at < ADDRESS_TTL_MS) return hit.id;
    const snap = await rootDb().collection("addresses").doc(host).get();
    const id = snap.exists && isShopId(snap.data()?.shopId) ? snap.data().shopId : null;
    addresses.set(host, { at: now(), id });
    return id;
  }

  /** The shop's own published file, or null when it has none. */
  async function siteFile(shopId, name) {
    const file = bucket().file(`shops/${shopId}/site/${name}`);
    try {
      const [body] = await file.download();
      return body;
    } catch (err) {
      if (err?.code === 404 || /No such object/i.test(String(err?.message))) return null;
      throw err;
    }
  }

  /** The app's blank page, read from the shared site and kept five minutes. */
  async function blankPage() {
    if (shell && now() - shell.at < SHELL_TTL_MS) return shell.html;
    const response = await fetch(shellUrl());
    if (!response.ok) throw new Error(`The app's blank page answered ${response.status}.`);
    shell = { at: now(), html: await response.text() };
    return shell.html;
  }

  return async function answer(req, res) {
    let metered = null;
    const send = (status, type, body, cache = "no-cache") => {
      // The shop's web traffic, by size (usageLog.js): what each shop's meter counts for the pages it serves.
      if (metered) {
        try { usage({ shop: metered, kind: "page", bytes: req.method === "HEAD" ? 0 : Buffer.byteLength(body ?? "") }); } catch { /* never breaks the answer */ }
      }
      return res.status(status).set("Content-Type", type).set("Cache-Control", cache).send(body);
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
      return send(200, "text/javascript; charset=utf-8", profileScript({ ...profile, ...(shop.tenant ? { tenant: shop.tenant } : {}) }));
    }

    const name = pathname.replace(/^\/+/, "");
    if (SITE_FILES.has(name)) {
      const body = await siteFile(shop.id, name);
      const type = TYPES[name.slice(name.lastIndexOf("."))];
      if (body) return send(200, type, body);
      if (name === "robots.txt") return send(200, type, "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\n");
      return send(404, TYPES[".txt"], "Not published yet.");
    }

    if (VERIFICATION_FILE.test(name)) {
      const body = await siteFile(shop.id, name);
      return body ? send(200, TYPES[".html"], body) : send(404, TYPES[".txt"], "Not published.");
    }

    const snapshot = snapshotFile(pathname);
    const body = snapshot ? await siteFile(shop.id, snapshot) : null;
    return send(200, TYPES[".html"], body ?? await blankPage());
  };
}

module.exports = { frontDoor, hostOf, snapshotFile, safeSlug, profileScript, SITE_FILES, TYPES, ADDRESS_TTL_MS, VERIFICATION_FILE };
