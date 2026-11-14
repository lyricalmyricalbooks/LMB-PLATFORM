// The shop knows its plan (code plan 6.6) and pausing (6.7): every billing change writes the shop's admin-only
// platform/plan and public platform/status, and the stockroom's copy; a paused plan says so, and a card opens it again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { fakeStockroomData } from "./closingFakes.js";
import { PLAN_DOC, STATUS_DOC, headsUpOf, planDocument, shopPlanCopies } from "./shopPlan.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { signatureHeader } from "../payments/stripeSignature.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeShopData } from "../../accounts/fakes.js";

const SECRET = "whsec_billing_test";
const NOW = 1_800_000_000_000;
const DAY = 86400_000;
const ACCOUNT = { accountId: "acct-owner-1", email: "owner@example.com", name: "Ada" };
const LINK = "https://platform.example/account/billing?shop=moth-press";

function make({ databaseReady = () => true, stockroomReady = () => true } = {}) {
  let clock = NOW;
  const stripe = fakeBillingStripe({ clock: () => clock / 1000 });
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog({ isReady: databaseReady });
  const shopData = fakeShopData();
  const stockroomData = fakeStockroomData({ isReady: stockroomReady });
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...fakeBillingStores(), registry, auditLog, email: fakePlatformEmail(),
    shopPlan: shopPlanCopies({ shopData, stockroomData, registry }), webhookSecrets: [SECRET], now: () => clock,
  });
  const event = (type, object) => {
    const rawBody = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(SECRET, rawBody, clock / 1000) }, rawBody });
  };
  const plan = () => shopData.docs.get(`moth-press ${PLAN_DOC}`);
  const status = () => shopData.docs.get(`moth-press ${STATUS_DOC}`);
  return { stripe, registry, shopData, stockroomData, billing, event, plan, status, tick: (days) => { clock += days * DAY; } };
}

test("every billing change writes the shop's plan document: trial, card, cancel, keep, plan change and events", async () => {
  const t = make();
  await t.registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", plan: "shop", status: "live" });
  const writes = [];
  const set = t.shopData.set;
  t.shopData.set = async (shopId, path, data) => { if (path === PLAN_DOC) writes.push(data.state); return set(shopId, path, data); };

  const row = await t.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "shop" });
  assert.deepEqual(t.plan(), {
    plan: "shop", state: "trial", access: "open", trialEnd: new Date(NOW + 14 * DAY).toISOString(), nextPaymentAt: null,
    hasCard: false, cancelAtPeriodEnd: false, endsAt: null, paymentWay: "monthly", link: LINK, hub: "https://platform.example/api/shop-billing/", shopId: "moth-press", founding: false, closing: null, headsUp: null, changing: null,
    updatedAt: new Date(NOW).toISOString(),
  });
  assert.deepEqual(t.status(), { access: "open", updatedAt: new Date(NOW).toISOString() });

  const { url } = await t.billing.cardLink({ shopId: "moth-press", returnUrl: "https://platform.example/account/billing" });
  await t.event("checkout.session.completed", t.stripe.completeSetup(url.split("/").pop()));
  assert.equal(t.plan().hasCard, true);
  // With a card, the trial's end is the first payment.
  assert.equal(t.plan().nextPaymentAt, t.plan().trialEnd);

  await t.billing.cancel({ shopId: "moth-press" });
  assert.equal(t.plan().cancelAtPeriodEnd, true);
  assert.equal(t.plan().endsAt, t.plan().trialEnd);
  assert.equal(t.plan().nextPaymentAt, null);
  await t.billing.keep({ shopId: "moth-press" });
  assert.equal(t.plan().cancelAtPeriodEnd, false);
  await t.billing.changePlan({ shopId: "moth-press", plan: "both" });
  assert.equal(t.plan().plan, "both");
  await t.event("customer.subscription.updated", { ...t.stripe.subscription(row.subscriptionId), status: "past_due" });
  assert.equal(t.plan().state, "payment-problem");
  assert.equal(t.status().access, "open");
  // One copy per saved change (at least one per step above), the trial throughout until the payment failed.
  assert.ok(writes.length >= 6);
  assert.deepEqual([...new Set(writes.slice(0, -1))], ["trial"]);
  assert.equal(writes.at(-1), "payment-problem");
});

