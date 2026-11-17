// The services page (/services): waitlist until both sign-up switches are on, then a services trial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadServices, servicesView, servicesWords } from "./servicesPage.js";
import { canonicalPath } from "../site/seo.js";
import { EXTRA_PAGES } from "../site/build.js";
import { LIVE_PAGES } from "../site/check-live.js";

const page = readFileSync(new URL("./services.html", import.meta.url), "utf8");
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("only sign-up open and services open together start a trial", () => {
  assert.deepEqual(servicesView(null), { open: false, trialDays: null });
  assert.equal(servicesView({ signupOpen: true }).open, false);
  assert.equal(servicesView({ servicesOpen: true }).open, false);
  assert.equal(servicesView({ ok: false, signupOpen: true, servicesOpen: true }).open, false);
  assert.deepEqual(servicesView({ signupOpen: true, servicesOpen: true, trialDays: 14 }), { open: true, trialDays: 14 });
  assert.equal(servicesView({ signupOpen: true, servicesOpen: true, trialDays: "14" }).trialDays, null);
});

test("closed, the buttons join the waitlist; open, they start a trial with Services picked", () => {
  assert.deepEqual(servicesWords({ open: false }, { signupUrl: "/join/" }), { cta: "Join the waitlist", ctaShort: "Join", href: "/#start", note: "Free setup · no card" });
  assert.equal(servicesWords({ open: true }, { signupUrl: "" }).href, "/#start");
  const open = servicesWords({ open: true, trialDays: 14 }, { signupUrl: "/join/" });
  assert.equal(open.href, "/join/?type=services");
  assert.equal(open.cta, "Start free trial");
  assert.match(open.note, /14 days free/);
  assert.equal(servicesWords({ open: true }, { signupUrl: "/join/?ref=x" }).href, "/join/?ref=x&type=services");
});

test("a failed or refused plans answer keeps the waitlist", async () => {
  assert.equal((await loadServices({ fetch: async () => { throw new Error("down"); }, url: "/api/plans" })).open, false);
  assert.equal((await loadServices({ fetch: async () => ({ ok: false }), url: "/api/plans" })).open, false);
  const ok = await loadServices({ fetch: async () => ({ ok: true, json: async () => ({ signupOpen: true, servicesOpen: true }) }), url: "/api/plans" });
  assert.equal(ok.open, true);
  assert.equal((await loadServices({ fetch: null, url: "" })).open, false);
});

test("the page is published at /services, listed once and checked after each deploy", () => {
  assert.equal(EXTRA_PAGES["/services"], "/waitlist/services.html");
  assert.equal(canonicalPath("/waitlist/services.html"), "/services");
  assert.ok(LIVE_PAGES.some(([path, words]) => path === "/services" && page.includes(words)));
});

test("every start button is marked, and the words name no rival and no price", () => {
  assert.ok((page.match(/data-start/g) ?? []).length >= 4);
  assert.match(page, /id="services-note"/);
  const words = textOf(page);
  assert.doesNotMatch(words, /\$\d+\s*(a|per)\s*month/i);
  for (const rival of ["shopify", "square appointments", "vagaro", "fresha", "mindbody", "booksy", "acuity", "calendly", "jane app", "squarespace", "wix"]) {
    assert.ok(!words.toLowerCase().includes(rival), rival);
  }
  assert.match(page, /<meta name="description" content="[^"]{60,}">/);
});

test("the front page links to the services page", () => {
  const front = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(front, /href="\/services"/);
});
