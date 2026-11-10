// The platform's live web site, built from the pages' own folders (the same folders the walkthrough serves, without its
// pretend sign-ins and stand-ins). One Hosting site in the platform project serves it at https://lmb-platform-prod.web.app:
//
//   /            the front page (waitlist/), also at /waitlist/
//   /join/       the front door: email, code, three questions
//   /signup/ /account/ /help/ /terms/ /trust/ /status/ /control/
//   /app/        setup mode, the shop admin before a shop exists (apps/shop, `pnpm run build:setup`), when it is built
//   /design/     the designer before a store exists (apps/shop vite.design.config.ts, built by the same command):
//                /design/studio is Studio, every other /design/ address the shop's pages it previews
//   /api/**      the platform's server (Cloud Run platform-api), only with --api
//
// Only what a page actually loads is copied: each page's index.html (or other .html) and every file it reaches through
// src/href and import, plus its look/ folder. A page that reaches outside the published folders stops the build, so a
// server file can never be published by accident.
//
//   node site/build.js [--api] [--require-app] [--out site/out]
//
// The result is a folder ready for `firebase deploy --only hosting,firestore:rules --project lmb-platform-prod`:
// out/public (the pages), out/firebase.json and out/firestore.rules (the platform's rules, waitlist/firestore.rules).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where setup mode's build lands (apps/shop/vite.setup.config.ts). */
export const SETUP_ADMIN_FOLDER = "apps/shop/dist-setup";
/** Where the designer before a store exists lands (apps/shop/vite.design.config.ts). */
export const DESIGNER_FOLDER = "apps/shop/dist-design";
export const REGION = "northamerica-northeast1";
export const API_SERVICE = "platform-api";

/** Each published address and the folder its files come from. "/" is the front page. */
export const SITE_MOUNTS = Object.freeze({
  "/": "waitlist",
  "/waitlist/": "waitlist",
  "/join/": "join",
  "/signup/": "signup",
  "/account/": "accounts",
  "/accounts/": "accounts",
  "/help/": "help",
  "/terms/": "terms",
  "/trust/": "trust",
  "/status/": "status",
  "/control/": "control-room",
});

/** Pages that aren't a folder's index.html: address -> file under a mount. */
export const EXTRA_PAGES = Object.freeze({ "/account/billing": "/account/billing.html", "/pricing": "/waitlist/pricing.html", "/pricing/": "/waitlist/pricing.html" });

const STATIC = /\.(html|js|mjs|css|svg|png|ico|webp|jpg|jpeg|gif|woff2?|json|txt|webmanifest)$/i;

/** The safety headers every platform page gets (the same ones the waitlist has had since it went live). */
export const HEADERS = Object.freeze([
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=()" },
]);

/**
 * The designer's pages (/design/) show the shop's pages inside a frame on the same site, so they may be framed by the
 * platform's own pages and nobody else's. Every other header is the same as everywhere.
 */
export const DESIGNER_HEADERS = Object.freeze(HEADERS.map((h) => (
  h.key === "X-Frame-Options" ? { ...h, value: "SAMEORIGIN" }
    : h.key === "Content-Security-Policy" ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : h)));

/**
 * A Hosting regex (RE2: no look-ahead) matching every address outside /<folder>/ and /<folder> itself: the root, a
 * proper start of the name, a path that leaves the name at some letter, or a longer first segment (/designs).
 */
export function outsideFolder(folder) {
  const alternatives = [`/(${[...folder].map((_, i) => folder.slice(0, i)).join("|")})`];
  for (let i = 0; i < folder.length; i++) alternatives.push(`/${folder.slice(0, i)}[^${folder[i]}].*`);
  alternatives.push(`/${folder}[^/].*`);
  return `^(${alternatives.join("|")})$`;
}

