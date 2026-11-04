import { test } from "node:test";
import assert from "node:assert/strict";
import { platformWorld } from "../walkthrough/world.js";
import { signatureHeader } from "../services/payments/stripeSignature.js";
import { offToken as tipsOffToken } from "../services/trial-tips/index.js";
import { assertTestMode, hostedWorld, proxyHopsOf } from "./world.js";
import { TEST_ENV, TEST_PROJECT, fakeOutside } from "./fakes.js";
import { pretendLiveKeyEnv } from "../services/payments/fakes.js";

const build = (env = TEST_ENV, outside = fakeOutside()) => ({ outside, world: hostedWorld({ env, fetch: outside.fetch, token: outside.token, log: () => {} }) });

test("the hosted door has every route the practice door has", () => {
  const practice = Object.keys(platformWorld().routes).sort();
  const hosted = Object.keys(build().world.routes);
  assert.ok(practice.length > 50, `found ${practice.length} practice routes`);
  assert.deepEqual(practice.filter((route) => !hosted.includes(route)), [], "routes missing from server/world.js");
  assert.deepEqual(hosted.filter((route) => !practice.includes(route)), [], "routes only the hosted door has: add them to walkthrough/world.js too");
});

test("building the hosted platform calls nothing outside, and needs no network until asked", () => {
  let calls = 0;
  let tokens = 0;
  hostedWorld({ env: TEST_ENV, fetch: async () => { calls += 1; throw new Error("no network"); }, token: async () => { tokens += 1; return "t"; }, log: () => {} });
  assert.equal(calls, 0);
  assert.equal(tokens, 0);
});

test("every signed-in route refuses a call without a sign-in, and each one is there (not 'nothing here')", async () => {
  const { world, outside } = build();
  for (const route of Object.keys(world.routes)) {
    const [method, path] = route.split(" ");
    const answer = await world.handle({ method, path, headers: {}, body: {}, rawBody: "{}" });
    assert.equal(answer.status, 401, `${route} answered ${answer.status}`);
  }
  assert.deepEqual(outside.other, []);
});

test("the plans answer from the live settings in the platform's database", async () => {
  const { world, outside } = build();
  await outside.firestore.fetch; // the pretend Firestore starts empty: the plain settings apply
  const answer = await world.handle({ method: "GET", path: "/api/plans", headers: { "x-forwarded-for": "203.0.113.9" }, ip: "10.0.0.1" });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ok, true);
  assert.deepEqual(answer.body.plans.map((p) => p.plan).sort(), ["both", "shop", "stockroom"]);
  assert.equal(answer.body.signupOpen, true);
  // The fair-use counter is the real one, in the platform project, keyed by a hash.
  assert.equal(outside.firestore.paths(TEST_PROJECT, "throttle/").length, 1);
  assert.deepEqual(outside.other, []);
});

test("a real sign-in reaches the routes: the person's shops in the making, and a new device is remembered", async () => {
  const { world, outside } = build();
  const token = outside.signIn({ uid: "uid-owner", email: "owner@example.com" });
  const answer = await world.handle({ method: "GET", path: "/api/signup", headers: { authorization: `Bearer ${token}`, "x-device-id": "device-0123456789abcdef" } });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.deepEqual(answer.body.shops, []);
  assert.ok(outside.firestore.get(TEST_PROJECT, "devices/uid-owner"), "the device was written down");
  const forged = `${token.split(".").slice(0, 2).join(".")}.${"A".repeat(342)}`;
  assert.equal((await world.handle({ method: "GET", path: "/api/signup", headers: { authorization: `Bearer ${forged}` } })).status, 401);
  assert.deepEqual(outside.other, []);
});

test("the control room opens only for a listed admin signed in with two steps", async () => {
  const { world, outside } = build();
  const ask = (token) => world.handle({ method: "GET", path: "/api/control/jobs", headers: { authorization: `Bearer ${token}` } });
  assert.equal((await ask(outside.signIn({ uid: "uid-x", email: "owner@example.com", secondFactor: "totp" }))).status, 403);
  assert.equal((await ask(outside.signIn({ uid: "uid-a", email: "admin@example.com" }))).status, 403);
  const jobs = await ask(outside.signIn({ uid: "uid-a", email: "admin@example.com", secondFactor: "totp" }));
  assert.equal(jobs.status, 200, JSON.stringify(jobs.body));
  assert.ok(jobs.body.jobs.some((job) => job.name === "shop-checkup"));
  assert.equal(jobs.body.jobs.find((job) => job.name === "press-messages").canRun, true);
  assert.equal(jobs.body.jobs.find((job) => job.name === "shop-maker").canRun, false);
});

test("Stripe's billing events are checked by signature against the raw body", async () => {
  const { world, outside } = build();
  const rawBody = JSON.stringify({ id: "evt_1", type: "customer.created", livemode: false, data: { object: {} } });
  const unsigned = await world.handle({ method: "POST", path: "/api/billing/events", headers: {}, rawBody });
  assert.equal(unsigned.status, 400);
  const signed = await world.handle({ method: "POST", path: "/api/billing/events", headers: { "stripe-signature": signatureHeader("whsec_pretend_billing", rawBody, Math.floor(Date.now() / 1000)) }, rawBody });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.equal(outside.firestore.get(TEST_PROJECT, "billingEvents/evt_1").state, "done");
  assert.equal((await world.handle({ method: "GET", path: "/api/billing/events", headers: {} })).status, 405);
});

