import { test } from "node:test";
import assert from "node:assert/strict";
import { runSteps, stepProblems } from "./runner.js";
import { fakeAuditLog, fakeRegistry, fakeServices } from "./fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "./test-shop.js";
import { createRequire } from "node:module";
import { SHARED_STEP_PLAN, SHARED_STEP_WORDS, SHOP_KEYS, freeHost, recordProfileFiles, serverSettings, sharedShopSteps, sharedSiteUrl } from "./sharedSteps.js";
import { tenantIdOf, tenantName } from "./shopTenant.js";
import { profileProblems } from "../profile/profile.js";

const SHARED = "lmb-test-shop";
const WEB_APP = Object.freeze({ apiKey: "made-up-key", authDomain: `${SHARED}.firebaseapp.com`, projectId: SHARED, storageBucket: `${SHARED}.firebasestorage.app`, messagingSenderId: "123", appId: "1:123:web:abc" });
const CONFIG = Object.freeze({ ...TEST_CONFIG, sharedProject: SHARED, webApp: WEB_APP, shopDomain: "shops.example", stockroomBucket: `${SHARED}-stockroom` });
const PRESS = Object.freeze({ shopId: "moth-press", pressName: "Moth Press", ownerEmail: "Owner@Example.com", plan: "shop", country: "CA", currency: "CAD", paymentProvider: "stripe", testMode: true });

/** Google's sign-in lists, in memory (as in shopTenant.test.js). */
function fakeTenants() {
  const lists = [];
  const signIns = new Map();
  return {
    lists,
    authConfig: { googleSignIn: async () => ({ enabled: true, clientId: "client.example", clientSecret: "made-up-secret" }) },
    tenants: {
      list: async () => lists.map((t) => ({ ...t })),
      async create(projectId, fields) { const list = { name: `projects/${projectId}/tenants/${fields.displayName}-x`, ...fields }; lists.push(list); return list; },
      async patch(_p, id, fields) { Object.assign(lists.find((t) => tenantIdOf(t) === id), fields); },
      googleSignIn: async (_p, id) => signIns.get(id) ?? null,
      async addGoogleSignIn(_p, id, c) { signIns.set(id, c); },
      async patchGoogleSignIn(_p, id, c) { signIns.set(id, c); },
    },
  };
}

/** The shared project's records, their copies and the addresses, in memory (clients/shared.js shape). */
function fakeShared() {
  const store = () => {
    const docs = new Map();
    return {
      docs,
      get: async (id) => structuredClone(docs.get(id) ?? null),
      async set(id, data, { fields } = {}) {
        const kept = fields ? { ...(docs.get(id) ?? {}) } : {};
        docs.set(id, structuredClone({ ...kept, ...(fields ? Object.fromEntries(fields.map((f) => [f, data[f]])) : data) }));
      },
    };
  };
  const addresses = new Map();
  return {
    records: store(), stockroomRecords: store(), liveRecords: store(), addresses: {
      map: addresses,
      get: async (host) => structuredClone(addresses.get(host) ?? null),
      async create(host, data) { if (addresses.has(host)) return false; addresses.set(host, structuredClone(data)); return true; },
    },
  };
}

function world({ pageStatus } = {}) {
  const services = fakeServices({ pageStatus });
  const google = fakeTenants();
  const shared = fakeShared();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const steps = sharedShopSteps({ ...services, google, shared, registry, config: CONFIG });
  const run = (shop, options = {}) => runSteps({ shop, steps, registry, auditLog, ...options });
  return { services, google, shared, registry, steps, run };
}

test("the steps are numbered in order, each with words for the press", () => {
  const { steps } = world();
  assert.deepEqual(stepProblems(steps), []);
  assert.equal(steps.length, Object.keys(SHARED_STEP_WORDS).length);
  for (const step of steps) assert.ok(SHARED_STEP_WORDS[step.number], step.name);
  for (const n of [...SHARED_STEP_PLAN.planSteps, ...Object.values(SHARED_STEP_PLAN.marks)]) assert.ok(steps[n - 1], `step ${n}`);
});

