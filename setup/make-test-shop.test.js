import { test } from "node:test";
import assert from "node:assert/strict";
import { LATER_STEPS, TEST_SHOP_ID, testShop, testShopConfig, testShopSteps } from "./make-test-shop.js";
import { runSteps } from "./runner.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "./fakes.js";

test("the test shop is only ever lmb-test-shop, in test mode, with the owner's address", () => {
  const shop = testShop(" Owner@Example.com ");
  assert.deepEqual([shop.shopId, shop.ownerEmail, shop.testShop, shop.testMode, shop.plan], [TEST_SHOP_ID, "owner@example.com", true, true, "both"]);
  assert.throws(() => testShop(""), /TEST_SHOP_OWNER_EMAIL/);
});

test("steps 13 and 14 wait for their keys, and the rest of the shop is still made", async () => {
  const google = fakeGoogle();
  const registry = fakeRegistry();
  const services = fakeServices();
  const config = { folder: "folders/000000000000", billingAccount: "billingAccounts/000000-000000-000000", senderEmail: "shops@example.com", paymentsServiceUrl: "https://payments.platform.example", stripePublishableKeys: {}, release: { version: "1.0.0", starterContent: () => [] } };
  const steps = testShopSteps({ clients: { ...services, google, registry, profileFiles: fakeProfileFiles() }, config, connected: {} });
  for (const number of Object.keys(LATER_STEPS).map(Number)) assert.match(steps[number - 1].name, /waits for/);
  const result = await runSteps({ shop: testShop("owner@example.com"), steps, registry, auditLog: fakeAuditLog(), print: () => {} });
  assert.equal(result.ok, true, JSON.stringify(result.ran?.filter((r) => r.status === "failed")));
  const connected = testShopSteps({ clients: { ...services, google, registry, profileFiles: fakeProfileFiles() }, config, connected: { 13: true, 14: true } });
  assert.doesNotMatch(connected[12].name, /waits for/);
});

test("the config takes the project's own folder and billing, and says what to do when either is missing", async () => {
  const google = {
    projects: { get: async () => ({ projectId: TEST_SHOP_ID, parent: "organizations/1", state: "ACTIVE" }) },
    billing: { get: async () => ({ billingEnabled: true, billingAccountName: "billingAccounts/AAA" }) },
  };
  const config = await testShopConfig({ google });
  assert.deepEqual([config.folder, config.billingAccount, config.release.version], ["organizations/1", "billingAccounts/AAA", "1.0.0"]);
  assert.match(config.paymentsServiceUrl, /^https:\/\/lmb-platform-prod\.web\.app\/api\/payments$/);
  await assert.rejects(testShopConfig({ google: { ...google, projects: { get: async () => null } } }), /doesn't exist/);
  await assert.rejects(testShopConfig({ google: { ...google, billing: { get: async () => ({ billingEnabled: false }) } } }), /Link one/);
});