test("a paused plan pauses the shop's copies, the stockroom's too, and a card opens them again at once", async () => {
  const t = make();
  await t.registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", plan: "both", status: "live" });
  const row = await t.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  t.tick(14);
  await t.event("customer.subscription.paused", t.stripe.endTrial(row.subscriptionId));
  assert.equal(t.plan().state, "paused");
  assert.equal(t.status().access, "paused");
  assert.equal((await t.stockroomData.get("moth-press", PLAN_DOC)).access, "paused");

  const { url } = await t.billing.cardLink({ shopId: "moth-press", returnUrl: "https://platform.example/account/billing" });
  await t.event("checkout.session.completed", t.stripe.completeSetup(url.split("/").pop()));
  assert.equal(t.status().access, "open");
  assert.equal(t.plan().state, "active");
  assert.equal((await t.stockroomData.get("moth-press", PLAN_DOC)).access, "open");
});

test("no copy is written before the shop's database exists; the shop maker writes it later with publishPlan", async () => {
  let ready = false;
  const t = make({ databaseReady: () => ready });
  await t.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "shop" });
  assert.equal(t.plan(), undefined);
  ready = true;
  const doc = await t.billing.publishPlan("moth-press");
  assert.equal(doc.state, "trial");
  assert.equal(t.plan().state, "trial");
  assert.equal(await t.billing.publishPlan("nobody"), null);
});

test("a plan without the stockroom, or a stockroom not made yet, gets no stockroom copy", async () => {
  const t = make({ stockroomReady: () => false });
  await t.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  assert.equal(t.stockroomData.docs.size, 0);
  const u = make();
  await u.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "shop" });
  assert.equal(u.stockroomData.docs.size, 0);
  assert.equal(u.plan().plan, "shop");
});

test("the closing sweep's stage wins over Stripe's: a closed shop stays closed, with its dates", () => {
  const row = { plan: "shop", status: "paused", access: "paused", hasCard: false };
  const closing = { stage: "closed", closedAt: "2027-01-01T00:00:00.000Z", downloadUntil: "2027-04-01T00:00:00.000Z", deleteAfter: "2027-04-01T00:00:00.000Z", warned30At: null, warned7At: null };
  const doc = planDocument(row, { link: LINK, at: "x", closing });
  assert.equal(doc.access, "closed");
  assert.equal(doc.state, "closed");
  assert.deepEqual(doc.closing, { stage: "closed", closedAt: closing.closedAt, downloadUntil: closing.downloadUntil, deleteAfter: closing.deleteAfter });
  assert.equal(planDocument(row, { link: LINK, at: "x", closing: { stage: "paused", pausedAt: "y" } }).closing, null);
  // An unknown access is treated as paused, never as open.
  assert.equal(planDocument({ status: "weird" }, { link: LINK, at: "x" }).access, "paused");
});

test("a shop paying as it sells is open and active, with no trial, nothing due ahead and no end date", () => {
  const at = "2027-02-01T00:00:00.000Z";
  const row = { plan: "shop", status: "canceled", access: "open", hasCard: false, cancelAtPeriodEnd: true, trialEnd: "2027-01-10T00:00:00.000Z", paymentWay: "payAsYouSell" };
  const doc = planDocument(row, { link: LINK, at });
  assert.equal(doc.paymentWay, "payAsYouSell");
  assert.equal(doc.state, "active");
  assert.equal(doc.access, "open");
  assert.equal(doc.trialEnd, null);
  assert.equal(doc.nextPaymentAt, null);
  assert.equal(doc.endsAt, null);
  // A switch that starts later still shows monthly until then.
  assert.equal(planDocument({ ...row, status: "active", paymentWayFrom: "2027-03-01T00:00:00.000Z" }, { link: LINK, at }).paymentWay, "monthly");
  // Stripe's cancel is the switch; the press's own cancel ends the terms, and that is what the admin shows.
  assert.equal(doc.cancelAtPeriodEnd, false);
  const leaving = planDocument({ ...row, payAsYouSell: { from: "2027-01-10T00:00:00.000Z", until: "2027-02-10T00:00:00.000Z" } }, { link: LINK, at });
  assert.deepEqual([leaving.cancelAtPeriodEnd, leaving.endsAt, leaving.access], [true, "2027-02-10T00:00:00.000Z", "open"]);
});

