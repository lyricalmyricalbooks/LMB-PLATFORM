// Two ways to pay (code plan 6.19) against a pretend Stripe: switching to pay as you sell and back, the trial, a plan
// paused for want of a card, the founding offer, the stockroom alone refused, and the words the Plan & billing page shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling, dateText } from "./billing.js";
import { createPaymentWay, payAsYouSellTerms, paymentWayRoutes, paymentWayView } from "./paymentWay.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { fakeFeeLedgerStore } from "../payments/feeLedgerFakes.js";
import { liveSettings, platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SECRET = "whsec_billing_test";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86400_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };
const SHOP = "moth-press";

async function make({ plan = "shop", live = { payAsYouSell: { basisPoints: 200 }, foundingOffer: { percentOff: 25 } }, founding = false } = {}) {
  let clock = NOW;
  const stripe = fakeBillingStripe({ clock: () => Math.floor(clock / 1000) });
  const stores = fakeBillingStores();
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, plan, ownerEmail: ACCOUNT.email, ...(founding ? { founding: true } : {}) });
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const feeLedger = fakeFeeLedgerStore();
  const settings = platformSettings({});
  const api = createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } });
  const deps = { stripe: api, mode: "test", settings, ...stores, registry, auditLog, email, now: () => clock };
  const billing = createBilling({ ...deps, webhookSecrets: [SECRET] });
  const ways = createPaymentWay({ ...deps, billing, feeLedger, live: async () => live });
  const event = (type, object) => {
    const rawBody = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, Math.floor(clock / 1000)) }, rawBody });
  };
  await billing.startTrial({ account: ACCOUNT, shopId: SHOP, pressName: "Moth Press", plan });
  const subId = () => stores.subscriptions.rows.get(SHOP).subscriptionId;
  return { stripe, stores, registry, email, billing, ways, event, feeLedger, settings, subId, tick: (ms) => { clock += ms; } };
}

const charged = (w) => w.stripe.requests.filter((r) => /\/v1\/invoices\/.+\/pay$/.test(r.path));

