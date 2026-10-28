import { test } from "node:test";
import assert from "node:assert/strict";
import { realSetupClients } from "./real.js";
import { shopSteps } from "./later-steps.js";
import { stepProblems } from "./runner.js";
import { fakeServices } from "./fakes.js";
import { TEST_CONFIG } from "./test-shop.js";
import { scriptedFetch, token } from "../clients/fake-fetch.js";
import { FIRESTORE } from "../clients/firestore.js";

// Google's addresses live only in clients/ (steps.test.js keeps them out of setup/).
const R = `${FIRESTORE}/projects/lmb-platform-prod/databases/(default)/documents`;
const str = (s) => ({ stringValue: s });

test("the real clients have every part the sixteen steps reach, in the fakes' shape", () => {
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
