// Failed plan payments, recovered (code plan 19.9), on the billing side: the card-expiry warning goes once per card and
// expiry, only for a plan still running; a card the card company renews (same card, new date) is followed and warned
// about again when its new date comes; when a payment problem began is kept for the control room; and the owner's own
// step in Stripe is written down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBilling } from "./billing.js";
import { CARD_WARNING_DAYS, cardEnds, cardWarningDue, cardWarningKey } from "./cardExpiry.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings } from "../settings.js";
import { TEMPLATES } from "../email/templates.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SECRET = "whsec_card_expiry_test";
const DAY = 86400_000;
const START = Date.parse("2027-01-10T12:00:00Z");
const SHOP = "moth-press";

async function make({ exp = { month: 2, year: 2027 } } = {}) {
  let clock = START;
  const stripe = fakeBillingStripe({ clock: () => Math.floor(clock / 1000) });
  const stores = fakeBillingStores();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...stores, registry, auditLog, email, webhookSecrets: [SECRET], now: () => clock,
  });
  const event = (type, object, id = `evt_${Math.random().toString(36).slice(2)}`) => {
    const rawBody = JSON.stringify({ id, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, clock / 1000) }, rawBody });
  };
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", plan: "both", status: "live" });
  const row = await billing.startTrial({ account: { accountId: "acct-1", email: "owner@example.com" }, shopId: SHOP, pressName: "Moth Press", plan: "both" });
  stripe.world.paymentMethods.set("pm_card_visa", { id: "pm_card_visa", card: { brand: "visa", last4: "4242", exp_month: exp.month, exp_year: exp.year }, billing_details: { address: { country: "CA" } } });
  const { url } = await billing.cardLink({ shopId: SHOP, returnUrl: "https://platform.example/account/billing" });
  await event("checkout.session.completed", stripe.completeSetup(url.split("/").pop()));
  await event("customer.subscription.updated", stripe.payMonth(row.subscriptionId));
  const warnings = () => email.list().filter((m) => m.kind === "card-expiring");
  return { billing, stripe, stores, registry, email, event, row, warnings, tick: (days) => { clock += days * DAY; }, now: () => clock };
}

test("the warning goes once per card, a month before it runs out, and is logged", async () => {
  const w = await make();
  assert.equal(cardEnds({ expMonth: 2, expYear: 2027 }), "2027-02-28T23:59:59.999Z");
  assert.deepEqual(await w.billing.cardExpiryReminders(), [], "10 January: more than a month to go");
  w.tick(20); // 30 January
  assert.deepEqual(await w.billing.cardExpiryReminders(), [SHOP]);
  assert.deepEqual(await w.billing.cardExpiryReminders(), [], "never twice");
  w.tick(10);
  assert.deepEqual(await w.billing.cardExpiryReminders(), []);
  assert.equal(w.warnings().length, 1);
  const [sent] = w.warnings();
  assert.equal(sent.to, "owner@example.com");
  assert.equal(sent.idempotencyKey.endsWith(`/card-expiring/pm_card_visa@2027-02`), true);
  assert.equal(sent.data.link, "https://platform.example/account/billing?shop=moth-press");
  assert.match(TEMPLATES["card-expiring"](sent.data, { settings: platformSettings({}), pressName: "Moth Press" }).text, /end of February 2027/);
  assert.ok([...w.registry.events.get(SHOP).values()].some((e) => e.what === "card-expiring-sent"), "logged in the registry");
  assert.equal((await w.stores.subscriptions.get(SHOP)).cardWarned, "pm_card_visa@2027-02");
});

test("not for a plan that has ended, is set to end, or is paused", async () => {
  const ended = await make();
  ended.stripe.world.subscriptions.get(ended.row.subscriptionId).status = "canceled";
  await ended.event("customer.subscription.deleted", ended.stripe.subscription(ended.row.subscriptionId));
  ended.tick(20);
  assert.deepEqual(await ended.billing.cardExpiryReminders(), []);
  assert.equal(ended.warnings().length, 0);

  const leaving = await make();
  await leaving.billing.cancel({ shopId: SHOP });
  leaving.tick(20);
  assert.deepEqual(await leaving.billing.cardExpiryReminders(), []);

  const due = { status: "active", hasCard: true, card: { id: "pm_1", expMonth: 2, expYear: 2027 } };
  const at = Date.parse("2027-02-10T00:00:00Z");
  assert.ok(cardWarningDue(due, at));
  for (const status of ["paused", "unpaid", "incomplete", "canceled", "incomplete_expired"]) assert.equal(cardWarningDue({ ...due, status }, at), null, status);
  assert.equal(cardWarningDue(due, Date.parse("2027-03-01T00:00:00Z")), null, "a card already run out gets no warning");
  assert.equal(cardWarningDue({ ...due, card: { id: "pm_1", expMonth: 2, expYear: 2027 } }, at - CARD_WARNING_DAYS * DAY), null);
});

test("a card the card company renews keeps its id, gets its new date, and is warned about again when that comes", async () => {
  const w = await make();
  w.tick(20);
  assert.deepEqual(await w.billing.cardExpiryReminders(), [SHOP]);
  const answer = await w.event("payment_method.automatically_updated", { id: "pm_card_visa", object: "payment_method", card: { brand: "visa", last4: "4242", exp_month: 2, exp_year: 2030 } });
  assert.equal(answer.body.handled, "card updated");
  assert.deepEqual((await w.billing.status(SHOP)).card, { brand: "visa", last4: "4242", expMonth: 2, expYear: 2030, words: "Visa ending 4242" });
  assert.deepEqual(await w.billing.cardExpiryReminders(), [], "the new date is years away");
  assert.equal(cardWarningKey({ id: "pm_card_visa", expMonth: 2, expYear: 2030 }), "pm_card_visa@2030-02");
  assert.equal((await w.event("payment_method.automatically_updated", { id: "pm_someone_else", card: {} })).body.handled, "not ours");
});

test("when a payment problem began is kept while it lasts, and cleared when it's fixed", async () => {
  const w = await make();
  const sub = w.stripe.world.subscriptions.get(w.row.subscriptionId);
  sub.status = "past_due";
  await w.event("customer.subscription.updated", w.stripe.subscription(w.row.subscriptionId));
  const began = new Date(w.now()).toISOString();
  assert.equal((await w.registry.getShop(SHOP)).billing.troubleSince, began);
  w.tick(3);
  sub.status = "unpaid";
  await w.event("customer.subscription.updated", w.stripe.subscription(w.row.subscriptionId));
  assert.equal((await w.registry.getShop(SHOP)).billing.troubleSince, began, "still the same trouble");
  sub.status = "active";
  await w.event("customer.subscription.updated", w.stripe.subscription(w.row.subscriptionId));
  assert.equal((await w.registry.getShop(SHOP)).billing.troubleSince, null);
});

test("the owner's own step in Stripe is written down: Smart Retries and the card updater", () => {
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  assert.match(readme, /Smart Retries/);
  assert.match(readme, /card account updater/i);
});