// Adding or dropping an app (code plan 6.11): the registry's plan says what is open; a closed app's copy says closed.
test("dropping the website in the trial closes the website's copies at once; the stockroom carries on", async () => {
  const t = make();
  await t.registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", plan: "both", status: "live" });
  await t.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await t.billing.changePlan({ shopId: "moth-press", plan: "stockroom" });
  assert.equal((await t.registry.getShop("moth-press")).plan, "stockroom");
  assert.equal(t.status().access, "closed", "the website refuses new orders");
  assert.equal(t.plan().closing.stage, "closed");
  assert.ok(t.plan().closing.downloadUntil, "with its download date");
  const stockroom = await t.stockroomData.get("moth-press", PLAN_DOC);
  assert.equal(stockroom.access, "open");
  assert.equal(stockroom.plan, "stockroom");
});

test("dropping the stockroom in the trial opens it read-only; the website carries on", async () => {
  const t = make();
  await t.registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", plan: "both", status: "live" });
  await t.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await t.billing.changePlan({ shopId: "moth-press", plan: "shop" });
  assert.equal(t.status().access, "open");
  assert.equal(t.plan().closing, null);
  const stockroom = await t.stockroomData.get("moth-press", PLAN_DOC);
  assert.equal(stockroom.access, "closed");
  assert.equal(stockroom.closing.stage, "closed");
});

test("an app a plan dropped keeps getting the plan until the month already paid for ends", async () => {
  const shopData = fakeShopData();
  const stockroomData = fakeStockroomData();
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", plan: "both", closedApps: {} });
  const copies = shopPlanCopies({ shopData, stockroomData, registry });
  // Billing's row already says "shop" (the new price next month); the registry keeps both open until then.
  await copies.write("moth-press", { plan: "shop", status: "past_due", access: "open" }, { link: LINK, at: new Date(NOW).toISOString() });
  assert.equal((await stockroomData.get("moth-press", PLAN_DOC)).state, "payment-problem", "the stockroom still hears about a payment problem");
});

test("the admins hear about an app being added until it is built, and about an app closing at the end of the month", async () => {
  const shopData = fakeShopData();
  const stockroomData = fakeStockroomData();
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", plan: "both", builtPlan: "shop", closedApps: {} });
  const copies = shopPlanCopies({ shopData, stockroomData, registry });
  const at = new Date(NOW).toISOString();
  await copies.write("moth-press", { plan: "both", status: "active" }, { link: LINK, at });
  assert.deepEqual((await shopData.get("moth-press", PLAN_DOC)).changing, { adding: ["stockroom"], closing: null });
  await registry.updateShop("moth-press", { builtPlan: "both" });
  await copies.write("moth-press", { plan: "both", status: "active" }, { link: LINK, at });
  assert.equal((await shopData.get("moth-press", PLAN_DOC)).changing, null, "once built, nothing to say");

  const closesAt = new Date(NOW + 20 * DAY).toISOString();
  await copies.write("moth-press", { plan: "shop", status: "active", appsClosing: { apps: ["stockroom"], at: closesAt } }, { link: LINK, at });
  assert.deepEqual((await stockroomData.get("moth-press", PLAN_DOC)).changing, { adding: [], closing: { apps: ["stockroom"], at: closesAt } });
});

test("the bill heads-up reaches the shop's plan document in words and cents, and nothing malformed does", () => {
  const headsUp = { month: "2026-11", projectedCents: 3100, limitCents: 2500, projected: "$31.00", limit: "$25.00" };
  assert.deepEqual(headsUpOf({ costAlert: { cents: 2500, headsUp } }), headsUp);
  assert.equal(headsUpOf({ costAlert: { cents: 2500 } }), null);
  assert.equal(headsUpOf({ costAlert: { headsUp: { ...headsUp, month: "Nov" } } }), null);
  assert.equal(headsUpOf({ costAlert: { headsUp: { ...headsUp, projectedCents: "3100" } } }), null);
  assert.deepEqual(planDocument({ shopId: "moth-press", status: "active", access: "open", costAlert: { headsUp } }, { link: "https://platform.example/x", at: "2026-11-14T00:00:00Z" }).headsUp, headsUp);
});
