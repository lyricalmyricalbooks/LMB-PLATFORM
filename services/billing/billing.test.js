// Billing (code plan 2.4) against a pretend Stripe: plans and prices from the settings, a trial with no card, a card
// added later, cancel and keep, plan changes, and Stripe's events (signed, handled once) with their emails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling, fromSubscription } from "./billing.js";
import { readBillingConfig } from "./index.js";
import { planList, planPrice } from "./plans.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SECRET = "whsec_billing_test";
const NOW = 1_800_000_000_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };

function make({ env = {} } = {}) {
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const stores = fakeBillingStores();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings(env), ...stores, registry, auditLog, email, webhookSecrets: [SECRET], now: () => NOW,
  });
  const event = (type, object, id = `evt_${Math.random().toString(36).slice(2)}`) => {
    const rawBody = JSON.stringify({ id, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, NOW / 1000) }, rawBody });
  };
  return { stripe, stores, registry, auditLog, email, billing, event };
}

test("the plans are $29 shop, $19 stockroom and $39 both (CAD) a month, each from the settings", () => {
  const plans = planList(platformSettings({}));
  assert.deepEqual(plans.map((p) => [p.plan, p.amount, p.currency, p.priceText]), [["shop", 2900, "cad", "$29.00"], ["stockroom", 1900, "cad", "$19.00"], ["both", 3900, "cad", "$39.00"]]);
  assert.equal(planPrice("both", platformSettings({ PLAN_PRICE_BOTH: "4500" })).lookupKey, "colophon_both_cad_4500_monthly");
  assert.throws(() => planPrice("gold", platformSettings({})), /shop, stockroom or both/);
});

test("a trial starts with no card: 14 days, pauses if no card arrives, and the price is made once", async () => {
  const { billing, stripe, stores, email } = make();
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  assert.equal(row.status, "trialing");
  assert.equal(row.access, "open");
  assert.equal(row.hasCard, false);
  assert.equal(row.trialEnd, new Date(NOW + 14 * 86400_000).toISOString());
  const create = stripe.requests.find((r) => r.method === "POST" && r.path === "/v1/subscriptions");
  assert.equal(create.params.trial_period_days, "14");
  assert.equal(create.params["trial_settings[end_behavior][missing_payment_method]"], "pause");
  assert.equal(create.params.payment_method, undefined);
  assert.equal(create.headers["Idempotency-Key"], "subscription-moth-press-1");
  const [price] = [...stripe.world.prices.values()];
  assert.deepEqual([price.unit_amount, price.currency, price.interval, price.lookup_key], [3900, "cad", "month", "colophon_both_cad_3900_monthly"]);
  assert.equal(stores.customers.rows.get(ACCOUNT.accountId).customerId, create.params.customer);
  assert.equal(email.list().length, 0);

  // A second shop of the same account: same customer and price, but its trial is used, so it waits for a card.
  const second = await billing.startTrial({ account: ACCOUNT, shopId: "press-two", pressName: "Press Two", plan: "both" });
  assert.equal(second.status, "incomplete");
  assert.equal(second.access, "paused");
  assert.equal(stripe.world.customers.size, 1);
  assert.equal(stripe.world.prices.size, 1);
});

test("starting a trial twice gives the same plan back, and another account can't take the shop", async () => {
  const { billing, stripe } = make();
  const first = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", plan: "shop" });
  const again = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", plan: "shop" });
  assert.equal(again.subscriptionId, first.subscriptionId);
  assert.equal(stripe.world.subscriptions.size, 1);
  await assert.rejects(billing.startTrial({ account: { accountId: "other", email: "x@example.com" }, shopId: "moth-press", plan: "shop" }), /another account/);
});

