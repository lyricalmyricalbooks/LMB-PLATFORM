import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOUNTS } from "../walkthrough/server.js";
import { buildSite, drawAhead, DRAWN_AHEAD, firebaseJson, liveConfig, neededFiles, outsideFolder, outsideFolders, referencesIn, SITE_MOUNTS } from "./build.js";

test("the live site publishes every page the walkthrough has, at the same address", () => {
  for (const [address, folder] of Object.entries(MOUNTS)) {
    if (address === "/look/" || address === "/app/") continue; // the walkthrough's start page look; setup mode is copied whole
    assert.equal(SITE_MOUNTS[address], folder, address);
  }
  assert.equal(SITE_MOUNTS["/"], "waitlist", "the front page stays the one live today");
});

test("it follows a page's references, and only into the published folders", () => {
  assert.deepEqual(referencesIn('<script type="module" src="./app.js"></script><link href="../signup/look/a.css"><a href="https://x.example/">', ".html").sort(), ["../signup/look/a.css", "./app.js"]);
  assert.deepEqual(referencesIn('import { a } from "./a.js";\nexport { b } from "../b.js";\nimport "./c.js";\nconst d = await import("./d.js");\nimport(`${SDK}/x.js`);', ".js").sort(), ["../b.js", "./a.js", "./c.js", "./d.js"]);
  const files = neededFiles();
  assert.ok(files.includes("join/app.js") && files.includes("signup/config.js") && files.includes("accounts/billing.js"));
  for (const file of files) {
    assert.ok(!/\.test\.m?js$/.test(file), file);
    assert.ok(Object.values(SITE_MOUNTS).some((folder) => file.startsWith(`${folder}/`)), file);
  }
  for (const serverOnly of ["signup/api.js", "accounts/accounts.js", "control-room/controlRoom.js", "waitlist/invites.js", "waitlist/firestore.rules"]) {
    assert.ok(!files.includes(serverOnly), `${serverOnly} is server code and is never published`);
  }
});

test("the pages get their live addresses only when that part is live", () => {
  const signup = readFileSync(new URL("../signup/config.js", import.meta.url), "utf8");
  const waitlist = readFileSync(new URL("../waitlist/config.js", import.meta.url), "utf8");
  assert.match(liveConfig("signup/config.js", signup, { app: true }), /SETUP_ADMIN_URL = "\/app\/"/);
  assert.match(liveConfig("signup/config.js", signup, { app: false }), /SETUP_ADMIN_URL = ""/);
  const on = liveConfig("waitlist/config.js", waitlist, { api: true });
  assert.match(on, /PLANS_URL = "\/api\/plans"/);
  assert.match(on, /SIGNUP_URL = "\/join\/"/);
  assert.equal(liveConfig("waitlist/config.js", waitlist, { api: false }), waitlist);
});

test("the server's addresses are sent to it only once it is live", () => {
  const sources = (json) => json.hosting.rewrites.map((r) => r.source);
  assert.ok(!sources(firebaseJson({ api: false, app: true })).includes("/api/**"));
  const on = firebaseJson({ api: true, app: true });
  assert.deepEqual(on.hosting.rewrites.find((r) => r.source === "/api/**").run, { serviceId: "platform-api", region: "northamerica-northeast1" });
  assert.equal(on.hosting.rewrites.find((r) => r.source === "/app/**").destination, "/app/setup.html");
  assert.equal(on.firestore.rules, "firestore.rules");
  assert.ok(on.hosting.headers[0].headers.some((h) => h.key === "X-Frame-Options" && h.value === "DENY"));
});

test("the designer before a store exists: Studio at /design/studio, its shop pages framed only by the platform itself", () => {
  const json = firebaseJson({ api: false, app: true, designer: true });
  const rewrite = (source) => json.hosting.rewrites.find((r) => r.source === source)?.destination;
  assert.equal(rewrite("/design/studio"), "/design/design.html");
  assert.equal(rewrite("/design/**"), "/design/design-shop.html");
  assert.ok(json.hosting.rewrites.findIndex((r) => r.source === "/design/studio") < json.hosting.rewrites.findIndex((r) => r.source === "/design/**"));
  const [everywhere, designer] = json.hosting.headers;
  const value = (set, key) => set.headers.find((h) => h.key === key)?.value;
  assert.equal(value(everywhere, "X-Frame-Options"), "DENY");
  assert.equal(value(designer, "X-Frame-Options"), "SAMEORIGIN");
  assert.match(value(designer, "Content-Security-Policy"), /frame-ancestors 'self'/);
  // Every other address keeps "never framed": the two regexes split the site with no gap and no overlap.
  const outside = new RegExp(everywhere.regex), inside = new RegExp(designer.regex);
  for (const path of ["/", "/join/", "/d", "/d/x", "/desig/", "/designs", "/app/", "/control/", "/dx"]) assert.ok(outside.test(path) && !inside.test(path), path);
  for (const path of ["/design", "/design/", "/design/studio", "/design/books/salt-hours"]) assert.ok(inside.test(path) && !outside.test(path), path);
  assert.equal(everywhere.regex, outsideFolder("design"));
  // Without a built designer nothing changes.
  assert.deepEqual(firebaseJson({ api: false, app: true }).hosting.headers[0].source, "**");
});

