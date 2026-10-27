import { test } from "node:test";
import assert from "node:assert/strict";
import { latestByStep, runSteps, stepProblems } from "./runner.js";
import { REGION, shopProblems } from "./steps.js";
import { OWNER_WELCOME, appsOf, envFileText, laterSteps, shopSteps } from "./later-steps.js";
import { PAYMENT_PROVIDERS, paymentProblems } from "./payments.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "./fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "./test-shop.js";
import { readShopConfig } from "../apps/shop/functions/shopConfig.js";

const ID = TEST_SHOP.shopId;

function setup({ failOnce = [], googleFailOnce = [], shop = TEST_SHOP, config = TEST_CONFIG, pageStatus } = {}) {
  const google = fakeGoogle({ failOnce: googleFailOnce });
  const services = fakeServices({ failOnce, pageStatus });
  const registry = fakeRegistry();
  const profileFiles = fakeProfileFiles();
  const auditLog = fakeAuditLog({ isReady: (shopId) => google.world.databases.has(shopId) });
  const steps = shopSteps({ ...services, google, registry, profileFiles, config });
  const run = (options = {}) => runSteps({ shop, steps, registry, auditLog, ...options });
  const changes = () => google.calls.length + services.calls.length;
  return { google, services, registry, auditLog, steps, run, changes };
}

const called = (services, name) => services.calls.filter(([n]) => n === name);

test("all fifteen steps are numbered and complete", () => {
  const { steps } = setup();
  assert.deepEqual(stepProblems(steps), []);
  assert.equal(steps.length, 15);
});

