// Counting Stripe events per shop (code plan 19.12): each event for a shop is counted, and each one the service couldn't
// pass on is counted as failed too, for the control room's record and health (control-room/delivery.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaymentService } from "./service.js";
import { readServiceConfig } from "./config.js";
import { createStripeApi } from "./stripeApi.js";
import { fakeAccounts, fakeDeliver, fakeStripeFetch } from "./fakes.js";
import { signatureHeader } from "./stripeSignature.js";
import { fakeDeliveryStats } from "../../control-room/visibilityFakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SHOP = "moth-press";
const NOW = Date.parse("2026-11-02T12:00:00Z");
const WHSEC = "whsec_live_platform_test_only";
const ROW = { shopId: SHOP, pressName: "Moth Press", status: "live", plan: "shop", payments: { provider: "stripe", accountId: "acct_moth", mode: "live", chargesEnabled: true } };

async function paymentService(deliveryStats, deliverStatus) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, ROW);
  const config = readServiceConfig({ STRIPE_PLATFORM_LIVE_KEY: "sk_live_platform_fake", STRIPE_PLATFORM_TEST_KEY: "sk_test_platform_fake", STRIPE_CONNECT_WEBHOOK_SECRET_LIVE: WHSEC, STRIPE_CONNECT_WEBHOOK_SECRET_TEST: "whsec_test_platform_test_only" });
  const { deliver } = fakeDeliver(deliverStatus);
  return createPaymentService({ stripe: createStripeApi({ fetch: fakeStripeFetch().fetch, keys: config.keys }), registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(), deliver, config, deliveryStats, now: () => NOW });
}

const event = (id, account = "acct_moth") => {
  const raw = JSON.stringify({ id, livemode: true, account, type: "checkout.session.completed", data: { object: {} } });
  return [{ "stripe-signature": signatureHeader(WHSEC, raw, Math.floor(NOW / 1000)) }, raw];
};

const quietly = async (fn) => {
  const { error, warn } = console;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { error, warn });
  }
};

test("each Stripe event for a shop is counted, and each one it couldn't pass on is counted as failed", async () => {
  const stats = fakeDeliveryStats();
  const taking = await paymentService(stats, 200);
  assert.equal((await taking.stripeEvent(...event("evt_1"))).status, 200);
  assert.equal((await taking.stripeEvent(...event("evt_2"))).status, 200);
  const refusing = await paymentService(stats, 500);
  assert.equal((await quietly(() => refusing.stripeEvent(...event("evt_3")))).status, 502);
  // An event for no shop counts for nobody.
  await quietly(() => taking.stripeEvent(...event("evt_4", "acct_nobody")));
  const since = new Date(NOW - 7 * 86_400_000).toISOString();
  assert.equal(await stats.count(SHOP, "payment-event", since), 3);
  assert.equal(await stats.count(SHOP, "payment-event-failed", since), 1);
  assert.equal(await stats.count("acct_nobody", "payment-event", since), 0);
});

test("without the counter, or with one that fails, events go through as before", async () => {
  assert.equal((await (await paymentService(undefined, 200)).stripeEvent(...event("evt_5"))).status, 200);
  const broken = { add: async () => { throw new Error("no answer"); } };
  assert.equal((await quietly(async () => (await paymentService(broken, 200)).stripeEvent(...event("evt_6")))).status, 200);
});