test("makes a shop in the shared project: sign-in list, profile, record in every store, its address, both apps", async () => {
  const { run, registry, shared, services, google } = world();
  const result = await run(PRESS);
  assert.equal(result.ok, true, result.error);

  const row = await registry.getShop("moth-press");
  assert.equal(row.projectId, SHARED);
  assert.equal(row.plan, "both");
  assert.equal(row.status, "live");
  assert.equal(row.tenant, tenantIdOf(google.lists[0]));
  assert.equal(google.lists[0].displayName, tenantName("moth-press"));

  const profile = await registry.getProfile("moth-press");
  assert.deepEqual(profileProblems(profile), []);
  assert.deepEqual(profile.apps, { shop: true, stockroom: true });
  assert.equal(profile.siteUrl, "https://moth-press.shops.example");
  assert.equal(profile.firebase.projectId, SHARED);
  assert.deepEqual(profile.stockroom, { firestoreDatabase: "stockroom", storageBucket: `${SHARED}-stockroom` });
  // Payments (step 7) went into the record's profile too: the front door serves that one.
  assert.equal(profile.payments.provider, "stripe");

  const record = await shared.records.get("moth-press");
  assert.deepEqual(record.profile, profile);
  assert.equal(record.tenant, row.tenant);
  assert.equal(record.ownerEmail, "owner@example.com");
  assert.equal(record.status, "open");
  assert.equal(record.server.SHOP_SITE_URL, "https://moth-press.shops.example");
  assert.equal(record.server.SHOP_TEST_SHOP, "false");
  assert.equal(record.server.SHOP_PAYMENT_MODE, "platform");
  assert.equal(record.server.SHOP_OWNER_EMAIL, undefined, "the owner is the record's own field");
  for (const copy of [shared.stockroomRecords, shared.liveRecords]) assert.deepEqual(await copy.get("moth-press"), { tenant: row.tenant, ownerEmail: "owner@example.com" });
  assert.deepEqual(shared.addresses.map.get("moth-press.shops.example").shopId, "moth-press");

  // Starter content in the shop's folder, the owner's place, and the welcome email with links at the shop's address.
  assert.ok(await services.shopData.get("moth-press", "members/owner@example.com"));
  const welcome = services.world.sent.get("moth-press owner-welcome");
  assert.deepEqual(welcome.links, { shopAdmin: "https://moth-press.shops.example/admin", stockroom: "https://moth-press.shops.example/stockroom" });
  // Nothing was deployed: the shared site serves every shop.
  assert.equal(services.calls.filter(([name]) => name.startsWith("deploy.")).length, 0);
});

test("safe to run twice, and a run that stopped carries on where it stopped", async () => {
  let up = false;
  const { run, registry, shared, google } = world({ pageStatus: () => (up ? 200 : 503) });
  const first = await run(PRESS);
  assert.equal(first.ok, false);
  assert.equal(first.failedStep, 9);
  assert.match(first.error, /shop check failed/);
  up = true;
  const second = await run(PRESS);
  assert.equal(second.ok, true, second.error);
  const before = structuredClone(await shared.records.get("moth-press"));
  const third = await run(PRESS, { again: [3, 4, 5] });
  assert.equal(third.ok, true);
  assert.deepEqual(await shared.records.get("moth-press"), before);
  assert.equal(google.lists.length, 1);
  assert.equal((await registry.getShop("moth-press")).status, "live");
});

test("a status the platform set later is kept, and an address another shop holds stops for a person", async () => {
  const one = world();
  assert.equal((await one.run(PRESS)).ok, true);
  await one.shared.records.set("moth-press", { status: "paused" }, { fields: ["status"] });
  assert.equal((await one.run(PRESS, { again: [4] })).ok, true);
  assert.equal((await one.shared.records.get("moth-press")).status, "paused");

  const two = world();
  await two.shared.addresses.create("moth-press.shops.example", { shopId: "other-press" });
  const result = await two.run(PRESS);
  assert.equal(result.failedStep, 5);
  assert.match(result.error, /already belongs to the shop other-press; a person decides/);
  assert.equal(two.shared.addresses.map.get("moth-press.shops.example").shopId, "other-press");
});

test("a shop id with a project of its own is never taken into the shared system by a run", async () => {
  const { run, registry } = world();
  await registry.createShop("moth-press", { shopId: "moth-press", projectId: "moth-press", ownerEmail: PRESS.ownerEmail });
  const result = await run(PRESS);
  assert.equal(result.failedStep, 1);
  assert.match(result.error, /project of its own/);
});

test("the test shop: its free address is the one the platform gave it, and its server settings say so", async () => {
  const { run, registry, shared } = world();
  await registry.createShop(TEST_SHOP.shopId, { shopId: TEST_SHOP.shopId, projectId: SHARED, ownerEmail: TEST_SHOP.ownerEmail, freeAddress: "lmb-test-shop.web.app" });
  const result = await run(TEST_SHOP);
  assert.equal(result.ok, true, result.error);
  assert.equal((await registry.getProfile(TEST_SHOP.shopId)).siteUrl, "https://lmb-test-shop.web.app");
  assert.equal((await shared.records.get(TEST_SHOP.shopId)).server.SHOP_TEST_SHOP, "true");
  assert.equal(shared.addresses.map.get("lmb-test-shop.web.app").shopId, TEST_SHOP.shopId);
});

