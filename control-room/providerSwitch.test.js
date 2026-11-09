import { test } from "node:test";
import assert from "node:assert/strict";
import { providerSwitch, switchWaiting } from "./providerSwitch.js";
import { readFileSync } from "node:fs";
import { fakeRegistry, fakeProfileFiles } from "../setup/fakes.js";

const PROFILE = JSON.parse(readFileSync(new URL("../profile/examples/test-shop.json", import.meta.url), "utf8"));

const ENV = 'SHOP_OWNER_EMAIL="owner@example.com"\nSHOP_PAYMENT_PROVIDER="square"\nSHOP_PAYMENT_MODE="platform"\n';
const SQUARE = { provider: "square", accountId: "MERCHANT1", mode: "test", locationId: "LOC1" };

async function world({ deployFails = false } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", {
    shopId: "moth-press", region: "northamerica-northeast1",
    payments: { ...SQUARE, next: { provider: "stripe", accountId: "acct_new", mode: "test", chargesEnabled: true }, otherAccounts: ["stripe:acct_new"], switching: { to: "stripe", accountId: "acct_new", at: "2026-11-09T12:00:00.000Z" } },
  });
  await registry.saveProfile("moth-press", { ...PROFILE, payments: { provider: "square", mode: "platform" } });
  let env = ENV;
  const deployed = [];
  const deploy = {
    deployed: async () => { if (deployFails) throw new Error("deploys aren't connected on this server yet"); return { version: "1.2.3", region: "northamerica-northeast1" }; },
    functions: async (shopId, options) => { deployed.push(options.envFile); },
  };
  const logged = [];
  const switches = providerSwitch({
    registry, envFiles: { read: async () => env, write: async (_id, text) => { env = text; } }, profileFiles: fakeProfileFiles(), deploy,
    publish: async () => ({ apps: ["shop"] }), log: async (shopId, what, detail) => logged.push({ shopId, what, ...detail }),
    now: () => new Date("2026-11-09T13:00:00Z"), publishableKeys: { test: "pk_test_platform" },
  });
  return { registry, switches, deployed, logged, env: () => env };
}

test("a switch from Square to Stripe: the server names Stripe with Square kept for older orders, then the registry moves", async () => {
  const w = await world();
  assert.deepEqual((await w.switches.waiting()).map((s) => [s.shopId, s.from, s.to]), [["moth-press", "square", "stripe"]]);
  const done = await w.switches.finish("moth-press", { by: "admin@example.com" });
  assert.deepEqual([done.finished, done.server, done.pages], [true, true, ["shop"]]);
  assert.match(w.env(), /SHOP_PAYMENT_PROVIDER="stripe"/);
  assert.match(w.env(), /SHOP_PAYMENT_EARLIER="square"/);
  assert.equal(w.deployed.at(-1), w.env(), "the deployed file is the saved one");
  assert.deepEqual((await w.registry.getProfile("moth-press")).payments, { provider: "stripe", mode: "platform", stripe: { accountId: "acct_new", testPublishableKey: "pk_test_platform" } });
  const row = await w.registry.getShop("moth-press");
  assert.deepEqual([row.payments.provider, row.payments.accountId, row.payments.earlier[0].accountId, row.payments.earlier[0].until], ["stripe", "acct_new", "MERCHANT1", "2026-11-09T13:00:00.000Z"]);
  assert.equal(switchWaiting(row), null);
  assert.deepEqual(w.logged.map((e) => [e.what, e.from, e.to]), [["payments-switched", "square", "stripe"]]);
});

test("where deploys aren't connected, the switch waits with its reason, and nothing has moved", async () => {
  const w = await world({ deployFails: true });
  const tried = await w.switches.finish("moth-press", { by: "admin@example.com" });
  assert.deepEqual([tried.finished, tried.error], [false, "deploys aren't connected on this server yet"]);
  assert.equal(w.env(), ENV);
  const row = await w.registry.getShop("moth-press");
  assert.equal(row.payments.provider, "square");
  assert.equal(row.payments.switching.to, "stripe", "both accounts still take sales");
  assert.equal(switchWaiting(row).problem.message, "deploys aren't connected on this server yet");
  assert.deepEqual((await w.switches.finishAll({ by: "admin@example.com" })).shops.map((s) => s.finished), [false]);
});