test("the terms: 2% and the plan's price as the cap; the founding offer takes 25% off both; the stockroom alone is refused", async () => {
  const settings = platformSettings({});
  const live = await liveSettings({ env: {} });
  assert.deepEqual(live.payAsYouSell, { basisPoints: 200 });
  assert.deepEqual(payAsYouSellTerms({ plan: "shop", settings, live }), { basisPoints: 200, capMinor: 2900, currency: "CAD" });
  assert.deepEqual(payAsYouSellTerms({ plan: "both", settings, live }), { basisPoints: 200, capMinor: 3900, currency: "CAD" });
  assert.deepEqual(payAsYouSellTerms({ plan: "shop", settings, live, founding: true }), { basisPoints: 150, capMinor: 2175, currency: "CAD" });
  assert.throws(() => payAsYouSellTerms({ plan: "stockroom", settings, live }), /stockroom on its own is paid monthly/);
  assert.throws(() => payAsYouSellTerms({ plan: "shop", settings, live: { payAsYouSell: { basisPoints: 0 } } }), /isn't open to new choices/);
});

test("stockroom-only is refused in plain words and nothing changes", async () => {
  const w = await make({ plan: "stockroom" });
  await assert.rejects(w.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" }), (err) => err.status === 400 && /stockroom on its own/.test(err.message));
  assert.equal(w.stores.subscriptions.rows.get(SHOP).cancelAtPeriodEnd, false);
  const view = paymentWayView(await w.ways.status(SHOP), w.settings);
  assert.deepEqual([view.lines, view.button, view.note], [["You pay $19 a month."], null, "The stockroom on its own is paid monthly."]);
});

test("during the trial the switch is at once, the trial takes no fee, and when it ends nothing is charged and no card is asked", async () => {
  const w = await make();
  const before = paymentWayView(await w.ways.status(SHOP), w.settings);
  assert.deepEqual(before.lines, ["You pay $29 a month.", "Or pay 2% of your website sales, never more than $29 a month. Switching starts now."]);
  assert.deepEqual(before.button, { label: "Switch to pay as you sell", to: "payAsYouSell" });

  const after = await w.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" });
  assert.equal(after.changed, true);
  assert.equal(after.paymentWay, "payAsYouSell");
  const trialEnd = new Date(NOW + 14 * DAY).toISOString();
  assert.deepEqual(w.registry.shops.get(SHOP).payAsYouSell, { basisPoints: 200, capMinor: 2900, currency: "CAD", from: trialEnd, until: null });
  assert.equal(w.stripe.world.subscriptions.get(w.subId()).cancel_at_period_end, true);
  const view = paymentWayView(after, w.settings);
  assert.deepEqual(view.lines, ["You pay 2% of your website sales, never more than $29 a month.", `Your free trial takes no fee. Fees start on ${dateText(trialEnd)}.`]);
  assert.deepEqual([view.button.label, view.note], ["Switch to monthly", "No card is needed to pay as you sell."]);
  // Asking again changes nothing.
  assert.equal((await w.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" })).changed, false);

  // The trial ends: Stripe ends the subscription. The shop stays open, nothing is charged, and no ending or card email.
  w.tick(14 * DAY);
  const sub = w.stripe.world.subscriptions.get(w.subId());
  sub.status = "canceled";
  assert.equal((await w.event("customer.subscription.deleted", w.stripe.subscription(sub.id))).status, 200);
  assert.equal(w.stores.subscriptions.rows.get(SHOP).access, "open");
  assert.equal(w.registry.shops.get(SHOP).billing.access, "open");
  assert.equal((await w.billing.status(SHOP)).paymentWay, "payAsYouSell");
  assert.deepEqual(w.email.list(), []);
  assert.deepEqual(charged(w), []);
});

test("from monthly mid-month: pay as you sell starts when the paid month ends, and can be undone until then", async () => {
  const w = await make();
  // Past the trial, with a card: an active monthly plan.
  w.tick(20 * DAY);
  const sub = w.stripe.world.subscriptions.get(w.subId());
  Object.assign(sub, { status: "active", default_payment_method: "pm_card_visa", periodEnd: Math.floor((NOW + 44 * DAY) / 1000) });
  await w.event("customer.subscription.updated", w.stripe.subscription(sub.id));

  const switched = await w.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" });
  assert.equal(switched.paymentWay, "monthly", "still monthly until the paid month ends");
  assert.equal(switched.paymentWayChosen, "payAsYouSell");
  assert.equal(w.registry.shops.get(SHOP).payAsYouSell.from, new Date(NOW + 44 * DAY).toISOString());
  assert.deepEqual(paymentWayView(switched, w.settings).lines, [`You pay $29 a month until ${dateText("2026-12-11T12:00:00.000Z")}.`, "From then you pay 2% of your website sales, never more than $29 a month."]);

  // Back to monthly before it starts: the subscription simply goes on.
  const back = await w.ways.switchPaymentWay({ shopId: SHOP, to: "monthly" });
  assert.equal(back.paymentWay, "monthly");
  assert.equal(w.stripe.world.subscriptions.get(sub.id).cancel_at_period_end, false);
  assert.equal(w.registry.shops.get(SHOP).payAsYouSell, null);
  assert.equal(w.stripe.world.subscriptions.size, 1);
});

test("from pay as you sell to monthly: a new plan starts with the next billing month, free until then, card asked then", async () => {
  const w = await make();
  await w.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" });
  w.tick(14 * DAY);
  const old = w.stripe.world.subscriptions.get(w.subId());
  old.status = "canceled";
  await w.event("customer.subscription.deleted", w.stripe.subscription(old.id));
  // Fees this month: $4.20 so far.
  const terms = w.registry.shops.get(SHOP).payAsYouSell;
  await w.feeLedger.update(SHOP, terms.from.slice(0, 10), () => ({ shopId: SHOP, capMinor: 2900, entries: { a: { key: "a", feeMinor: 420, state: "taken", refunds: {} } } }));
  w.tick(3 * DAY);
  const status = await w.ways.status(SHOP);
  assert.deepEqual(paymentWayView(status, w.settings).lines, ["You pay 2% of your website sales, never more than $29 a month.", `This month so far: $4.20. A new month starts on ${dateText("2026-12-11T12:00:00.000Z")}.`]);

  const switched = await w.ways.switchPaymentWay({ shopId: SHOP, to: "monthly" });
  assert.equal(switched.paymentWay, "payAsYouSell", "until this billing month ends");
  const next = w.stripe.requests.filter((r) => r.method === "POST" && r.path === "/v1/subscriptions").at(-1);
  assert.equal(next.params.trial_end, String(Date.parse("2026-12-11T12:00:00.000Z") / 1000));
  assert.equal(next.params["trial_settings[end_behavior][missing_payment_method]"], "pause");
  assert.equal(next.headers["Idempotency-Key"], "subscription-moth-press-2");
  assert.equal(w.registry.shops.get(SHOP).payAsYouSell.until, "2026-12-11T12:00:00.000Z");
  assert.deepEqual(paymentWayView(switched, w.settings).lines, [`You pay 2% of your website sales, never more than $29 a month until ${dateText("2026-12-11T12:00:00.000Z")}.`, "From then you pay $29 a month. We'll ask for a card then."]);
  assert.equal((await w.ways.switchPaymentWay({ shopId: SHOP, to: "monthly" })).changed, false, "asking twice makes one plan");
  assert.equal(w.stripe.world.subscriptions.size, 2);
  assert.deepEqual(charged(w), []);

  // The month ends: monthly from now on.
  w.tick(30 * DAY);
  assert.equal((await w.ways.status(SHOP)).paymentWay, "monthly");
});

test("a plan paused for want of a card ends, and the shop opens on pay as you sell at once", async () => {
  const w = await make();
  w.tick(14 * DAY);
  await w.event("customer.subscription.paused", w.stripe.endTrial(w.subId()));
  assert.equal(w.stores.subscriptions.rows.get(SHOP).access, "paused");
  const switched = await w.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" });
  assert.equal(switched.paymentWay, "payAsYouSell");
  assert.equal(switched.access, "open");
  assert.equal(w.stripe.world.subscriptions.get(w.subId()).status, "canceled");
  assert.equal(w.registry.shops.get(SHOP).payAsYouSell.from, new Date(NOW + 14 * DAY).toISOString());
  assert.deepEqual(charged(w), []);
});

test("a founding press gets 25% off the share and the cap; a new choice is refused when the option is off", async () => {
  const founding = await make({ founding: true });
  const switched = await founding.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" });
  assert.deepEqual([switched.payAsYouSell.basisPoints, switched.payAsYouSell.capMinor], [150, 2175]);
  assert.match(paymentWayView(switched, founding.settings).lines[0], /1\.5% of your website sales, never more than \$21\.75 a month/);

  const off = await make({ live: { payAsYouSell: { basisPoints: 0 }, foundingOffer: { percentOff: 25 } } });
  await assert.rejects(off.ways.switchPaymentWay({ shopId: SHOP, to: "payAsYouSell" }), /isn't open to new choices/);
  assert.equal(paymentWayView(await off.ways.status(SHOP), off.settings).button, null);
});

test("the page's two calls check the owner and answer the section's words", async () => {
  const w = await make();
  const asked = [];
  const routes = paymentWayRoutes({ paymentWay: w.ways, settings: w.settings, ownerOnly: async (claims, shopId) => { asked.push([claims.email, shopId]); if (claims.email !== ACCOUNT.email) throw Object.assign(new Error("Only the shop's owner can do that."), { status: 403 }); } });
  const read = await routes["POST /api/billing/payment-way"]({ email: ACCOUNT.email }, { body: { shopId: SHOP } });
  assert.equal(read.view.id, "payment-way");
  const switched = await routes["POST /api/billing/payment-way/switch"]({ email: ACCOUNT.email }, { body: { shopId: SHOP, to: "payAsYouSell" } });
  assert.equal(switched.changed, true);
  assert.equal(switched.view.button.label, "Switch to monthly");
  await assert.rejects(routes["POST /api/billing/payment-way/switch"]({ email: "someone@example.com" }, { body: { shopId: SHOP, to: "monthly" } }), /owner/);
  assert.equal(asked.length, 3);
  await assert.rejects(w.ways.switchPaymentWay({ shopId: SHOP, to: "yearly" }), /monthly or pay as you sell/);
});
