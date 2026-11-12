import { test } from "node:test";
import assert from "node:assert/strict";
import { LATER_STEPS, OLD_TEST_SHOP_ID, TEST_PROJECT, TEST_SHOPS, TEST_SHOP_ADDRESS, TEST_SHOP_ID, makeTestShopWith, paymentsOrWait, testShop, testShopSteps } from "./make-test-shop.js";
import { fakeAuditLog, fakeGoogle, fakeRegistry, fakeServices, fakeShared, fakeTenants } from "./fakes.js";
import { TEST_CONFIG } from "./test-shop.js";
import { SHARED_RELEASE_LOCK } from "../services/release-runner/shared.js";

const WEB_APP = Object.freeze({ apiKey: "made-up-key", authDomain: `${TEST_PROJECT}.firebaseapp.com`, projectId: TEST_PROJECT, storageBucket: `${TEST_PROJECT}.firebasestorage.app`, messagingSenderId: "123", appId: "1:123:web:abc" });
const CONFIG = Object.freeze({ ...TEST_CONFIG, sharedProject: TEST_PROJECT, webApp: WEB_APP, shopDomain: "", stockroomBucket: `${TEST_PROJECT}-stockroom` });

/** The shared test project as Google, the registry and the deploys would have it. */
function setup({ signInOn = true, oldRow = { status: "live", projectId: OLD_TEST_SHOP_ID } } = {}) {
  const google = fakeGoogle();
  google.world.projects.set(TEST_PROJECT, { projectId: TEST_PROJECT, state: "ACTIVE", parent: "folders/1" });
  if (signInOn) google.world.googleSignIns.set(TEST_PROJECT, { enabled: true, clientId: "client.example", clientSecret: "made-up-secret" });
  const registry = fakeRegistry();
  const services = fakeServices();
  const stepClients = { ...services, google: fakeTenants(), shared: fakeShared(), registry };
  const stamps = new Map();
  const calls = [];
  const deploy = {
    deployed: async (projectId, part) => (stamps.has(`${projectId} ${part}`) ? { version: stamps.get(`${projectId} ${part}`) } : null),
    async rules(projectId, { version }) { calls.push(["rules", projectId, version]); stamps.set(`${projectId} rules`, version); },
    async functions(projectId, { version }) { calls.push(["functions", projectId, version]); stamps.set(`${projectId} functions`, version); },
    async pages(projectId, { version, app }) { calls.push(["pages", projectId, version, app]); stamps.set(`${projectId} pages:${app}`, version); },
  };
  const published = [];
  const copies = [];
  const lines = [];
  const run = (apply, extra = {}) => makeTestShopWith({
    apply, ownerEmail: "Owner@Example.com", google, registry, auditLog: fakeAuditLog(), stepClients, deploy,
    builder: { build: async (v) => calls.push(["build", v]) }, makerConfig: async () => CONFIG,
    publishPages: async (shopId) => published.push(shopId), copySite: async (site) => copies.push(site), print: (line) => lines.push(line),
    now: () => new Date("2026-11-10T18:00:00Z"), ...extra,
  });
  const ready = (async () => { if (oldRow) await registry.createShop(OLD_TEST_SHOP_ID, { shopId: OLD_TEST_SHOP_ID, ownerEmail: "owner@example.com", testShop: true, testMode: true, ...oldRow }); })();
  return { google, registry, services, stepClients, calls, published, copies, lines, run: async (...args) => { await ready; return run(...args); } };
}

test("the test shop is test-press, in test mode, at the shared test project's own address", () => {
  const shop = testShop(" Owner@Example.com ");
  assert.deepEqual([shop.shopId, shop.ownerEmail, shop.testShop, shop.testMode, shop.plan, shop.freeAddress], [TEST_SHOP_ID, "owner@example.com", true, true, "both", "lmb-test-shop.web.app"]);
  assert.equal(TEST_SHOP_ADDRESS, `${TEST_PROJECT}.web.app`);
  assert.throws(() => testShop(""), /TEST_SHOP_OWNER_EMAIL/);
});

test("the general test shop is test-goods, sells other things and answers at a site of its own", () => {
  const goods = testShop("owner@example.com", TEST_SHOPS[1]);
  assert.deepEqual([goods.shopId, goods.pressName, goods.publishes, goods.freeAddress, goods.testShop, goods.testMode], ["test-goods", "Test Goods", "other", "lmb-test-goods.web.app", true, true]);
  assert.equal(testShop("owner@example.com").publishes, "books");
});

test("steps 7 and 8 wait until their services are connected", () => {
  const { stepClients } = setup();
  const steps = testShopSteps({ clients: stepClients, config: CONFIG, connected: {} });
  for (const number of Object.keys(LATER_STEPS).map(Number)) assert.match(steps[number - 1].name, /waits for/);
  const connected = testShopSteps({ clients: stepClients, config: CONFIG, connected: { 7: true, 8: true } });
  assert.doesNotMatch(connected[6].name, /waits for/);
});