/** Relative references a file makes: html src/href, js import/export from, import(), css url(). */
export function referencesIn(text, kind) {
  const found = new Set();
  const add = (ref) => {
    const clean = ref.split(/[?#]/)[0];
    if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//") || clean.startsWith("#")) return;
    found.add(clean);
  };
  if (kind === ".html") {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) for (const r of referencesIn(m[1], ".js")) add(r);
  } else if (kind === ".js" || kind === ".mjs") {
    for (const m of text.matchAll(/(?:^|[;\s}])(?:import|export)\s[^"'`;]*?\bfrom\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of text.matchAll(/(?:^|[;\s])import\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) add(m[1]);
  } else if (kind === ".css") {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1]);
  }
  return [...found];
}

const listFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? listFiles(path) : [path];
});

/**
 * Every repo file the published pages need, as repo-relative paths. Starts from each mounted folder's .html pages and
 * its look/ folder, and follows references. Throws when a page reaches a file outside the mounted folders.
 */
export function neededFiles({ root = ROOT, mounts = SITE_MOUNTS } = {}) {
  const folders = [...new Set(Object.values(mounts))];
  const inside = (file) => folders.some((f) => file === f || file.startsWith(`${f}/`));
  const queue = [];
  for (const folder of folders) {
    for (const name of readdirSync(join(root, folder))) if (name.endsWith(".html")) queue.push(`${folder}/${name}`);
    if (existsSync(join(root, folder, "look"))) for (const path of listFiles(join(root, folder, "look"))) queue.push(relative(root, path).split(sep).join("/"));
  }
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    if (!inside(file)) throw new Error(`A published page loads ${file}, which is outside the published folders`);
    if (/\.test\.m?js$/.test(file)) throw new Error(`A published page loads a test file, ${file}`);
    if (!existsSync(join(root, file))) throw new Error(`A published page loads ${file}, which doesn't exist`);
    seen.add(file);
    const kind = extname(file).toLowerCase();
    if (![".html", ".js", ".mjs", ".css"].includes(kind)) continue;
    for (const ref of referencesIn(readFileSync(join(root, file), "utf8"), kind)) {
      // An address from the site's root ("/accounts/billing.js") is a file in that address's folder.
      const mount = ref.startsWith("/") ? Object.keys(mounts).filter((m) => m !== "/" && ref.startsWith(m)).sort((a, b) => b.length - a.length)[0] : null;
      if (ref.startsWith("/") && !mount) continue;
      const target = (mount ? `${mounts[mount]}/${ref.slice(mount.length)}` : normalize(join(dirname(file), ref))).split(sep).join("/");
      if (target.startsWith("..")) throw new Error(`${file} loads ${ref}, which is outside the repository`);
      if (!STATIC.test(target)) continue;
      queue.push(target);
    }
  }
  return [...seen].sort();
}

/** The live values the pages get in place of their "not hosted yet" blanks. Returns the file's new text. */
export function liveConfig(file, text, { api, app }) {
  if (file === "signup/config.js" && app) return text.replace(/export const SETUP_ADMIN_URL = ".*";/, 'export const SETUP_ADMIN_URL = "/app/";');
  if (file === "waitlist/config.js" && api) {
    return text
      .replace(/export const PLANS_URL = .*;/, 'export const PLANS_URL = "/api/plans";')
      .replace(/export const SIGNUP_URL = .*;/, 'export const SIGNUP_URL = "/join/";');
  }
  return text;
}

