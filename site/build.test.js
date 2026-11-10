import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOUNTS } from "../walkthrough/server.js";
import { buildSite, firebaseJson, liveConfig, neededFiles, outsideFolder, referencesIn, SITE_MOUNTS } from "./build.js";

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