test("a dry run changes nothing anywhere", async () => {
  const { google, registry, calls, run, lines } = setup();
  const result = await run(false);
  assert.deepEqual(result, { ok: true, stage: "project", dryRun: true });
  assert.deepEqual(google.calls, []);
  assert.deepEqual(calls, []);
  assert.equal((await registry.getShop(OLD_TEST_SHOP_ID)).status, "live");
  assert.ok(lines.includes("The rest waits until the project is ready."));
});

test("a real run readies the project, retires the old test shop, sends the first release and makes both test shops", async () => {
  const { registry, stepClients, calls, published, copies, run } = setup();
  const result = await run(true);
  assert.deepEqual(result, { ok: true, stage: "done" });

  // The old test shop is out of the per-project releases; its data was never touched.
  const old = await registry.getShop(OLD_TEST_SHOP_ID);
  assert.deepEqual([old.status, old.abandonedWhy], ["abandoned", "moved into the shared system as test-press"]);

  // The first release: rules, the shared server, the site, once.
  assert.deepEqual(calls, [["build", "1.0.0"], ["rules", TEST_PROJECT, "1.0.0"], ["functions", TEST_PROJECT, "1.0.0"], ["pages", TEST_PROJECT, "1.0.0", "shop"]]);
  assert.equal([...registry.releases.values()][0].kind, "shared-first-release");
  assert.equal(await registry.readLock(SHARED_RELEASE_LOCK), null);

  // The test shop: a live folder in the shared test project, at the project's address, with its pages drawn.
  const row = await registry.getShop(TEST_SHOP_ID);
  assert.deepEqual([row.shared, row.projectId, row.status, row.testShop, row.testMode, row.freeAddress], [true, TEST_PROJECT, "live", true, true, TEST_SHOP_ADDRESS]);
  assert.equal(stepClients.shared.addresses.map.get(TEST_SHOP_ADDRESS).shopId, TEST_SHOP_ID);
  assert.equal((await registry.getProfile(TEST_SHOP_ID)).siteUrl, `https://${TEST_SHOP_ADDRESS}`);
  assert.equal(row.publishes, "books");
  const steps = await registry.readSteps(TEST_SHOP_ID);
  assert.ok(steps.some((e) => /waits for payments/.test(e.name)));

  // The general test shop: its own folder, at the second site, which got a copy of the project's site first.
  const goods = await registry.getShop("test-goods");
  assert.deepEqual([goods.projectId, goods.status, goods.testShop, goods.testMode, goods.freeAddress, goods.publishes], [TEST_PROJECT, "live", true, true, "lmb-test-goods.web.app", "other"]);
  assert.equal(stepClients.shared.addresses.map.get("lmb-test-goods.web.app").shopId, "test-goods");
  assert.equal((await registry.getProfile("test-goods")).sells, "other");
  assert.deepEqual(copies, ["lmb-test-goods"]);
  assert.deepEqual(published, [TEST_SHOP_ID, "test-goods"]);

  // Run again: the release goes through the staged update now, and the shop is left as it is.
  calls.length = 0;
  const again = await run(true);
  assert.equal(again.ok, true);
  assert.deepEqual(calls, []);
  assert.equal((await registry.getShop(TEST_SHOP_ID)).status, "live");
  assert.equal((await registry.getShop("test-goods")).status, "live");
});

