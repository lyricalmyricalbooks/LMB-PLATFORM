// The shop maker run from sign-up (code plan 2.6), against the real setup steps and runner with a pretend Google and
// pretend services: a sign-up becomes a live shop; a failure a retry can fix shows plain words and a "Try again"; one
// that needs a person goes to the repair queue; and only the owner can retry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createShopMaker, retryable, shopFromSignup, STEP_WORDS, AUTO_TRIES } from "./shopMaker.js";
import { createApi } from "./api.js";
import { createSignup } from "./signup.js";
import { fakeAuth, fakeSignupStores, fakeVerifyIdToken } from "./fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { runSteps } from "../setup/runner.js";
import { shopSteps } from "../setup/later-steps.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "../setup/fakes.js";
import { TEST_CONFIG } from "../setup/test-shop.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true };

async function make({ failOnce = [], google = fakeGoogle({ failOnce }), selfCheck = null, passed = null } = {}) {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const now = () => new Date(clock);
  const stores = fakeSignupStores();
  const registry = fakeRegistry();
  const services = fakeServices();
  const reported = [];
  const run = (shop) => runSteps({
    shop, registry, auditLog: fakeAuditLog(), now,
    steps: shopSteps({ ...services, google, registry, profileFiles: fakeProfileFiles(), config: TEST_CONFIG }),
  });
  const repairs = { report: async (r) => void reported.push(r), ...(passed ? { passed } : {}) };
  const maker = createShopMaker({ signups: stores.signups, run, registry, repairs, selfCheck, now });
  const signup = createSignup({
    ...stores, registry, email: fakePlatformEmail(), auth: fakeAuth(), settings: platformSettings({}), now, suffix: () => "abcde",
    billing: { startTrial: async () => ({ status: "trialing", trialEnd: null }) },
  });
  const api = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: { "POST /api/signup/retry": (claims, request) => maker.retry(claims, request.body?.shopId) } });
  const ask = (method, path, body, claims = ADA) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const { shopId } = await signup.start(ADA, { pressName: "Moth Press", plan: "both", country: "CA" });
  return { stores, registry, services, google, maker, ask, shopId, reported, tick: (minutes) => { clock += minutes * 60_000; } };
}

test("a sign-up becomes a live shop on the next sweep, with its address for the page", async () => {
  const { maker, stores, registry, shopId, ask } = await make();
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "ready" }]);
  const row = stores.signups.rows.get(shopId);
  assert.equal(row.status, "ready");
  assert.equal(row.siteUrl, (await registry.getProfile(shopId)).siteUrl);
  assert.equal((await registry.getShop(shopId)).status, "live");
  const [shop] = (await ask("GET", "/api/signup")).body.shops;
  assert.equal(shop.status, "ready");
  assert.deepEqual(await maker.sweep(), [], "a ready shop is left alone");
});

test("a failure a retry can fix: plain words, a Try again button, automatic tries, and it carries on where it stopped", async () => {
  const { maker, stores, shopId, google, tick } = await make({ failOnce: ["projects.create"] });
  await maker.sweep();
  let row = stores.signups.rows.get(shopId);
  assert.equal(row.status, "waiting");
  assert.equal(row.canRetry, true);
  assert.equal(row.failedStep, 2);
  assert.match(row.message, /We couldn't finish making your shop's own space\. Nothing is lost: press Try again/);
  assert.doesNotMatch(row.message, /projects\.create|Google|step/i, "no machine words for the press");

  assert.deepEqual(await maker.sweep(), [], "not due yet");
  tick(1);
  await maker.sweep();
  row = stores.signups.rows.get(shopId);
  assert.equal(row.status, "ready");
  assert.equal(google.calls.filter(([name]) => name === "projects.create").length, 2, "only the failed step was tried again");
});

test("after the automatic tries it waits for the press, and the repair queue hears about it", async () => {
  const google = fakeGoogle();
  google.projects.create = async () => { throw new Error("quota exceeded (pretend Google error)"); };
  const { maker, stores, shopId, tick, reported } = await make({ google });
  for (let i = 0; i < AUTO_TRIES; i += 1) {
    await maker.sweep();
    tick(15);
  }
  const row = stores.signups.rows.get(shopId);
  assert.equal(row.attempts, AUTO_TRIES);
  assert.equal(row.nextTryAt, null);
  assert.equal(row.canRetry, true);
  assert.doesNotMatch(row.message, /try again ourselves/);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].check, "shop-maker");
});

test("Try again: only the owner, only when it can help, not twice in a row, and the next sweep runs it", async () => {
  const { maker, stores, shopId, ask, tick } = await make({ failOnce: ["firebase.addFirebase"] });
  await maker.sweep();
  assert.equal((await ask("POST", "/api/signup/retry", { shopId }, { ...ADA, uid: "uid-other" })).status, 404);
  assert.equal((await ask("POST", "/api/signup/retry", { shopId })).status, 429, "too soon after the last try");
  tick(1);
  const answer = await ask("POST", "/api/signup/retry", { shopId });
  assert.deepEqual(answer.body, { ok: true, shopId, status: "queued" });
  await maker.sweep();
  assert.equal(stores.signups.rows.get(shopId).status, "ready");
});

test("a step that stops for a person: no button, the press is told we're on it, and the repair queue gets it", async () => {
  const google = fakeGoogle();
  const { maker, stores, shopId, ask, reported } = await (async () => {
    const made = await make({ google });
    google.world.projects.set(made.shopId, { projectId: made.shopId, parent: "folders/999", state: "ACTIVE" });
    return made;
  })();
  await maker.sweep();
  const row = stores.signups.rows.get(shopId);
  assert.equal(row.status, "needs-help");
  assert.equal(row.canRetry, false);
  assert.match(row.message, /needs a hand from us\. We've been told/);
  assert.equal(reported[0].problem, "step 2 stopped for a person");
  assert.equal((await ask("POST", "/api/signup/retry", { shopId })).status, 409);
  assert.deepEqual(await maker.sweep(), [], "not tried again by itself");
});

test("every setup step has words for the press, and person-stops are told apart from retries", () => {
  for (let step = 1; step <= 16; step += 1) assert.ok(STEP_WORDS[step], `step ${step}`);
  assert.equal(retryable("projects.create failed (pretend Google error)"), true);
  assert.equal(retryable("a project called x exists outside the shops folder; choose another shop id"), false);
  assert.equal(retryable("the database is in us-east1, not northamerica-northeast1"), false);
  assert.equal(retryable("the registry has x on square, but the shop chose stripe; a person decides which one stays"), false);
  assert.deepEqual(shopFromSignup({ shopId: "x", pressName: "P", ownerEmail: "o@example.com", plan: "shop", country: "CA", currency: "CAD" }, { testMode: false }).testMode, false);
});

test("a shop that becomes ready closes its shop-maker repairs and gets its self-checks; a failing check never holds it up", async () => {
  const passed = [];
  const checked = [];
  const selfCheck = { check: async (shopId, { why }) => { checked.push([shopId, why]); throw new Error("pretend check trouble"); } };
  const { maker, stores, shopId } = await make({ selfCheck, passed: async (id, check) => { passed.push([id, check]); return 1; } });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "ready" }]);
  assert.deepEqual(passed, [[shopId, "shop-maker"]]);
  assert.deepEqual(checked, [[shopId, "the shop maker finished"]]);
  assert.equal(stores.signups.rows.get(shopId).status, "ready");
});