test("each starter's page can show its sample shop in a frame: /demo/ is framed by the platform itself only", () => {
  // 26 November 2026: the computer and phone frames on /demo/starters/<id> were blank, because /demo/ had "never framed".
  const json = firebaseJson({ api: false, app: true, designer: true, demo: true });
  const [everywhere, framed] = json.hosting.headers;
  const value = (set, key) => set.headers.find((h) => h.key === key)?.value;
  assert.equal(value(everywhere, "X-Frame-Options"), "DENY");
  assert.match(value(everywhere, "Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(value(framed, "X-Frame-Options"), "SAMEORIGIN");
  assert.match(value(framed, "Content-Security-Policy"), /frame-ancestors 'self'/);
  const outside = new RegExp(everywhere.regex), inside = new RegExp(framed.regex);
  for (const path of ["/", "/d", "/de", "/dem", "/demos", "/demox/a", "/des", "/designs", "/designer", "/deb", "/app/", "/control/", "/join/"]) {
    assert.ok(outside.test(path) && !inside.test(path), path);
  }
  for (const path of ["/demo", "/demo/", "/demo/starters/starter-larder", "/demo/products/x", "/design", "/design/studio"]) {
    assert.ok(inside.test(path) && !outside.test(path), path);
  }
  assert.equal(everywhere.regex, outsideFolders(["design", "demo"]));
});

test("the live demo shops: every address under /demo/ is the one demo page, its built files kept", () => {
  const json = firebaseJson({ api: false, app: true, designer: true, demo: true });
  assert.equal(json.hosting.rewrites.find((r) => r.source === "/demo/**")?.destination, "/demo/demo.html");
  assert.ok(json.hosting.headers.some((h) => h.source === "/demo/assets/**" && h.headers[0].value.includes("immutable")));
  // A demo page may be framed by the platform's own starter pages only (see the starter-frames test above).
  assert.ok(new RegExp(json.hosting.headers[1].regex).test("/demo/products/example"));
  // Without a built demo nothing changes.
  assert.equal(firebaseJson({ api: false, app: true }).hosting.rewrites.some((r) => r.source === "/demo/**"), false);
});

test("a build writes the pages, firebase.json and the platform's rules", () => {
  const out = mkdtempSync(join(tmpdir(), "site-"));
  const { files } = buildSite({ out });
  for (const page of ["/index.html", "/join/index.html", "/account/billing.html", "/accounts/billing.js", "/control/index.html", "/status/index.html"]) assert.ok(files.includes(page), page);
  assert.equal(readFileSync(join(out, "firestore.rules"), "utf8"), readFileSync(new URL("../waitlist/firestore.rules", import.meta.url), "utf8"));
  assert.equal(JSON.parse(readFileSync(join(out, "firebase.json"), "utf8")).hosting.public, "public");
});

test("the live check fails on Hosting's not-found page and passes on the real pages", async () => {
  const { checkLive } = await import("./check-live.js");
  const pages = [["/", "Colophon"], ["/help/", "Colophon help"]];
  const fake = (bodies) => async (url) => {
    const path = new URL(url).pathname;
    const body = bodies[path];
    return { status: body ? 200 : 404, text: async () => body ?? "Page Not Found", headers: new Map([["content-type", "text/html"]]) };
  };
  const good = await checkLive("https://platform.example", { pages, fetch: fake({ "/": "<title>Colophon</title>", "/help/": "<title>Colophon help</title>" }) });
  assert.equal(good.ok, true);
  assert.match(good.lines.at(-1), /isn't live yet/);
  const bad = await checkLive("https://platform.example", { pages, fetch: fake({ "/": "<title>Colophon</title>" }) });
  assert.equal(bad.ok, false);
  assert.ok(bad.lines.some((l) => l.startsWith("FAIL /help/")));
});

test("a mistyped address gets Colophon's own not-found page, and the top bar's button waits for sign-up to open", () => {
  const out = mkdtempSync(join(tmpdir(), "site-404-"));
  buildSite({ out });
  const missing = readFileSync(join(out, "public", "404.html"), "utf8");
  assert.match(missing, /We can't find that page\./);
  assert.doesNotMatch(missing, /firebase/i);
  for (const page of ["help/index.html", "terms/index.html", "trust/index.html", "status/index.html", "account/index.html", "pricing"]) {
    const file = page === "pricing" ? join(out, "public", "waitlist", "pricing.html") : join(out, "public", page);
    assert.match(readFileSync(file, "utf8"), /data-signup-cta href="\/#start">Join the waitlist</, page);
  }
  const look = readFileSync(join(out, "public", "help", "look", "platform-look.js"), "utf8");
  assert.match(look, /signupOpen !== true/);
});

test("the trust page's words are in the published page, for readers that don't run scripts", () => {
  const out = mkdtempSync(join(tmpdir(), "site-"));
  buildSite({ out });
  const html = readFileSync(join(out, "public", "trust", "index.html"), "utf8");
  const box = html.slice(html.indexOf('<div id="trust"'));
  assert.match(box, /^<div id="trust"[^>]*>\s*(<div class="cp-alertline"[\s\S]*?<\/div>\s*)?<div class="cp-promises">/, "the promises are drawn into the box");
  assert.match(box, /Who else handles your data/);
  assert.match(html, /rel="canonical" href="https:\/\/lmb-platform-prod\.web\.app\/trust\/"/, "the usual search tags still go in");
  assert.ok(Object.keys(DRAWN_AHEAD).every((page) => page.endsWith(".html")));
});

test("drawing ahead stops the build when the page lost its box", () => {
  assert.throws(() => drawAhead("/trust/index.html", "<main></main>"), /no empty <div id="trust">/);
  assert.equal(drawAhead("/terms/index.html", "<main></main>"), "<main></main>");
});
