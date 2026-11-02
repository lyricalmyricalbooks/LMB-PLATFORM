// One timeline per shop (code plan 19.10): every source that records something about a shop, merged newest first in
// plain words, filtered by kind and paged with "Show older"; platform admins only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIMELINE_KINDS, createTimeline, eventLine, shopTimeline, timelineRoutes } from "./timeline.js";
import { activityEntry } from "./activity.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeActivity } from "./fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { fakeSupportStore } from "../services/support/fakes.js";
import { fakeSentLog } from "../services/email/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const SHOP = "moth-press";
const NOW = Date.parse("2026-11-02T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const t = (minutes) => new Date(Date.parse("2026-11-01T00:00:00Z") + minutes * 60_000).toISOString();

async function sources() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", status: "live" });
  await registry.createShop("other-press", { shopId: "other-press", status: "live" });
  const activity = fakeActivity();
  const supportStore = fakeSupportStore();
  const emailLog = fakeSentLog();

  // The registry's events, from the services that already record them.
  await registry.recordEvent(SHOP, { id: "billing-1", source: "billing", at: t(1), what: "trial-started" });
  await registry.recordEvent(SHOP, { id: `health-${t(2)}-checkout`, kind: "health", check: "checkout", ok: false, detail: "the checkout answered 500", at: t(2) });
  await registry.recordEvent(SHOP, { id: "email-1", source: "email", at: t(3), what: "newsletter-paused" });
  await registry.recordEvent(SHOP, { id: "payments-1", source: "payment-service", at: t(4), kind: "payments.account-updated" });
  // A control-room switch: written to the registry and the activity log at the same time (controlRoom.js log).
  const sw = { by: "admin@example.com", switch: "gmailOrderScan", from: false, to: true, reason: "the press asked for it" };
  await registry.recordEvent(SHOP, { id: "control-room-1", source: "control-room", at: t(5), what: "switch-set", ...sw });
  await activity.record(activityEntry({ at: t(5), by: sw.by, what: "switch-set", shopId: SHOP, detail: sw }));
  await activity.record(activityEntry({ at: t(6), by: "admin@example.com", what: "act-as", shopId: SHOP, detail: { reason: "help with a price", mode: "view" } }));
  await activity.record(activityEntry({ at: t(6), by: "admin@example.com", what: "act-as", shopId: "other-press", detail: { reason: "not this shop" } }));
  // A release check and a release run.
  await registry.recordReleaseCheck(SHOP, { kind: "release-check", runId: "r1", version: "1.2.0", ok: false, startedAt: t(7), finishedAt: t(8), failedCheck: 3, error: "the cart didn't open" });
  await registry.recordRelease({ kind: "release", version: "1.2.1", runId: "rel1", startedAt: t(9), finishedAt: t(10), ok: true, shops: [{ shopId: SHOP, status: "shipped" }, { shopId: "other-press", status: "shipped" }] });
  // A support request for this shop, and one for another.
  await supportStore.put("T1", { id: "T1", shopId: SHOP, email: "owner@example.com", subject: "My prices look wrong", status: "answered", openedAt: t(11), updatedAt: t(12) });
  await supportStore.put("T2", { id: "T2", shopId: "other-press", email: "two@example.com", subject: "Not mine", status: "open", openedAt: t(11), updatedAt: t(11) });
  // The platform's email to the press, and a shop's own email to a shopper (never shown).
  await emailLog.put("k1", { shopId: SHOP, kind: "card-expiring", stream: "orders", to: "owner@example.com", status: "sent", at: t(13), platform: true });
  await emailLog.put("k2", { shopId: SHOP, kind: "order-receipt", stream: "orders", to: "shopper@example.com", status: "sent", at: t(14) });
  return { registry, activity, supportStore, emailLog };
}

test("every source is merged, newest first, each entry one plain line with its kind", async () => {
  const s = await sources();
  const { entries, next } = await shopTimeline({ shopId: SHOP, ...s });
  assert.equal(next, null);
  assert.deepEqual(entries.map((e) => e.kind), ["email", "support", "release", "release", "visit", "switch", "billing", "email", "health", "billing"]);
  for (let i = 1; i < entries.length; i += 1) assert.ok(entries[i - 1].at >= entries[i].at, "newest first");
  for (const e of entries) {
    assert.ok(TIMELINE_KINDS.includes(e.kind));
    assert.equal(typeof e.words, "string");
    assert.ok(e.words.length > 0 && e.words.length <= 200 && !e.words.includes("\n"));
  }
  const words = entries.map((e) => e.words);
  assert.ok(words.includes("Emailed the press: card expiring"));
  assert.ok(words.includes('Support request "My prices look wrong" (answered)'));
  assert.ok(words.includes("Release 1.2.1 reached the shop"));
  assert.ok(words.includes("Release check failed at check 3: the cart didn't open on version 1.2.0"));
  assert.ok(words.includes("Opened the shop's admin as support, looking only (help with a price)"));
  assert.ok(words.includes("Turned gmailOrderScan on (the press asked for it)"));
  assert.ok(words.includes("The checkout check started failing: the checkout answered 500"));
  // The switch is in the registry and the activity log: shown once. Another shop's and a shopper's lines never show.
  assert.equal(entries.filter((e) => e.kind === "switch").length, 1);
  assert.equal(entries.find((e) => e.kind === "switch").by, "admin@example.com");
  assert.ok(!words.some((w) => /not this shop|Not mine|receipt/.test(w)));
});