test("the payment and email services' doors are reached under /api", async () => {
  const { world } = build();
  assert.equal((await world.handle({ method: "GET", path: "/api/payments/shop", headers: {} })).status, 405);
  assert.equal((await world.handle({ method: "POST", path: "/api/payments/stripe/events", headers: {}, rawBody: "" })).status, 400);
  assert.equal((await world.handle({ method: "POST", path: "/api/email/shop", headers: { "x-shop-id": "moth-press" }, body: {} })).status, 401);
});

test("the tips' and check-up's turn-off pages work with their phrases, and say so plainly without them", async () => {
  const { world, outside } = build();
  const bad = await world.handle({ method: "GET", path: "/tips/off", query: { shop: "moth-press", sig: "wrong" }, headers: {} });
  assert.equal(bad.status, 400);
  assert.match(bad.html, /didn't work/);
  const good = await world.handle({ method: "GET", path: "/tips/off", query: { shop: "moth-press", sig: tipsOffToken(TEST_ENV.TRIAL_TIPS_SECRET, "moth-press") }, headers: {} });
  assert.equal(good.status, 200);
  assert.equal(outside.firestore.get(TEST_PROJECT, "trialTips/moth-press").off, true);
  assert.equal((await world.handle({ method: "GET", path: "/checkup/off", query: { shop: "moth-press", sig: "x" }, headers: {} })).status, 400);

  const { world: bare } = build({ ...TEST_ENV, TRIAL_TIPS_SECRET: "", CHECKUP_SECRET: "too-short" });
  for (const path of ["/tips/off", "/checkup/off"]) {
    const page = await bare.handle({ method: "GET", path, query: {}, headers: {} });
    assert.equal(page.status, 503);
    assert.match(page.html, /switched on yet/);
  }
  assert.equal(bare.trialTips, null);
  assert.equal(bare.checkups, null);
});

test("an address no door has is 'nothing here'", async () => {
  const { world } = build();
  const answer = await world.handle({ method: "GET", path: "/api/nothing", headers: {} });
  assert.equal(answer.status, 404);
});

test("the hosted server bills in test mode only: live mode or a live key stops it before anything is built", () => {
  assert.throws(() => assertTestMode({ BILLING_MODE: "live" }), /test mode only/);
  assert.throws(() => assertTestMode(pretendLiveKeyEnv()), /live Stripe settings/);
  assert.doesNotThrow(() => assertTestMode({}));
  const outside = fakeOutside();
  assert.throws(() => hostedWorld({ env: { ...TEST_ENV, BILLING_MODE: "live" }, fetch: outside.fetch, token: outside.token }), /test mode only/);
  assert.throws(() => hostedWorld({ env: TEST_ENV, fetch: outside.fetch }), /token/);
});

test("LIMIT_PROXY_HOPS is read as a small whole number", () => {
  assert.equal(proxyHopsOf({}), 0);
  assert.equal(proxyHopsOf({ LIMIT_PROXY_HOPS: "1" }), 1);
  assert.throws(() => proxyHopsOf({ LIMIT_PROXY_HOPS: "two" }), /whole number/);
});

test("making a shop answers plainly that it isn't switched on yet, and the press's place is kept", async () => {
  const { world, outside } = build();
  await world.platform.set("signups/moth-press", { shopId: "moth-press", accountId: "uid-owner", status: "queued", pressName: "Moth Press", plan: "both" });
  const row = await world.shopMaker.make("moth-press");
  assert.match(row.error ?? "", /isn't switched on yet/);
  assert.deepEqual(outside.other, []);
});

test("a shop's Stripe events and sent emails reach its control-room record (the delivery counts, plan 19.12)", async () => {
  const secret = "whsec_test_connect_pretend";
  const { world } = build({ ...TEST_ENV, STRIPE_CONNECT_WEBHOOK_SECRET_TEST: secret });
  await world.registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live", plan: "shop", payments: { provider: "stripe", accountId: "acct_moth", mode: "test" } });
  await world.platform.set("emailSent/k1", { shopId: "moth-press", kind: "receipt", status: "sent", at: new Date().toISOString() });
  const raw = JSON.stringify({ id: "evt_1", livemode: false, account: "acct_moth", type: "checkout.session.completed", data: { object: {} } });
  const { error, warn } = console;
  console.error = () => {};
  console.warn = () => {};
  try {
    await world.payments.stripeEvent({ "stripe-signature": signatureHeader(secret, raw, Math.floor(Date.now() / 1000)) }, raw);
    await new Promise((resolve) => setTimeout(resolve, 20)); // the count is kept beside the forward, not before it
  } finally {
    Object.assign(console, { error, warn });
  }
  const admin = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
  const record = await world.room.shop(admin, { shopId: "moth-press" });
  assert.equal(record.delivery.payments.received, 1);
  assert.equal(record.delivery.email.sent, 1);
});

test("the app connection answers under /api/apps/v1 and refuses a call without an app's key (code plan 26.3)", async () => {
  const { world } = build();
  const answer = await world.handle({ method: "GET", path: "/api/apps/v1/shop", headers: {}, body: {}, rawBody: "" });
  assert.equal(answer.status, 401);
  assert.match(answer.body.message, /key/);
});
