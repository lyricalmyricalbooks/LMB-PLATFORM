import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite } from "./build.js";
import { canonicalPath, isListed, robotsTxt, SITE_URL, sitemapXml, withSeo } from "./seo.js";

const page = (head) => `<!doctype html><html><head><title>Colophon pricing</title><meta name="description" content="Pay what it costs &amp; a small fee.">${head}</head><body></body></html>`;

test("each page has one real address, and the front page's second copy points at the front page", () => {
  assert.equal(canonicalPath("/index.html"), "/");
  assert.equal(canonicalPath("/waitlist/index.html"), "/");
  assert.equal(canonicalPath("/waitlist/pricing.html"), "/pricing");
  assert.equal(canonicalPath("/pricing.html"), "/pricing");
  assert.equal(canonicalPath("/help/index.html"), "/help/");
});

test("only public pages are listed: never noindex, not-found, sign-up or signed-in pages", () => {
  assert.equal(isListed("/help/index.html", page("")), true);
  assert.equal(isListed("/help/index.html", page('<meta name="robots" content="noindex">')), false);
  assert.equal(isListed("/404.html", page("")), false);
  for (const p of ["/account/index.html", "/control/index.html", "/signup/index.html", "/join/index.html"]) assert.equal(isListed(p, page("")), false, p);
  assert.equal(isListed("/look/colophon.css", ""), false);
});

test("a listed page gets its address, a share preview, and the front page the business label", () => {
  const pricing = withSeo("/waitlist/pricing.html", page(""));
  assert.match(pricing, new RegExp(`<link rel="canonical" href="${SITE_URL}/pricing">`));
  assert.match(pricing, /<meta property="og:title" content="Colophon pricing">/);
  assert.match(pricing, /<meta property="og:description" content="Pay what it costs &amp; a small fee.">/);
  assert.match(pricing, /og:image" content="https:\/\/[^"]+\/share\.png"/);
  assert.match(pricing, /twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(pricing, /ld\+json/);
  const front = withSeo("/waitlist/index.html", page(""));
  const label = JSON.parse(front.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.deepEqual(label["@graph"].map((x) => x["@type"]), ["Organization", "WebSite", "SoftwareApplication"]);
  assert.equal(withSeo("/signup/index.html", page('<meta name="robots" content="noindex">')), page('<meta name="robots" content="noindex">'));
  assert.equal(withSeo("/waitlist/index.html", front), front, "running it twice adds nothing");
});

test("robots.txt keeps crawlers out of the app shells only, and points at the map", () => {
  const robots = robotsTxt("https://platform.example");
  assert.match(robots, /Disallow: \/control\//);
  assert.doesNotMatch(robots, /Disallow: \/signup\//, "noindex pages stay crawlable so Google can read the noindex");
  assert.match(robots, /Sitemap: https:\/\/platform\.example\/sitemap\.xml/);
  assert.equal((sitemapXml(["/help/", "/", "/", "/pricing"], "https://p.example").match(/<loc>/g) ?? []).length, 3);
});

test("a build publishes the map, robots.txt and share picture, and tags the real pages", () => {
  const out = mkdtempSync(join(tmpdir(), "site-seo-"));
  const { files } = buildSite({ out });
  for (const f of ["/robots.txt", "/sitemap.xml", "/share.png"]) assert.ok(files.includes(f), f);
  const map = readFileSync(join(out, "public", "sitemap.xml"), "utf8");
  for (const p of ["/", "/pricing", "/help/", "/terms/", "/trust/", "/status/"]) assert.ok(map.includes(`<loc>${SITE_URL}${p}</loc>`), p);
  for (const p of ["/waitlist/", "/signup/", "/account/", "/control/", "/join/", "/404"]) assert.ok(!map.includes(`${SITE_URL}${p}<`), p);
  const read = (f) => readFileSync(join(out, "public", f), "utf8");
  assert.match(read("waitlist/index.html"), new RegExp(`rel="canonical" href="${SITE_URL}/"`));
  assert.doesNotMatch(read("signup/index.html"), /canonical|og:title/);
  assert.doesNotMatch(read("404.html"), /canonical/);
  const descriptions = ["terms/index.html", "trust/index.html", "help/index.html", "status/index.html", "index.html", "pricing.html"]
    .map((f) => read(f).match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.equal(new Set(descriptions).size, descriptions.length, "every listed page has its own description");
});