test("a trial set to 0 days starts unpaid, waiting for a card", async () => {
  const { billing } = make({ env: { TRIAL_DAYS: "0" } });
  assert.equal((await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", plan: "shop" })).status, "incomplete");
});

test("the trial ending with no card pauses the shop and emails; adding a card opens it again", async () => {
  const { billing, stripe, event, email, registry } = make();
  await registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", plan: "both", status: "live" });
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  assert.equal((await registry.getShop("moth-press")).billing.access, "open");

  assert.equal((await event("customer.subscription.trial_will_end", stripe.subscription(row.subscriptionId))).status, 200);
  const warning = email.list().find((m) => m.kind === "trial-ending");
  assert.equal(warning.to, "owner@example.com");
  assert.equal(warning.data.hasCard, false);
  assert.equal(warning.data.link, "https://platform.example/account/billing?shop=moth-press");

  await event("customer.subscription.paused", stripe.endTrial(row.subscriptionId));
  assert.equal((await registry.getShop("moth-press")).billing.access, "paused");
  assert.ok(email.list().some((m) => m.kind === "card-needed"));

  const { url } = await billing.cardLink({ shopId: "moth-press", returnUrl: "https://platform.example/account/billing" });
  const sessionId = url.split("/").pop();
  const session = stripe.world.sessions.get(sessionId);
  assert.equal(session.mode, "setup");
  assert.equal(session.success_url, "https://platform.example/account/billing?card=added");
  await event("checkout.session.completed", stripe.completeSetup(sessionId));
  const after = await registry.getShop("moth-press");
  assert.equal(after.billing.status, "active");
  assert.equal(after.billing.access, "open");
  assert.equal(after.billing.hasCard, true);
  assert.equal([...stripe.world.customers.values()][0].defaultCard, "pm_card_visa");
});

test("a plan waiting for its first payment is paid when the card is added", async () => {
  const { billing, stripe, event, stores } = make({ env: { TRIAL_DAYS: "0" } });
  await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", plan: "shop" });
  const { url } = await billing.cardLink({ shopId: "moth-press", returnUrl: "https://platform.example/account" });
  await event("checkout.session.completed", stripe.completeSetup(url.split("/").pop()));
  assert.equal(stores.subscriptions.rows.get("moth-press").status, "active");
  assert.ok(stripe.requests.some((r) => /^\/v1\/invoices\/in_\w+\/pay$/.test(r.path)));
});

test("the card page only sends people back to the platform's own pages", async () => {
  const { billing } = make();
  await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", plan: "shop" });
  await assert.rejects(billing.cardLink({ shopId: "moth-press", returnUrl: "https://evil.example/" }), /on the platform/);
  await assert.rejects(billing.cardLink({ shopId: "moth-press", returnUrl: "https://platform.example.evil.example/" }), /on the platform/);
  await assert.rejects(billing.cardLink({ shopId: "nobody", returnUrl: "https://platform.example/" }), /no plan yet/);
});

test("cancel keeps the shop open to the end of the period, emails once, and can be undone", async () => {
  const { billing, email, registry, auditLog } = make();
  await registry.createShop("moth-press", { shopId: "moth-press", plan: "shop" });
  await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "shop" });
  const cancelled = await billing.cancel({ shopId: "moth-press" });
  assert.equal(cancelled.cancelAtPeriodEnd, true);
  assert.equal(cancelled.access, "open");
  await billing.cancel({ shopId: "moth-press" });
  const notes = email.list().filter((m) => m.kind === "subscription-cancelled");
  assert.equal(notes.length, 1);
  assert.match(notes[0].data.date, /2027/);
  assert.equal((await billing.keep({ shopId: "moth-press" })).cancelAtPeriodEnd, false);
  const logged = [...registry.events.get("moth-press").values()].map((e) => e.what);
  assert.deepEqual(logged, ["trial-started", "cancel-requested", "cancel-undone"]);
  assert.equal(auditLog.entries.get("moth-press").size, 3);
});

test("changing plan moves the subscription item, records the new plan for the shop maker and emails", async () => {
  const { billing, stripe, registry, email } = make();
  await registry.createShop("moth-press", { shopId: "moth-press", plan: "shop" });
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "shop" });
  const changed = await billing.changePlan({ shopId: "moth-press", plan: "both" });
  assert.equal(changed.changed, true);
  assert.equal(changed.plan, "both");
  assert.equal((await registry.getShop("moth-press")).plan, "both");
  const bothPrice = [...stripe.world.prices.values()].find((p) => p.lookup_key === "colophon_both_cad_3900_monthly");
  assert.equal(stripe.world.subscriptions.get(row.subscriptionId).price, bothPrice.id);
  assert.equal(email.list().filter((m) => m.kind === "plan-changed").length, 1);
  assert.equal((await billing.changePlan({ shopId: "moth-press", plan: "both" })).changed, false);
});

