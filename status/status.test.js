import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeRegistry } from "../setup/fakes.js";
import { fromValue, loadStatus, renderStatus } from "./page.js";
import { STATUS_DOC, publishStatus } from "./publish.js";
import { statusSummary, statusWords } from "./summary.js";

const NOW = "2026-10-28T12:00:00.000Z";
const now = () => new Date(NOW);
const ok = { ok: true };
const bad = { ok: false, detail: "the checkout answered 500" };
const shop = (shopId, checks, extra = {}) => ({ shopId, status: "live", pressName: `Secret ${shopId}`, health: { checkedAt: "2026-10-28T11:58:00.000Z", ok: true, checks }, ...extra });

test("the summary counts shops per part and names none", () => {
  const rows = [
    shop("press-alpha", { pages: ok, checkout: bad, webhook: ok, backup: ok }),
    shop("press-bravo", { pages: ok, checkout: ok, backup: ok }),
    shop("press-charlie", { pages: ok, checkout: ok, backup: ok }),
    shop("press-new", { pages: bad }, { status: "creating" }),
    { shopId: "press-unchecked", status: "live" },
  ];
  const summary = statusSummary(rows, { now });
  assert.equal(summary.overall, "some");
  assert.equal(summary.checkedAt, "2026-10-28T11:58:00.000Z");
  assert.deepEqual(summary.parts.map((p) => [p.id, p.state, p.affected, p.total]), [
    ["pages", "working", 0, 3], ["checkout", "some", 1, 3], ["webhook", "working", 0, 1], ["backup", "working", 0, 3],
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /press-|Secret/, "no shop id or press name leaves the platform");
});

test("half or more shops in trouble is a problem across shops", () => {
  const summary = statusSummary([shop("a", { pages: bad }), shop("b", { pages: ok })], { now });
  assert.equal(summary.overall, "most");
  assert.equal(statusWords(summary, { now }).headline, "We're having a problem across shops.");
});

test("the page's words: all working, checks not started, and checks gone quiet", () => {
  const working = statusSummary([shop("a", { pages: ok, checkout: ok })], { now });
  const words = statusWords(working, { now });
  assert.equal(words.headline, "Everything is working.");
  assert.deepEqual(words.parts.map((p) => p.words), ["Working", "Working"], "parts no shop uses are left out");
  assert.equal(statusWords(null).headline, "Status checks haven't started yet.");
  const later = () => new Date("2026-10-28T13:00:00.000Z");
  assert.match(statusWords(working, { now: later }).headline, /can't confirm the current status/);
  const trouble = statusWords(statusSummary([shop("a", { checkout: bad }), shop("b", { checkout: ok }), shop("c", { checkout: ok })], { now }), { now });
  assert.equal(trouble.parts[0].words, "Trouble for 1 of 3 shops");
});

test("publishing saves the summary to the one public document", async () => {
  const registry = fakeRegistry();
  await registry.createShop("press-alpha", shop("press-alpha", { pages: ok }));
  const writes = [];
  const summary = await publishStatus({ registry, platform: { set: async (path, data) => void writes.push([path, data]) }, now });
  assert.deepEqual(writes, [[STATUS_DOC, summary]]);
  assert.equal(STATUS_DOC, "publicStatus/current");
});

test("the page reads the document over Firestore's address and draws it, escaping what it shows", async () => {
  const summary = statusSummary([shop("a", { pages: ok, checkout: bad }), shop("b", { pages: ok, checkout: ok }), shop("c", { pages: ok, checkout: ok })], { now });
  const toValue = (v) => (v === null ? { nullValue: null } : typeof v === "number" ? { integerValue: String(v) } : typeof v === "string" ? { stringValue: v }
    : Array.isArray(v) ? { arrayValue: { values: v.map(toValue) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } });
  const urls = [];
  const fetch = async (url) => { urls.push(url); return { status: 200, ok: true, json: async () => ({ fields: toValue(summary).mapValue.fields }) }; };
  const loaded = await loadStatus({ projectId: "lmb-platform-prod", fetch });
  assert.deepEqual(loaded, summary);
  assert.deepEqual(urls, ["https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents/publicStatus/current"]);
  assert.equal(await loadStatus({ projectId: "p", fetch: async () => ({ status: 404 }) }), null);
  await assert.rejects(loadStatus({ projectId: "p", fetch: async () => ({ status: 500, ok: false }) }), /status 500/);

  const html = renderStatus(loaded, { now, locale: "en-CA" });
  assert.match(html, /tone-warn/);
  assert.match(html, /Checkout<\/span><strong[^>]*>Trouble for 1 of 3 shops/);
  assert.match(renderStatus(null, { error: new Error("x") }), /couldn't load the status/);
  const sneaky = { ...loaded, parts: [{ ...loaded.parts[0], name: "<img src=x>" }] };
  assert.doesNotMatch(renderStatus(sneaky, { now }), /<img/);
  assert.equal(fromValue({ booleanValue: true }), true);
});

test("the page never names a rival and loads only its own modules", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) assert.ok(!page.toLowerCase().includes(rival));
  const scripts = [...page.matchAll(/import .* from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ["./config.js", "./page.js"]);
});
