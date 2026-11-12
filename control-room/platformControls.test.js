// The owner's platform controls (code plan 9.4, 9.5, 9.9): settings that change without a release, the waitlist and
// its invites, and the activity log. Platform admins only; every change logged once; a repeat changes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlatformControls, platformRoutes } from "./platformControls.js";
import { ACTIVITY_DAYS } from "./activity.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeActivity, fakeInviteStore, fakePlatformState, fakeWaitlist } from "./fakes.js";
import { createInvites, inviteId, isInvited } from "../waitlist/invites.js";
import { liveSettings, platformSettings } from "../services/settings.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { fakeSignupStores, fakeVerifyIdToken } from "../signup/fakes.js";
import { createApi } from "../signup/api.js";
import { TEMPLATES } from "../services/email/templates.js";
import { EMAIL_SETTING } from "../services/email/index.js";
import { PAYMENTS_SECRETS } from "../services/payments/index.js";

const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const STRANGER = { uid: "uid-x", email: "someone@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };

function world() {
  const settingsStore = fakePlatformState();
  const activity = fakeActivity();
  const email = fakePlatformEmail();
  const inviteStore = fakeInviteStore();
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const now = () => new Date((clock += 1000));
  const invites = createInvites({ invites: inviteStore, email, settings: platformSettings({}), now });
  const stores = fakeSignupStores();
  stores.signups.rows.set("moth-press-a1b2c", { shopId: "moth-press-a1b2c", pressName: "Moth Press", ownerEmail: "ada@example.com", status: "failed", message: "making your shop's database", canRetry: true, createdAt: "2026-10-28T10:00:00Z" });
  stores.signups.rows.set("done-press-x", { shopId: "done-press-x", pressName: "Done Press", status: "ready" });
  const waitlist = fakeWaitlist([
    { email: "old@example.com", name: "Old", press: "Old Press", plan: "shop", firstSignedUpAt: "2026-10-20T00:00:00Z" },
    { email: "new@example.com", name: "New", press: "", plan: "both", firstSignedUpAt: "2026-10-27T00:00:00Z" },
  ]);
  const controls = createPlatformControls({
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), settingsStore, env: { PLAN_PRICE_SHOP: "2900" },
    activity, waitlist, invites, signups: stores.signups, now,
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: platformRoutes(controls) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { controls, settingsStore, activity, email, inviteStore, ask, signups: stores.signups };
}

test("only platform admins see or change the platform's settings, waitlist and activity", async () => {
  const w = world();
  for (const [method, path, body] of [["GET", "/api/control/settings"], ["POST", "/api/control/settings", { values: { trialDays: 30 }, reason: "longer trial for the fair" }], ["GET", "/api/control/waitlist"], ["POST", "/api/control/invite", { email: "a@example.com" }], ["POST", "/api/control/activity", {}]]) {
    assert.equal((await w.ask(STRANGER, method, path, body)).status, 403, path);
  }
  assert.equal(w.settingsStore.docs.size, 0);
  assert.equal(w.email.list().length, 0);
});

test("a setting change is saved over the environment, logged once with before and after, and read by liveSettings", async () => {
  const w = world();
  const shown = await w.controls.settings(ADMIN);
  assert.equal(shown.values.signupOpen, false);
  assert.equal(shown.values["prices.shop"], 2900);
  assert.ok(shown.fields.some((f) => f.path === "payAsYouSell.basisPoints"));

  const saved = await w.controls.saveSettings(ADMIN, { values: { signupOpen: true, "prices.shop": 3400, "foundingOffer.percentOff": 25 }, reason: "opening sign-up for the fair" });
  assert.deepEqual(saved.changed, [{ path: "signupOpen", from: false, to: true }, { path: "prices.shop", from: 2900, to: 3400 }]);
  const live = await liveSettings({ env: { PLAN_PRICE_SHOP: "2900" }, store: w.settingsStore });
  assert.equal(live.signupOpen, true);
  assert.equal(live.prices.shop, 3400);
  // The same values again change nothing and log nothing.
  assert.deepEqual((await w.controls.saveSettings(ADMIN, { values: { signupOpen: true }, reason: "opening sign-up for the fair" })).changed, []);
  const log = await w.activity.list();
  assert.equal(log.length, 1);
  assert.equal(log[0].what, "settings-changed");
  assert.equal(log[0].by, "admin@example.com");
  assert.equal(log[0].keepUntil.slice(0, 4), String(2026 + Math.floor(ACTIVITY_DAYS / 365)));
  // Back to what the environment says: the saved record drops the change.
  await w.controls.saveSettings(ADMIN, { reset: ["prices.shop"], reason: "back to the normal price" });
  assert.deepEqual(w.settingsStore.docs.get("settings").values, { signupOpen: true });
});

test("bad settings and missing reasons are refused, nothing saved", async () => {
  const w = world();
  for (const values of [{ "prices.shop": 0 }, { trialDays: 1.5 }, { signupOpen: "yes" }, { platformName: "Other" }, { "payAsYouSell.basisPoints": 2500 }]) {
    await assert.rejects(w.controls.saveSettings(ADMIN, { values, reason: "a good long reason here" }), { status: 400 });
  }
  await assert.rejects(w.controls.saveSettings(ADMIN, { values: { trialDays: 30 }, reason: "short" }), { status: 400 });
  await assert.rejects(w.controls.saveSettings(ADMIN, { reset: ["platformName"], reason: "a good long reason here" }), { status: 400 });
  assert.equal(w.settingsStore.docs.size, 0);
});

test("the waitlist comes newest first; an invite emails once, is found by sign-up, and is logged", async () => {
  const w = world();
  const list = await w.controls.waitlist(ADMIN);
  assert.deepEqual(list.people.map((p) => p.email), ["new@example.com", "old@example.com"]);
  assert.equal(list.waiting, 2);
  assert.deepEqual(list.inTheMaking.map((s) => [s.shopId, s.canRetry]), [["moth-press-a1b2c", true]]);

  const first = await w.controls.invite(ADMIN, { email: " New@Example.com " });
  assert.deepEqual([first.email, first.sent], ["new@example.com", true]);
  const again = await w.controls.invite(ADMIN, { email: "new@example.com" });
  assert.equal(again.sent, false);
  assert.equal(w.email.list().length, 1);
  assert.equal(w.email.list()[0].kind, "waitlist-invite");
  assert.equal(await isInvited({ invites: w.inviteStore }, "NEW@example.com"), true);
  assert.equal(await isInvited({ invites: w.inviteStore }, "old@example.com"), false);
  assert.equal((await w.controls.waitlist(ADMIN)).waiting, 1);
  assert.equal((await w.activity.list()).filter((e) => e.what === "waitlist-invite").length, 1);
  await assert.rejects(w.controls.invite(ADMIN, { email: "not an email" }), { status: 400 });
});

test("sign-up marks an invite used once", async () => {
  const w = world();
  const invites = createInvites({ invites: w.inviteStore, email: w.email, settings: platformSettings({}) });
  await invites.invite({ by: "admin@example.com", to: "ada@example.com" });
  assert.deepEqual(await invites.markUsed("ada@example.com", "moth-press-a1b2c"), { used: true });
  const row = w.inviteStore.rows.get(inviteId("ada@example.com"));
  assert.equal(row.shopId, "moth-press-a1b2c");
  const usedAt = row.usedAt;
  await invites.markUsed("ada@example.com", "other");
  assert.equal(w.inviteStore.rows.get(inviteId("ada@example.com")).usedAt, usedAt);
});

test("the activity log filters by shop and is read only", async () => {
  const w = world();
  await w.activity.record({ id: "a", at: "2026-10-28T10:00:00Z", what: "switch-set", shopId: "moth", by: "admin@example.com" });
  await w.activity.record({ id: "b", at: "2026-10-28T11:00:00Z", what: "act-as", shopId: "other", by: "admin@example.com" });
  assert.deepEqual((await w.controls.activity(ADMIN)).entries.map((e) => e.id), ["b", "a"]);
  assert.deepEqual((await w.controls.activity(ADMIN, { shopId: "moth" })).entries.map((e) => e.id), ["a"]);
  assert.equal(Object.keys(platformRoutes(w.controls)).filter((r) => /activity/.test(r)).length, 1);
});

test("the invite and fee emails render, escape the press and link over https", () => {
  const settings = { platformName: "Colophon", trialDays: 14 };
  const invite = TEMPLATES["waitlist-invite"]({ link: "https://platform.example/join/" }, { settings });
  assert.match(invite.text, /Start your shop: https:\/\/platform\.example\/join\//);
  const fee = TEMPLATES["platform-fee-changing"]({ fromPercent: 0, toPercent: 1.5, startsOn: "27 November 2026", refunded: true, link: "https://platform.example/account/billing?shop=m" }, { settings, pressName: "Moth <b>Press</b>" });
  assert.match(fee.text, /From 27 November 2026/);
  assert.doesNotMatch(fee.html, /<b>Press/);
  assert.throws(() => TEMPLATES["waitlist-invite"]({ link: "http://x.example" }, { settings }), /https/);
});

test("an admin can try making a stopped shop again; a shop on its way is left alone", async () => {
  const w = world();
  await assert.rejects(w.controls.retry(ADMIN, { shopId: "moth-press-a1b2c", reason: "short" }), { status: 400 });
  assert.deepEqual(await w.controls.retry(ADMIN, { shopId: "moth-press-a1b2c", reason: "fixed the billing account" }), { shopId: "moth-press-a1b2c", status: "queued", changed: true });
  assert.equal((await w.controls.retry(ADMIN, { shopId: "moth-press-a1b2c", reason: "fixed the billing account" })).changed, false);
  await assert.rejects(w.controls.retry(ADMIN, { shopId: "nope", reason: "fixed the billing account" }), { status: 404 });
  await assert.rejects(w.controls.retry(STRANGER, { shopId: "moth-press-a1b2c", reason: "fixed the billing account" }), { status: 403 });
  assert.equal((await w.activity.list()).filter((e) => e.what === "signup-retry").length, 1);
});

test("a ready shop whose plan change stopped is listed with the reason, and Try again clears it for the next sweep", async () => {
  const w = world();
  const stopped = { plan: "both", tries: 1, failedStep: 5, error: "the database is marked for deletion", nextTryAt: null, needsHelp: true };
  await w.signups.set("moth-press-a1b2c", { ...(await w.signups.get("moth-press-a1b2c")), status: "ready", planSync: stopped });
  const listed = (await w.controls.waitlist(ADMIN)).inTheMaking.find((s) => s.shopId === "moth-press-a1b2c");
  assert.equal(listed.status, "plan-change-stopped");
  assert.equal(listed.canRetry, true);
  assert.match(listed.message, /Moving to the both plan stopped at step 5 and needs you: the database is marked for deletion/);
  assert.deepEqual(await w.controls.retry(ADMIN, { shopId: "moth-press-a1b2c", reason: "restored the database" }), { shopId: "moth-press-a1b2c", status: "ready", changed: true });
  assert.equal((await w.signups.get("moth-press-a1b2c")).planSync, null);
  assert.equal((await w.activity.list()).filter((e) => e.what === "plan-change-retry").length, 1);
  assert.equal((await w.controls.retry(ADMIN, { shopId: "moth-press-a1b2c", reason: "restored the database" })).changed, false);
});

test("the Launch page says which keys are in place, never their values, and follows the sign-up switch", async () => {
  const w = world();
  assert.equal((await w.ask(STRANGER, "GET", "/api/control/launch")).status, 403);
  const secretValue = "sk_test_never_shown";
  const controls = createPlatformControls({
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), settingsStore: w.settingsStore,
    env: { PLATFORM_URL: "https://platform.example", [PAYMENTS_SECRETS[0].env]: secretValue, [EMAIL_SETTING.env]: "off" },
    project: "lmb-platform-prod", shopMaking: false,
  });
  const launch = await controls.launch(ADMIN);
  assert.ok(!JSON.stringify(launch).includes(secretValue));
  assert.deepEqual(launch.keys.map((k) => [k.id, k.ready]), [["stripe", true], ["connect-events", false], ["billing-events", false], ["email", false]]);
  assert.deepEqual(launch.keys.map((k) => k.secret), ["stripe-platform-test-key", "stripe-connect-webhook-secret-test", "stripe-billing-webhook-secret", null]);
  assert.equal(launch.keys.find((k) => k.id === "email").setting, 'GMAIL_SENDING: "on"');
  assert.equal(launch.keys.find((k) => k.id === "billing-events").events, "https://platform.example/api/billing/events");
  assert.equal(launch.keys.find((k) => k.id === "connect-events").events, "https://platform.example/api/payments/stripe/events");
  assert.deepEqual({ project: launch.project, signupOpen: launch.signupOpen, invites: launch.invites, shopMaking: launch.shopMaking },
    { project: "lmb-platform-prod", signupOpen: false, invites: false, shopMaking: false });

  await w.controls.saveSettings(ADMIN, { values: { signupOpen: true }, reason: "opening sign-up for launch" });
  assert.equal((await controls.launch(ADMIN)).signupOpen, true);
});

test("a shop waiting on its web address says since when, and whether it has waited over a day", async () => {
  const w = world();
  const since = new Date(Date.parse("2026-10-28T12:00:00Z") - 25 * 3_600_000).toISOString();
  await w.signups.set("wait-press", { shopId: "wait-press", pressName: "Wait Press", status: "waiting", waitingSince: since, canRetry: false, createdAt: since });
  await w.signups.set("slow-press", { shopId: "slow-press", pressName: "Slow Press", status: "waiting", canRetry: true, createdAt: since });
  const making = (await w.controls.waitlist(ADMIN)).inTheMaking;
  const wait = making.find((s) => s.shopId === "wait-press");
  assert.deepEqual([wait.waitingSince, wait.waitedTooLong], [since, true]);
  const slow = making.find((s) => s.shopId === "slow-press");
  assert.deepEqual([slow.waitingSince, slow.waitedTooLong], [null, false], "a step to try again isn't waiting on its address");
});

test("saved replies for Support: admins only, cleaned and kept in the platform's records, logged", async () => {
  const w = world();
  assert.equal((await w.ask(STRANGER, "GET", "/api/control/saved-replies")).status, 403);
  assert.equal((await w.ask(STRANGER, "POST", "/api/control/saved-replies", { replies: [] })).status, 403);
  assert.deepEqual((await w.ask(ADMIN, "GET", "/api/control/saved-replies")).body.replies, []);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/saved-replies", {})).status, 400);
  const saved = await w.ask(ADMIN, "POST", "/api/control/saved-replies", { replies: [
    { name: "  Add a card  ", body: " Open Plan & billing, then Add a card. " },
    { name: "", body: "no name, dropped" },
    { name: "x".repeat(80), body: "long name" },
  ] });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.replies.map((r) => [r.name.length, r.body]), [[10, "Open Plan & billing, then Add a card."], [60, "long name"]]);
  assert.deepEqual((await w.ask(ADMIN, "GET", "/api/control/saved-replies")).body.replies, saved.body.replies);
  const logged = await w.activity.list({ limit: 10 });
  assert.ok(logged.some((e) => e.what === "saved-replies" && e.detail.count === 2));
});

test("notes on Today lines: set, shown, cleared, admins only", async () => {
  const kept = new Map();
  const settingsStore = { get: async (k) => kept.get(k) ?? null, set: async (k, v) => kept.set(k, v) };
  const logged = [];
  const { createPlatformControls } = await import("./platformControls.js");
  const controls = createPlatformControls({ admins: ["admin@example.com"], settingsStore, env: {}, activity: { record: async (e) => logged.push(e) } });
  await controls.setTodayNote(ADMIN, { key: "payment:shop-1", words: "  called them,   waiting " });
  assert.equal((await controls.todayNotes(ADMIN)).notes["payment:shop-1"].words, "called them, waiting");
  await controls.setTodayNote(ADMIN, { key: "payment:shop-1", words: "" });
  assert.deepEqual((await controls.todayNotes(ADMIN)).notes, {});
  await assert.rejects(controls.todayNotes(STRANGER));
  await assert.rejects(controls.setTodayNote(ADMIN, { key: "" }));
  assert.equal(logged.length, 2);
});

test("an invite promises the free trial days the control room set, not the server's starting number", async () => {
  const w = world();
  const settings = platformSettings({});
  const invites = createInvites({ invites: w.inviteStore, email: w.email, settings, live: async () => ({ trialDays: 30 }) });
  await invites.invite({ by: "admin@example.com", to: "ada@example.com" });
  const sent = w.email.list().at(-1);
  assert.equal(sent.data.trialDays, 30);
  assert.match(TEMPLATES["waitlist-invite"](sent.data, { settings }).text, /The first 30 days are free/);
  // No free days set: the email promises none. An older invite with no number keeps the server's.
  assert.doesNotMatch(TEMPLATES["waitlist-invite"]({ link: sent.data.link, trialDays: 0 }, { settings }).text, /days are free/);
  assert.match(TEMPLATES["waitlist-invite"]({ link: sent.data.link }, { settings }).text, /The first 14 days are free/);
  // The settings can't be read: the server's number stands and the invite still goes.
  const quiet = createInvites({ invites: w.inviteStore, email: w.email, settings, live: async () => { throw new Error("no answer"); } });
  await quiet.invite({ by: "admin@example.com", to: "bea@example.com" });
  assert.equal(w.email.list().at(-1).data.trialDays, settings.trialDays);
});