test("addresses, server settings and the record's profile file", async () => {
  assert.equal(freeHost("moth-press", null, "Shops.Example."), "moth-press.shops.example");
  assert.throws(() => freeHost("moth-press", null, ""), /shopDomain/);
  const row = { domains: [{ name: "shop.mothpress.example" }], mainDomain: "shop.mothpress.example" };
  assert.equal(sharedSiteUrl("moth-press", row, "shops.example"), "https://shop.mothpress.example");
  assert.equal(sharedSiteUrl("moth-press", { mainDomain: "elsewhere.example" }, "shops.example"), "https://moth-press.shops.example");
  const server = serverSettings({ ...PRESS, pressName: 'Moth "Press"\n' }, { senderEmail: "shops@example.com", paymentsServiceUrl: "https://payments.platform.example", siteUrl: "https://a.example", extraOrigins: ["https://b.example"] });
  assert.equal(server.SHOP_SENDER_NAME, "Moth Press");
  assert.equal(server.SHOP_EXTRA_ORIGINS, "https://b.example");
  assert.equal(server.SHOP_STOCKROOM_DATABASE, "stockroom");
  assert.ok(!("SHOP_PAYMENTS_SERVICE_URL" in server), "shared by every shop: the server's own setting");

  const shared = fakeShared();
  const files = recordProfileFiles(shared.records);
  assert.equal(await files.read("moth-press"), null);
  await assert.rejects(files.write("moth-press", 'window.__SHOP_PROFILE__ = {"shopId":"other"};'), /names other/);
});

test("sign-up makes a shop in the shared system: no queue for a project, the press's words follow these steps", async () => {
  const { createShopMaker } = await import("../signup/shopMaker.js");
  const { createSignup } = await import("../signup/signup.js");
  const { fakeAuth, fakeSignupStores } = await import("../signup/fakes.js");
  const { fakePlatformEmail } = await import("../services/billing/fakes.js");
  const { platformSettings } = await import("../services/settings.js");
  const { TERMS_VERSION } = await import("../terms/terms.js");
  const { makingView } = await import("../signup/making.js");
  let up = false;
  const w = world({ pageStatus: () => (up ? 200 : 503) });
  const stores = fakeSignupStores();
  const maker = createShopMaker({ signups: stores.signups, run: (shop, options) => w.run(shop, options), registry: w.registry, steps: SHARED_STEP_PLAN });
  const signup = createSignup({
    ...stores, registry: w.registry, email: fakePlatformEmail(), auth: fakeAuth(), settings: platformSettings({}), suffix: () => "abcde",
    live: async () => ({ signupOpen: true, signupDailyCap: 10 }), billing: { startTrial: async () => ({ status: "trialing", trialEnd: null }) },
  });
  const { shopId } = await signup.start({ uid: "uid-ada", email: "owner@example.com", email_verified: true }, { pressName: "Moth Press", plan: "shop", country: "CA", termsAccepted: true, termsVersion: TERMS_VERSION });

  // The shared site isn't answering yet: the shop waits at the check, in these steps' words, its address already done.
  const [first] = await maker.sweep();
  assert.equal(first.status, "waiting");
  assert.match((await stores.signups.get(shopId)).message, new RegExp(SHARED_STEP_WORDS[9]));
  const progress = await maker.progress(shopId);
  assert.equal(progress.total, 11);
  assert.deepEqual(progress.marks, SHARED_STEP_PLAN.marks);
  const view = makingView({ making: { ...progress, status: "making" } });
  assert.deepEqual(view.rows.map((r) => r.state), ["done", "working", "waiting"]);

  up = true;
  assert.equal((await maker.make(shopId)).status, "ready");
  const row = await stores.signups.get(shopId);
  assert.equal(row.openUrl, `https://${shopId}.shops.example/admin`);
  assert.equal(row.builtPlan, "both");
});

test("the per-shop server settings a record carries are the ones the shop's server reads", () => {
  assert.deepEqual(SHOP_KEYS, createRequire(import.meta.url)("../apps/shop/functions/shopConfig.js").SHOP_KEYS);
});

test("each shop carries the shared server's key, so the platform's services take that server's calls for it", async () => {
  const { sharedServiceKeyHash } = await import("./serviceKey.js");
  const { hashServiceKey } = await import("../services/email/http.js");
  const versions = [];
  const google = {
    secrets: {
      latest: async (projectId, name) => (projectId === SHARED && name === "PLATFORM_SERVICE_KEY" ? versions.at(-1) ?? null : null),
      add: async (_projectId, _name, value) => void versions.push(value),
    },
  };
  const hash = await sharedServiceKeyHash(google, SHARED);
  assert.equal(versions.length, 1, "made once when missing");
  assert.equal(hash, hashServiceKey(versions[0]));
  assert.equal(await sharedServiceKeyHash(google, SHARED), hash, "never rotated");
  assert.equal(versions.length, 1);

  const services = fakeServices();
  const registry = fakeRegistry();
  const steps = sharedShopSteps({ ...services, google: fakeTenants(), shared: fakeShared(), registry, config: { ...CONFIG, serviceKeyHash: hash } });
  assert.equal((await runSteps({ shop: PRESS, steps, registry, auditLog: fakeAuditLog() })).ok, true);
  assert.equal((await registry.getShop(PRESS.shopId)).serviceKeyHash, hash);

  // A shop made before the key was kept: a re-run fills it in and changes nothing else.
  await registry.updateShop(PRESS.shopId, { serviceKeyHash: null });
  assert.equal(await steps[0].check({ shop: PRESS }), false);
  await steps[0].act({ shop: PRESS });
  const row = await registry.getShop(PRESS.shopId);
  assert.equal(row.serviceKeyHash, hash);
  assert.equal(row.status, "live");
});