/** firebase.json for the built site. The /api addresses go to the server only when it is live (`api`). */
export function firebaseJson({ api, app, designer = false }) {
  const run = (source) => ({ source, run: { serviceId: API_SERVICE, region: REGION } });
  const rewrites = [
    ...(api ? ["/api/**", "/tips/off", "/checkup/off"].map(run) : []),
    ...Object.entries(EXTRA_PAGES).map(([source, destination]) => ({ source, destination })),
    ...(app ? [{ source: "/app/**", destination: "/app/setup.html" }] : []),
    ...(designer ? [{ source: "/design/studio", destination: "/design/design.html" }, { source: "/design/**", destination: "/design/design-shop.html" }] : []),
  ];
  return {
    firestore: { rules: "firestore.rules" },
    hosting: {
      public: "public",
      ignore: ["**/.*", "**/node_modules/**"],
      rewrites,
      headers: [
        // Everything but the designer can never be framed; the designer frames its own shop pages (DESIGNER_HEADERS).
        designer ? { regex: outsideFolder("design"), headers: HEADERS } : { source: "**", headers: HEADERS },
        ...(designer ? [{ regex: "^/design(/.*)?$", headers: DESIGNER_HEADERS }] : []),
        // Pages and their scripts change with every release: always check for a new copy. Setup mode's built files carry
        // their own content hash, so they can be kept.
        { source: "**/*.@(html|js|css)", headers: [{ key: "Cache-Control", value: "no-cache" }] },
        // Pictures and fonts change rarely: browsers keep them a day, which saves the site's download bill.
        { source: "**/*.@(svg|png|ico|webp|jpg|jpeg|gif|woff|woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
        ...(app ? [{ source: "/app/assets/**", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }] : []),
        ...(designer ? [{ source: "/design/assets/**", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }] : []),
      ],
    },
  };
}

/** Builds the site into `out`. Returns { files, api, app } (files: published paths). */
export function buildSite({ root = ROOT, out = join(ROOT, "site", "out"), api = false, requireApp = false } = {}) {
  const appDir = join(root, SETUP_ADMIN_FOLDER);
  const app = existsSync(join(appDir, "setup.html"));
  if (requireApp && !app) throw new Error("Setup mode isn't built: run `pnpm install && pnpm run build:setup` in apps/shop first");
  const designerDir = join(root, DESIGNER_FOLDER);
  const designer = existsSync(join(designerDir, "design.html"));
  if (requireApp && !designer) throw new Error("The designer isn't built: run `pnpm install && pnpm run build:setup` in apps/shop first");
  rmSync(out, { recursive: true, force: true });
  const publicDir = join(out, "public");
  mkdirSync(publicDir, { recursive: true });
  const files = [];
  const needed = neededFiles({ root });
  for (const [mount, folder] of Object.entries(SITE_MOUNTS)) {
    for (const file of needed.filter((f) => f.startsWith(`${folder}/`))) {
      const published = `${mount}${file.slice(folder.length + 1)}`;
      const target = join(publicDir, published);
      mkdirSync(dirname(target), { recursive: true });
      const kind = extname(file);
      if (kind === ".js") writeFileSync(target, liveConfig(file, readFileSync(join(root, file), "utf8"), { api, app }));
      else cpSync(join(root, file), target);
      files.push(published);
    }
  }
  if (app) {
    cpSync(appDir, join(publicDir, "app"), { recursive: true });
    for (const path of listFiles(appDir)) files.push(`/app/${relative(appDir, path).split(sep).join("/")}`);
  }
  if (designer) {
    cpSync(designerDir, join(publicDir, "design"), { recursive: true });
    for (const path of listFiles(designerDir)) files.push(`/design/${relative(designerDir, path).split(sep).join("/")}`);
  }
  writeFileSync(join(out, "firebase.json"), `${JSON.stringify(firebaseJson({ api, app, designer }), null, 2)}\n`);
  cpSync(join(root, "waitlist", "firestore.rules"), join(out, "firestore.rules"));
  return { files: files.sort(), api, app, designer };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  try {
    const result = buildSite({
      api: args.includes("--api"),
      requireApp: args.includes("--require-app"),
      ...(outAt >= 0 ? { out: join(process.cwd(), args[outAt + 1]) } : {}),
    });
    console.log(`Built ${result.files.length} files into site/out (server addresses ${result.api ? "on" : "off"}, setup mode ${result.app ? "included" : "not built"}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
