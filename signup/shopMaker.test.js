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
import { TERMS_VERSION } from "../terms/terms.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true };

async function make({ failOnce = [], google = fakeGoogle({ failOnce }), selfCheck = null, passed = null, plan = "both", publishPlan = null } = {}) {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const now = () => new Date(clock);
  const stores = fakeSignupStores();
  const registry = fakeRegistry();
  const services = fakeServices();
  const reported = [];
  const run = (shop, options = {}) => runSteps({
    shop, registry, auditLog: fakeAuditLog(), now, ...options,
    steps: shopSteps({ ...services, google, registry, profileFiles: fakeProfileFiles(), config: TEST_CONFIG }),
  });
  const repairs = { report: async (r) => void reported.push(r), ...(passed ? { passed } : {}) };
  const maker = createShopMaker({ signups: stores.signups, run, registry, repairs, selfCheck, now, ...(publishPlan ? { billing: { publishPlan } } : {}) });
  const signup = createSignup({
    ...stores, registry, email: fakePlatformEmail(), auth: fakeAuth(), settings: platformSettings({}), now, suffix: () => "abcde",
    billing: { startTrial: async () => ({ status: "trialing", trialEnd: null }) },
  });
  const api = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: { "POST /api/signup/retry": (claims, request) => maker.retry(claims, request.body?.shopId) } });
  const ask = (method, path, body, claims = ADA) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const { shopId } = await signup.start(ADA, { pressName: "Moth Press", plan, country: "CA", termsAccepted: true, termsVersion: TERMS_VERSION });
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
  assert.equal(shopFromSignup({ shopId: "x", plan: "shop", answer: "fairs" }, { testMode: true }).sellingToday, "fairs");
  assert.equal(shopFromSignup({ shopId: "x", plan: "shop", answer: null }, { testMode: true }).sellingToday, null);
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

// Adding or dropping an app later (code plan 6.11): billing writes the registry's plan, and the next sweep builds the
// added app, rewrites the profile's apps and, when the stockroom goes, turns the link off.
test("adding the stockroom later builds it, rewrites the profile and starts the link; dropping it turns the link off", async () => {
  const published = [];
  const { maker, stores, registry, services, google, shopId } = await make({ plan: "shop", publishPlan: async (id) => void published.push(id) });
  await maker.sweep();
  assert.deepEqual((await registry.getProfile(shopId)).apps, { shop: true, stockroom: false });
  assert.equal(stores.signups.rows.get(shopId).builtPlan, "shop");
  assert.deepEqual(await maker.sweep(), [], "nothing to do while the plan is unchanged");

  // The press adds the stockroom (billing.changePlan writes the registry's plan).
  await registry.updateShop(shopId, { plan: "both" });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "plan-done", plan: "both" }]);
  const profile = await registry.getProfile(shopId);
  assert.deepEqual(profile.apps, { shop: true, stockroom: true });
  assert.ok(profile.stockroom?.firestoreDatabase, "the profile names the stockroom's own database");
  assert.ok(google.calls.some(([name, , databaseId]) => name === "firestore.createDatabase" && databaseId === profile.stockroom.firestoreDatabase), "the stockroom's database was made");
  assert.ok(services.calls.some(([name]) => name === "inventoryLink.startSales"), "the link was started");
  assert.equal(stores.signups.rows.get(shopId).builtPlan, "both");
  assert.deepEqual(published, [shopId, shopId], "the shop (and now its stockroom) was given its plan again");
  assert.deepEqual(await maker.sweep(), [], "done once");

  // The stockroom's paid month ends: billing writes the plan without it.
  await services.shopData.set(shopId, "systemStatus/inventoryLink", { links: { b1: { _: "inv-1" } }, startDay: "2026-10-28", connection: { ok: true }, keptDetails: { x: "y" } });
  await registry.updateShop(shopId, { plan: "shop" });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "plan-done", plan: "shop" }]);
  assert.deepEqual((await registry.getProfile(shopId)).apps, { shop: true, stockroom: false });
  assert.equal((await registry.getProfile(shopId)).stockroom, undefined);
  const link = await services.shopData.get(shopId, "systemStatus/inventoryLink");
  assert.deepEqual(link.links, {});
  assert.equal(link.startDay, null);
  assert.equal(link.connection, null);
  assert.deepEqual(link.stockroomClosed.links, { b1: { _: "inv-1" } }, "the matches are kept beside it");
  assert.deepEqual(link.keptDetails, { x: "y" }, "the rest of the link's record is left as it was");
});