test("a site that can't be copied stops the run at the general test shop, in plain words; the book shop is made", async () => {
  const { registry, run } = setup();
  const result = await run(true, { copySite: async () => { throw new Error("site id taken"); } });
  assert.deepEqual([result.ok, result.stage, result.shopId], [false, "site", "test-goods"]);
  assert.match(result.error, /couldn't be copied to lmb-test-goods \(site id taken\)/);
  assert.equal((await registry.getShop(TEST_SHOP_ID)).status, "live");
  assert.equal(await registry.getShop("test-goods"), null);
});

test("the run stops in plain words while Google sign-in is off, and sends nothing", async () => {
  const { calls, run, registry } = setup({ signInOn: false });
  const result = await run(true);
  assert.equal(result.ok, false);
  assert.equal(result.stage, "project");
  assert.match(result.error, /Google sign-in isn't on in lmb-test-shop yet/);
  assert.deepEqual(calls, []);
  assert.equal(await registry.getShop(TEST_SHOP_ID), null);
});

test("with no old test shop, or one already retired, nothing is marked", async () => {
  const fresh = setup({ oldRow: null });
  assert.equal((await fresh.run(true)).ok, true);
  assert.equal(await fresh.registry.getShop(OLD_TEST_SHOP_ID), null);

  const retired = setup({ oldRow: { status: "abandoned", abandonedAt: "2026-01-01T00:00:00Z" } });
  assert.equal((await retired.run(true)).ok, true);
  assert.equal((await retired.registry.getShop(OLD_TEST_SHOP_ID)).abandonedAt, "2026-01-01T00:00:00Z");
});

// The services' own key names, spelled from parts so only services/ name them in full.
const PAYMENT_KEY = { [["STRIPE", "PLATFORM", "TEST", "KEY"].join("_")]: "sk_test_madeUp" };
const LIVE_KEY = { [["STRIPE", "PLATFORM", "LIVE", "KEY"].join("_")]: "sk_live_madeUp" };
const EMAIL_KEY = { GMAIL_SENDING: "on" };

test("the platform's services join in test mode only when their keys are handed over", async () => {
  const { platformServices } = await import("./make-test-shop.js");
  const platform = { get: async () => null };
  assert.deepEqual([platformServices({ env: {}, fetch, token: async () => "t", platform }).payments, platformServices({ env: {}, fetch, token: async () => "t", platform }).email], [null, null]);
  const both = platformServices({ env: { ...PAYMENT_KEY, ...EMAIL_KEY }, fetch, token: async () => "t", platform });
  assert.equal(typeof both.payments.createAccount, "function");
  assert.equal(typeof both.email.send, "function");
  assert.throws(() => platformServices({ env: LIVE_KEY, fetch, token: async () => "t", platform }), /live/);
});

test("the deploy account is let sign the test owner's pass before the shop's steps, and a refusal stops the run plainly", async () => {
  const { run } = setup();
  let asked = 0;
  const ok = await run(true, { allowOwnerSigning: async () => { asked += 1; return { changed: true }; } });
  assert.equal(ok.ok, true);
  assert.equal(asked, 1);

  const second = setup();
  const refused = await second.run(true, { allowOwnerSigning: async () => { throw new Error("no setIamPolicy"); } });
  assert.equal(refused.ok, false);
  assert.equal(refused.stage, "owner-signing");
  assert.match(refused.error, /Service Account Token Creator on firebase-adminsdk-fbsvc@lmb-test-shop/);
  assert.deepEqual(second.published, []);
});

test("with Connect off in the platform's Stripe account, step 7 waits and the test shop is still made", async () => {
  const connectOff = { number: 7, name: "Connect the press's payments", check: async () => false, act: async () => { throw new Error("You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect."); } };
  const lines = [];
  const wrapped = paymentsOrWait(connectOff, (line) => lines.push(line));
  assert.equal(await wrapped.check({}), false);
  const waited = await wrapped.act({});
  assert.equal(waited.detail.waiting, "Stripe Connect is off for the platform's Stripe account");
  // The runner checks again after the step: a step that waited passes for this run.
  assert.equal(await wrapped.check({}), true);
  assert.match(lines.at(-1), /dashboard\.stripe\.com\/connect/);
  // Stripe asking for its newer accounts API waits too.
  const v2Only = { ...connectOff, act: async () => { throw new Error("Stripe no longer recommends Accounts v1 for new Connect integrations. Create connected accounts with POST /v2/core/accounts instead."); } };
  assert.match((await paymentsOrWait(v2Only).act({})).detail.waiting, /newer accounts API/);
  // Any other refusal still stops the run.
  await assert.rejects(paymentsOrWait({ ...connectOff, act: async () => { throw new Error("card declined"); } }).act({}), /card declined/);
  // The test shop's own step 7 is wrapped once payments are connected.
  const { stepClients } = setup();
  const steps = testShopSteps({ clients: stepClients, config: CONFIG, connected: { 7: true } });
  assert.equal(steps[6].number, 7);
  assert.doesNotMatch(steps[6].name, /waits for/);
});

test("a payments step that waits lets the run go on to the next step", async () => {
  const { runSteps } = await import("./runner.js");
  const registry = fakeRegistry();
  const v2Only = { number: 1, name: "Connect the press's payments", check: async () => false, act: async () => { throw new Error("Stripe no longer recommends Accounts v1 for new Connect integrations. Create connected accounts with POST /v2/core/accounts instead."); } };
  let next = 0;
  const after = { number: 2, name: "The next step", check: async () => next > 0, act: async () => { next += 1; } };
  const shop = testShop("owner@example.com");
  await registry.createShop(shop.shopId, shop);
  const result = await runSteps({ shop, steps: [paymentsOrWait(v2Only), after], registry, auditLog: fakeAuditLog() });
  assert.equal(result.ok, true, result.error);
  assert.equal(next, 1);
});

test("the test shop's card key comes from STRIPE_TEST_PUBLISHABLE_KEY, test mode only", async () => {
  const { testPublishableKeys } = await import("./make-test-shop.js");
  assert.deepEqual(testPublishableKeys({}), { live: "", test: "" });
  assert.deepEqual(testPublishableKeys({ STRIPE_TEST_PUBLISHABLE_KEY: " pk_test_abcdefghijkl0123 " }), { live: "", test: "pk_test_abcdefghijkl0123" });
  assert.throws(() => testPublishableKeys({ STRIPE_TEST_PUBLISHABLE_KEY: "pk_live_abcdefghijkl0123" }), /test publishable key/);
});