test("filters by kind and pages with Show older, without losing or repeating an entry", async () => {
  const s = await sources();
  const releases = await shopTimeline({ shopId: SHOP, ...s, kinds: ["release"] });
  assert.deepEqual(releases.entries.map((e) => e.kind), ["release", "release"]);
  const two = await shopTimeline({ shopId: SHOP, ...s, kinds: ["billing", "health"] });
  assert.deepEqual(two.entries.map((e) => e.kind), ["billing", "health", "billing"]);
  await assert.rejects(shopTimeline({ shopId: SHOP, ...s, kinds: ["gossip"] }), (e) => e.status === 400);

  const all = (await shopTimeline({ shopId: SHOP, ...s })).entries;
  const seen = [];
  let before;
  for (let pages = 0; pages < 10; pages += 1) {
    const page = await shopTimeline({ shopId: SHOP, ...s, limit: 3, ...(before ? { before } : {}) });
    seen.push(...page.entries);
    if (!page.next) break;
    before = page.next;
  }
  assert.deepEqual(seen, all);
  // A plain time works as "before" too.
  assert.ok((await shopTimeline({ shopId: SHOP, ...s, before: t(5) })).entries.every((e) => e.at < t(5)));
});

test("entries two services wrote at the same moment both show, and page apart cleanly", async () => {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP });
  for (let i = 0; i < 5; i += 1) await registry.recordEvent(SHOP, { id: `billing-${i}`, source: "billing", at: t(1), what: `step-${i}` });
  const first = await shopTimeline({ shopId: SHOP, registry, limit: 2 });
  const second = await shopTimeline({ shopId: SHOP, registry, limit: 2, before: first.next });
  const third = await shopTimeline({ shopId: SHOP, registry, limit: 2, before: second.next });
  assert.equal(new Set([...first.entries, ...second.entries, ...third.entries].map((e) => e.words)).size, 5);
  assert.equal(third.next, null);
});

test("each kind of registry event reads plainly; one with no time is left out", () => {
  assert.equal(eventLine({ id: "x", kind: "backup", database: "shop", ok: true, at: t(1) }).words, "Nightly backup of the shop records done");
  assert.equal(eventLine({ id: "x", source: "repairs", what: "repair-opened", problem: "the profile file drifted", at: t(1) }).kind, "health");
  assert.equal(eventLine({ id: "x", source: "control-room", what: "fee-change-scheduled", to: { basisPoints: 150 }, startsAt: "2026-12-01T00:00:00Z", reason: "agreed on the call", at: t(1) }).words, "Changed the fee on each order to 1.5%, starting 2026-12-01 (agreed on the call)");
  assert.equal(eventLine({ id: "x", source: "control-room", what: "payments-moved", to: "square", reason: "Stripe paused us", at: t(1) }).kind, "billing");
  assert.equal(eventLine({ id: "x", source: "run-book", what: "roll-back", version: "1.1.0", at: t(1) }).kind, "release");
  assert.equal(eventLine({ id: "x", source: "domain-service", what: "address-live", at: t(1) }).words, "address live");
  assert.equal(eventLine({ id: "x", source: "billing" }), null);
});

test("the walkthrough's one door carries the timeline, the jobs and the notes", async () => {
  const { platformWorld, adminClaims } = await import("../walkthrough/world.js");
  const w = platformWorld();
  const admin = adminClaims(w.clock);
  await w.registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", status: "live" });
  await w.ask(admin, "POST", "/api/control/tags", { shopId: SHOP, tags: ["poetry"], reason: "trying the tags out" });
  const line = await w.ask(admin, "POST", "/api/control/timeline", { shopId: SHOP });
  assert.equal(line.status, 200);
  assert.equal(line.body.entries[0].words, "Set the tags to poetry (trying the tags out)");
  assert.deepEqual((await w.ask(admin, "POST", "/api/control/notes", {})).body.tagsByShop, { [SHOP]: ["poetry"] });
  const jobs = await w.ask(admin, "GET", "/api/control/jobs");
  assert.equal(jobs.status, 200);
  const ran = await w.ask(admin, "POST", "/api/control/jobs/run", { name: "shop-maker", reason: "trying the jobs page out" });
  assert.deepEqual([ran.status, ran.body.run.ok], [200, true]);
  assert.equal((await w.ask(admin, "POST", "/api/control/shop", { shopId: SHOP })).body.delivery.payments.received, 0);
});

test("the door: platform admins only, a real shop, POST /api/control/timeline", async () => {
  const s = await sources();
  const timeline = createTimeline({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), ...s, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: timelineRoutes(timeline), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/timeline", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await ask({ ...ADMIN, firebase: {} }, { shopId: SHOP })).status, 403, "two-step sign-in");
  assert.equal((await ask(ADMIN, { shopId: "no-such-shop" })).status, 404);
  const answer = await ask(ADMIN, { shopId: SHOP, kinds: ["support"] });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.entries.map((e) => e.kind), ["support"]);
  assert.equal((await ask(ADMIN, { shopId: SHOP, before: "yesterday" })).status, 400);
});