test("a plan change that fails goes to the repair queue and waits before trying again; the shop keeps its old plan", async () => {
  const google = fakeGoogle();
  const { maker, stores, registry, shopId, reported, tick } = await make({ plan: "shop", google });
  await maker.sweep();
  const create = google.firestore.createDatabase;
  google.firestore.createDatabase = async () => { throw new Error("quota exceeded (pretend Google error)"); };
  await registry.updateShop(shopId, { plan: "both" });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "plan-failed", plan: "both" }]);
  const row = stores.signups.rows.get(shopId);
  assert.equal(row.status, "ready", "the press's shop is still ready");
  assert.equal(row.builtPlan, "shop");
  assert.equal(row.planSync.tries, 1);
  assert.equal(reported.at(-1).check, "plan-change");
  assert.deepEqual((await registry.getProfile(shopId)).apps, { shop: true, stockroom: false }, "nothing half-switched in the profile");
  assert.deepEqual(await maker.sweep(), [], "waits before the next try");
  google.firestore.createDatabase = create;
  tick(15);
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "plan-done", plan: "both" }]);
  assert.equal(stores.signups.rows.get(shopId).planSync, null);
});

test("adding the website to a stockroom deploys the stockroom's pages again, so they carry the new profile", async () => {
  const { maker, registry, services, shopId } = await make({ plan: "stockroom" });
  await maker.sweep();
  const pagesBefore = services.calls.filter(([name, , , app]) => name === "deploy.pages" && app === "stockroom").length;
  await registry.updateShop(shopId, { plan: "both" });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "plan-done", plan: "both" }]);
  const pages = services.calls.filter(([name]) => name === "deploy.pages").map(([, , , app]) => app);
  assert.ok(pages.filter((app) => app === "stockroom").length > pagesBefore, "the stockroom's pages went out again");
  assert.ok(pages.includes("shop"), "the website's pages were made");
  const stamps = (await registry.getShop(shopId)).pagesProfile;
  assert.equal(stamps.shop, stamps.stockroom, "both apps carry the same, newest profile");
});

test("a plan change that stops for a person is reported once and not retried; a closed shop is left alone", async () => {
  const google = fakeGoogle();
  const { maker, stores, registry, shopId, reported, tick } = await make({ plan: "shop", google });
  await maker.sweep();
  const create = google.firestore.createDatabase;
  google.firestore.createDatabase = async () => { throw new Error("the database is marked for deletion"); };
  await registry.updateShop(shopId, { plan: "both" });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "plan-needs-help", plan: "both" }]);
  assert.equal(stores.signups.rows.get(shopId).planSync.needsHelp, true);
  assert.match(reported.at(-1).problem, /a person decides/);
  google.firestore.createDatabase = create;
  tick(24 * 60);
  assert.deepEqual(await maker.sweep(), [], "not tried again on its own");

  // A person clears it; then the shop closes before the next sweep.
  await stores.signups.set(shopId, { ...stores.signups.rows.get(shopId), planSync: null });
  await registry.updateShop(shopId, { closing: { stage: "closed" } });
  assert.deepEqual(await maker.sweep(), [], "a closed shop is not built");
});

test("a plan changed before the shop is made is the one the shop is made with", async () => {
  const { maker, registry, shopId } = await make({ plan: "both" });
  // The registry row only exists once step 1 has run; a plan change before that waits in billing's row, and the
  // registry's plan is what counts once it is there.
  await registry.createShop(shopId, { shopId, plan: "stockroom", ownerEmail: "owner@example.com" });
  await maker.sweep();
  assert.deepEqual((await registry.getProfile(shopId)).apps, { shop: false, stockroom: true });
});

test("the sign-up page opens the stockroom for a stockroom-only press, and the admin once the website is added", async () => {
  const { maker, stores, registry, shopId, ask } = await make({ plan: "stockroom" });
  await maker.sweep();
  assert.equal(stores.signups.rows.get(shopId).openUrl, `https://${shopId}-stockroom.web.app`);
  assert.equal((await ask("GET", "/api/signup")).body.shops[0].openUrl, `https://${shopId}-stockroom.web.app`);
  await registry.updateShop(shopId, { plan: "both" });
  await maker.sweep();
  assert.deepEqual((await registry.getProfile(shopId)).apps, { shop: true, stockroom: true });
  assert.equal(stores.signups.rows.get(shopId).openUrl, `${(await registry.getProfile(shopId)).siteUrl}/admin`);
});