test("a declined payment emails the press with the amount and the next try; the shop stays open", async () => {
  const { billing, event, email, stores } = make();
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await event("invoice.payment_failed", { id: "in_1", currency: "cad", amount_due: 3900, attempt_count: 1, next_payment_attempt: NOW / 1000 + 3 * 86400, parent: { subscription_details: { subscription: row.subscriptionId } } });
  const failed = email.list().find((m) => m.kind === "payment-failed");
  assert.equal(failed.data.price, "$39.00");
  assert.match(failed.data.nextTry, /2027/);
  assert.equal(stores.subscriptions.rows.get("moth-press").access, "open");
});

test("Stripe's events: a bad signature is refused, each event is handled once, other modes and strangers are ignored", async () => {
  const { billing, stripe, event, email } = make();
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  const deleted = { ...stripe.subscription(row.subscriptionId), status: "canceled" };
  const rawBody = JSON.stringify({ id: "evt_1", type: "customer.subscription.deleted", livemode: false, data: { object: deleted } });
  assert.equal((await billing.handleEvent({ headers: { "stripe-signature": signatureHeader("whsec_wrong", rawBody, NOW / 1000) }, rawBody })).status, 400);
  assert.equal((await event("customer.subscription.deleted", deleted, "evt_1")).status, 200);
  assert.equal((await event("customer.subscription.deleted", deleted, "evt_1")).body.duplicate, true);
  assert.equal(email.list().filter((m) => m.kind === "subscription-ended").length, 1);

  const live = JSON.stringify({ id: "evt_live", type: "customer.subscription.deleted", livemode: true, data: { object: deleted } });
  assert.equal((await billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, live, NOW / 1000) }, rawBody: live })).body.ignored, "other mode");
  const stranger = await event("customer.subscription.updated", { id: "sub_other", status: "active", metadata: { lmb_shop_id: "moth-press" } });
  assert.equal(stranger.body.handled, "not ours");
});

test("a failure answers 500 so Stripe sends the event again, and nothing is marked handled", async () => {
  const { billing, stripe, stores, event } = make();
  const row = await billing.startTrial({ account: ACCOUNT, shopId: "moth-press", plan: "both" });
  const { url } = await billing.cardLink({ shopId: "moth-press", returnUrl: "https://platform.example/account" });
  const session = { ...stripe.completeSetup(url.split("/").pop()), setup_intent: "seti_missing" };
  const answer = await event("checkout.session.completed", session, "evt_fail");
  assert.equal(answer.status, 500);
  assert.equal(stores.events.rows.has("evt_fail"), false);
  assert.equal(stores.subscriptions.rows.get("moth-press").subscriptionId, row.subscriptionId);
});

test("a subscription's period is read from either place Stripe keeps it", () => {
  assert.equal(fromSubscription({ id: "sub_1", status: "active", current_period_end: 1_800_000_000, items: { data: [] } }).currentPeriodEnd, "2027-01-15T08:00:00.000Z");
  assert.equal(fromSubscription({ id: "sub_1", status: "active", items: { data: [{ id: "si", current_period_end: 1_800_000_000 }] } }).currentPeriodEnd, "2027-01-15T08:00:00.000Z");
  assert.equal(fromSubscription({ id: "sub_1", status: "weird" }).access, "paused");
});

test("billing runs in test mode unless told otherwise, and refuses a mode it doesn't know", () => {
  assert.deepEqual(readBillingConfig({}), { mode: "test", webhookSecrets: [], tax: false });
  assert.deepEqual(readBillingConfig({ BILLING_MODE: "live", STRIPE_BILLING_WEBHOOK_SECRET: "a, b" }), { mode: "live", webhookSecrets: ["a", "b"], tax: false });
  assert.throws(() => readBillingConfig({ BILLING_MODE: "prod" }), /BILLING_MODE/);
});