test("a full run makes the test shop live: rules, server code in Montréal, pages, backup, private files, starter content, Stripe, email", async () => {
  const { google, services, registry, auditLog, run } = setup();
  const result = await run();
  assert.equal(result.ok, true, result.error);
  const { world } = services;

  assert.deepEqual(world.deployed.get(`${ID} rules`), { version: "0.0.0-test", apps: ["shop", "stockroom"] });
  // The region is passed to the deploy explicitly, not left to the shop code's default.
  assert.deepEqual(called(services, "deploy.functions"), [["deploy.functions", ID, "0.0.0-test", "northamerica-northeast1"]]);
  assert.equal(world.envFiles.get(ID), envFileText(TEST_SHOP, TEST_CONFIG));
  assert.deepEqual(called(services, "deploy.pages").map(([, , , app]) => app), ["shop", "stockroom"]);
  assert.ok(google.world.backupPermission.has(ID));
  assert.equal(google.world.backups.get(ID).length, 1);
  assert.ok(google.world.testFiles.has(ID));

  assert.deepEqual(world.docs.get(`${ID} members/owner@example.com`).role, "owner");
  assert.equal(world.docs.get(`${ID} settings/website`).shopName, "Test Press");

  const row = await registry.getShop(ID);
  assert.deepEqual(row.payments, { provider: "stripe", accountId: world.accounts.stripe.get(ID) });
  assert.deepEqual(called(services, "stripe.createAccount"), [["stripe.createAccount", ID, true]], "the test shop's account is made in test mode");

  const welcome = world.sent.get(`${ID} ${OWNER_WELCOME}`);
  assert.equal(welcome.to, "owner@example.com");
  assert.deepEqual(welcome.links, { shopAdmin: `https://${ID}.web.app/admin`, stockroom: `https://${ID}-stockroom.web.app` });
  assert.equal(welcome.idempotencyKey, `${ID}-${OWNER_WELCOME}`);

  assert.equal(row.status, "live");
  assert.deepEqual([...auditLog.entries.get(ID).values()].map((e) => e.step).sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.equal(registry.locks.size, 0, "the lock is given back");
});

test("running again changes nothing anywhere", async () => {
  const { registry, auditLog, steps, run, changes } = setup();
  await run();
  const before = changes();
  const forgetful = { ...registry, readSteps: async () => [], recordStep: async () => {} };
  const second = await runSteps({ shop: TEST_SHOP, steps, registry: forgetful, auditLog });
  assert.equal(second.ok, true, second.error);
  assert.deepEqual(second.ran.map((r) => r.status), Array(15).fill("already-done"));
  assert.equal(changes(), before);
});

test("the env file is what the shop's server code reads", () => {
  const text = envFileText({ ...TEST_SHOP, ownerEmail: "Owner@Example.com", pressName: 'Moth "Night" Press\nand Co' }, TEST_CONFIG);
  const env = Object.fromEntries(text.trim().split("\n").map((line) => {
    const [, key, value] = line.match(/^([A-Z_]+)="(.*)"$/);
    return [key, value];
  }));
  assert.deepEqual(Object.keys(env), ["SHOP_OWNER_EMAIL", "SHOP_SENDER_NAME", "SHOP_SENDER_EMAIL", "SHOP_SITE_URL", "SHOP_EXTRA_ORIGINS"]);
  const config = readShopConfig({ ...env, GCLOUD_PROJECT: ID });
  assert.equal(config.ownerEmail, "owner@example.com");
  assert.equal(config.senderName, "Moth Night Press and Co");
  assert.equal(config.senderEmail, "shops@example.com");
  assert.equal(config.siteUrl, `https://${ID}.web.app`);
  assert.ok(!config.allowedOrigins.some((origin) => origin.includes("yourpress")), "no placeholder addresses");
});

test("server code already in another region stops the run and is left alone", async () => {
  const { services, run } = setup();
  services.world.deployed.set(`${ID} functions`, { version: "0.0.0-test", region: "us-central1" });
  const result = await run();
  assert.equal(result.failedStep, 8);
  assert.match(result.error, /us-central1, not northamerica-northeast1/);
  assert.deepEqual(called(services, "deploy.functions"), []);
});

test("another release already live stops the run for a person", async () => {
  const { services, run } = setup();
  services.world.deployed.set(`${ID} rules`, { version: "0.0.1-newer", apps: ["shop", "stockroom"] });
  const result = await run();
  assert.equal(result.failedStep, 7);
  assert.match(result.error, /release 0\.0\.1-newer is live, not 0\.0\.0-test; a person decides/);
  assert.deepEqual(called(services, "deploy.rules"), []);
});

test("rules for the wrong apps are deployed again for the plan's apps", async () => {
  const { services, run } = setup();
  services.world.deployed.set(`${ID} rules`, { version: "0.0.0-test", apps: ["shop"] });
  assert.equal((await run()).ok, true);
  assert.deepEqual(services.world.deployed.get(`${ID} rules`).apps, ["shop", "stockroom"]);
});

test("stored files anyone can read stop the run before the shop opens", async () => {
  for (const [status, reason] of [[200, /anyone can read/], [404, /gave 404, not a refusal/]]) {
    const { google, registry, run } = setup();
    google.world.unsignedReadStatus = status;
    const result = await run();
    assert.equal(result.failedStep, 11);
    assert.match(result.error, reason);
    assert.notEqual((await registry.getShop(ID)).status, "live");
  }
});

test("starter content the press already changed is kept", async () => {
  const { services, run } = setup();
  services.world.docs.set(`${ID} settings/website`, { shopName: "Renamed by the press" });
  assert.equal((await run()).ok, true);
  assert.equal(services.world.docs.get(`${ID} settings/website`).shopName, "Renamed by the press");
  assert.ok(!called(services, "shopData.create").some(([, , path]) => path === "settings/website"));
  assert.ok(services.world.docs.has(`${ID} settings/setupChecklist`));
});

test("a stockroom-only shop gets no server code, no payments and only the stockroom pages", async () => {
  const shop = { ...TEST_SHOP, plan: "stockroom" };
  const { services, registry, run } = setup({ shop });
  assert.deepEqual(appsOf(shop), ["stockroom"]);
  assert.equal((await run()).ok, true);
  assert.deepEqual(called(services, "deploy.functions"), []);
  assert.deepEqual(called(services, "stripe.createAccount"), []);
  assert.deepEqual(called(services, "deploy.pages").map(([, , , app]) => app), ["stockroom"]);
  assert.deepEqual(services.world.sent.get(`${ID} ${OWNER_WELCOME}`).links, { stockroom: `https://${ID}-stockroom.web.app` });
  assert.equal((await registry.getShop(ID)).payments, undefined);
});

test("a failed shop check leaves the shop not live, and the retry marks it live", async () => {
  let broken = true;
  const { registry, run } = setup({ pageStatus: (url) => (broken && url.endsWith("/admin") ? 500 : 200) });
  const first = await run();
  assert.equal(first.failedStep, 15);
  assert.match(first.error, /\/admin answered 500/);
  assert.equal((await registry.getShop(ID)).status, "creating");
  broken = false;
  const second = await run();
  assert.equal(second.ok, true, second.error);
  assert.deepEqual(second.ran.map((r) => r.status), [...Array(14).fill("done-before"), "done"]);
  assert.equal((await registry.getShop(ID)).status, "live");
});

test("a shop marked abandoned is never made live", async () => {
  const { registry, steps, run } = setup();
  assert.equal((await run()).ok, true);
  await registry.updateShop(ID, { status: "abandoned" });
  await assert.rejects(steps[14].check({ shop: TEST_SHOP }), /marked abandoned/);
});

test("an email that failed once is sent once on the retry", async () => {
  const { services, run } = setup({ failOnce: ["email.send"] });
  assert.equal((await run()).failedStep, 14);
  assert.equal((await run()).ok, true);
  assert.equal(called(services, "email.send").length, 2, "tried twice");
  assert.equal(services.world.sent.size, 1, "delivered once");
});

test("a deploy that failed is retried at its step without redoing earlier work", async () => {
  const { google, services, registry, run } = setup({ failOnce: ["deploy.pages"] });
  const first = await run();
  assert.equal(first.failedStep, 9);
  assert.equal(latestByStep(await registry.readSteps(ID))[9].status, "failed");
  assert.equal(registry.locks.size, 0, "the lock is given back after a failure too");
  const second = await run();
  assert.equal(second.ok, true, second.error);
  assert.equal(called(services, "deploy.functions").length, 1);
  assert.equal(google.calls.filter(([n]) => n === "projects.create").length, 1);
});

test("the dry run prints all fifteen steps and changes nothing", async () => {
  const { registry, run, changes } = setup();
  const lines = [];
  const result = await run({ dryRun: true, print: (line) => lines.push(line) });
  assert.equal(result.ok, true);
  assert.equal(lines.length, 16);
  assert.equal(lines[13], "13. Connect the press's payments: would run");
  assert.equal(changes(), 0);
  assert.equal(registry.shops.size + registry.locks.size, 0);
});

// Payments: a provider choice, Stripe first.

test("payments take a provider: Stripe works, Square is planned and refused before Google is asked", async () => {
  assert.deepEqual(Object.keys(PAYMENT_PROVIDERS), ["stripe", "square"]);
  assert.deepEqual(paymentProblems(TEST_SHOP), []);
  const { paymentProvider: _, ...noChoice } = TEST_SHOP;
  assert.deepEqual(paymentProblems(noChoice), [], "Stripe when the press chose none");
  assert.match(paymentProblems({ ...TEST_SHOP, paymentProvider: "square" })[0], /Square aren't ready yet \(plan item 2\.2b\)/);
  assert.match(paymentProblems({ ...TEST_SHOP, paymentProvider: "toString" })[0], /must be one of stripe, square/);
  assert.match(shopProblems({ ...TEST_SHOP, testMode: "yes" })[0], /test mode/);

  const { google, services, run } = setup({ shop: { ...TEST_SHOP, paymentProvider: "square" } });
  const result = await run();
  assert.equal(result.failedStep, 1);
  assert.match(result.error, /Square/);
  assert.equal(google.calls.length + services.calls.length, 0);
});

test("payments with no connection for the chosen provider stop at step 13", async () => {
  const services = fakeServices();
  const google = fakeGoogle();
  const registry = fakeRegistry();
  const steps = shopSteps({ ...services, providers: {}, google, registry, profileFiles: fakeProfileFiles(), config: TEST_CONFIG });
  const result = await runSteps({ shop: TEST_SHOP, steps, registry, auditLog: fakeAuditLog() });
  assert.equal(result.failedStep, 13);
  assert.match(result.error, /no Stripe connection/);
});

test("an account the payment service already made is saved, not made again", async () => {
  const { services, registry, run } = setup();
  services.world.accounts.stripe.set(ID, "acct_fake_existing");
  assert.equal((await run()).ok, true);
  assert.deepEqual(called(services, "stripe.createAccount"), []);
  assert.deepEqual((await registry.getShop(ID)).payments, { provider: "stripe", accountId: "acct_fake_existing" });
});

test("payments that disagree with the registry stop for a person", async () => {
  const cases = [
    [{ provider: "square", accountId: "sq_fake" }, null, /on square, but the shop chose stripe/],
    [{ provider: "stripe", accountId: "acct_fake_a" }, "acct_fake_b", /name different accounts/],
    [{ provider: "stripe", accountId: "acct_fake_gone" }, null, /can't find it/],
  ];
  for (const [saved, found, reason] of cases) {
    const { services, registry, run } = setup();
    // Run to step 12, then put the registry and the service out of step.
    const upTo12 = await runSteps({ shop: TEST_SHOP, steps: setupSteps12(services, registry), registry, auditLog: fakeAuditLog() });
    assert.equal(upTo12.ok, true, upTo12.error);
    await registry.updateShop(ID, { payments: saved });
    if (found) services.world.accounts.stripe.set(ID, found);
    const result = await run();
    assert.equal(result.failedStep, 13);
    assert.match(result.error, reason);
    assert.deepEqual(called(services, "stripe.createAccount"), []);
  }
});

// Steps 1–12 over the same services and registry (a fresh Google each time is fine: only step results matter here).
function setupSteps12(services, registry) {
  const steps = shopSteps({ ...services, google: fakeGoogle(), registry, profileFiles: fakeProfileFiles(), config: TEST_CONFIG });
  return steps.slice(0, 12);
}

test("missing release settings are refused", () => {
  const services = fakeServices();
  const args = { ...services, google: fakeGoogle(), registry: fakeRegistry() };
  assert.throws(() => laterSteps({ ...args, config: { ...TEST_CONFIG, release: undefined } }), /release\.version/);
  assert.throws(() => laterSteps({ ...args, config: { ...TEST_CONFIG, release: { version: "1" } } }), /starterContent/);
  assert.throws(() => laterSteps({ ...args, config: { ...TEST_CONFIG, senderEmail: "" } }), /senderEmail/);
  assert.equal(REGION, "northamerica-northeast1");
});
