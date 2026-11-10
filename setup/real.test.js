import { test } from "node:test";
import assert from "node:assert/strict";
import { folderInventoryLink, realSetupClients, realSharedClients, sharedInventoryLink, sharedShopRun } from "./real.js";
import { LINK_DOC } from "./later-steps.js";
import { sharedShopSteps } from "./sharedSteps.js";
import { shopSteps } from "./later-steps.js";
import { stepProblems } from "./runner.js";
import { fakeServices } from "./fakes.js";
import { TEST_CONFIG } from "./test-shop.js";
import { scriptedFetch, token } from "../clients/fake-fetch.js";
import { FIRESTORE } from "../clients/firestore.js";

// Google's addresses live only in clients/ (steps.test.js keeps them out of setup/).
const R = `${FIRESTORE}/projects/lmb-platform-prod/databases/(default)/documents`;
const str = (s) => ({ stringValue: s });

test("the real clients have every part the twenty-one steps reach, in the fakes' shape", () => {
  const real = realSetupClients({ fetch: scriptedFetch([]), token, run: async () => {}, buildDir: () => "/b", paymentService: { findAccount() {}, createAccount() {} }, emailService: { wasSent() {}, send() {} } });
  const fake = fakeServices();
  for (const part of ["deploy", "envFiles", "shopData", "siteCheck", "inventoryLink", "stockroom"]) {
    for (const method of Object.keys(fake[part]).filter((k) => typeof fake[part][k] === "function")) assert.equal(typeof real[part][method], "function", `${part}.${method}`);
  }
  for (const part of ["projects", "billing", "firebase", "services", "firestore", "storage", "backups", "storageProbe"]) assert.ok(real.google[part], part);
  const steps = shopSteps({ ...real, config: { ...TEST_CONFIG, paymentsServiceUrl: "https://payments.example" } });
  assert.deepEqual(stepProblems(steps), []);
});

test("the link client signs in only as the test shop's owner, and reaches the shop's own region", async () => {
  const shopRow = (testShop) => ({ fields: { shopId: str("lmb-test-shop"), ownerEmail: str("owner@example.com"), testShop: { booleanValue: testShop } } });
  const profile = { fields: { functionsRegion: str("northamerica-northeast1"), firebase: { mapValue: { fields: { apiKey: str("AIzaK"), projectId: str("lmb-test-shop") } } } } };
  const fetch = scriptedFetch([
    { method: "GET", url: `${R}/shops/lmb-test-shop/profile/current`, json: profile },
    { method: "GET", url: `${R}/shops/lmb-test-shop`, json: shopRow(false) },
    { method: "GET", url: `${R}/shops/lmb-test-shop/profile/current`, json: profile },
  ]);
  const real = realSetupClients({ fetch, token, run: async () => {}, buildDir: () => "/b", serviceAccount: "release-check@example.com" });
  await assert.rejects(real.inventoryLink.state("lmb-test-shop"), /not the platform's test shop/);
  fetch.done();
});

test("the shared clients have every part the shared steps reach", () => {
  const real = realSharedClients({ fetch: scriptedFetch([]), token, projectId: "lmb-test-shop", paymentService: { findAccount() {}, createAccount() {} }, emailService: { wasSent() {}, send() {} } });
  for (const part of ["records", "stockroomRecords", "liveRecords", "addresses"]) assert.ok(real.shared[part], part);
  for (const method of ["state", "check", "saveLinks", "startSales"]) assert.equal(typeof real.inventoryLink[method], "function", method);
  const config = { ...TEST_CONFIG, sharedProject: "lmb-test-shop", webApp: { projectId: "lmb-test-shop" }, shopDomain: "shops.example", stockroomBucket: "lmb-test-shop-stockroom" };
  assert.deepEqual(stepProblems(sharedShopSteps({ ...real, config })), []);
});

test("a new shop's stockroom link is turned on in its folder; the test shop's goes through its own admin", async () => {
  const docs = new Map();
  const shopData = {
    get: async (shopId, path) => docs.get(`${shopId}/${path}`) ?? null,
    set: async (shopId, path, data) => { docs.set(`${shopId}/${path}`, { ...(docs.get(`${shopId}/${path}`) ?? {}), ...data }); },
  };
  const known = new Set(["press-a"]);
  const inFolder = folderInventoryLink({ shopData, stockroomRecords: { get: async (id) => (known.has(id) ? { tenant: "t" } : null) }, now: () => new Date("2026-11-10T15:00:00Z") });
  assert.deepEqual(await inFolder.check("press-a"), { ok: true });
  assert.equal((await inFolder.check("press-b")).ok, false);
  await inFolder.startSales("press-a", { startDay: "2026-11-10" });
  assert.deepEqual(await inFolder.state("press-a"), {
    startDay: "2026-11-10", backfill: { from: "2026-11-10", done: false, cursor: null, sent: 0 }, salesStartedAt: "2026-11-10T15:00:00.000Z", salesStartedBy: "Colophon (shop made)",
  });
  // A start day already there is the press's: never moved.
  await inFolder.startSales("press-a", { startDay: "2026-11-11" });
  assert.equal(docs.get(`press-a/${LINK_DOC}`).startDay, "2026-11-10");
  await assert.rejects(inFolder.saveLinks("press-a", {}), /made by the press/);

  const asked = [];
  const throughShop = Object.fromEntries(["state", "check", "saveLinks", "startSales"].map((name) => [name, async (shopId) => { asked.push(`${name} ${shopId}`); return { ok: true }; }]));
  const rows = { "lmb-test-shop": { testShop: true }, "press-a": { testShop: false } };
  const link = sharedInventoryLink({ registry: { getShop: async (id) => rows[id] ?? null }, throughShop, inFolder });
  await link.check("lmb-test-shop");
  assert.deepEqual(await link.check("press-a"), { ok: true });
  assert.deepEqual(asked, ["check lmb-test-shop"]);
});

test("the hosted server makes shared shops only once the shared project and the shops' domain are named", () => {
  const parts = { fetch: scriptedFetch([]), token, settings: { platformUrl: "https://platform.example", senderEmail: "hello@platform.example" } };
  assert.equal(sharedShopRun({ ...parts, env: {} }), null);
  assert.equal(sharedShopRun({ ...parts, env: { SHARED_SHOPS_PROJECT: "lmb-test-shop" } }), null);
  assert.equal(typeof sharedShopRun({ ...parts, env: { SHARED_SHOPS_PROJECT: "lmb-test-shop", SHARED_SHOPS_DOMAIN: "shops.example" } }), "function");
});
