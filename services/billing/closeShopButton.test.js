// The Close shop button (Julian, 18 November 2026: "where do i even close the shop? … make it easy with a button"). One
// call, `close`: a month already paid for runs to its end (a cancel, as before); a free trial or a failed payment closes
// today through the closing sweep (closeNow), with the same 90 days, emails and reminders. `reopen` starts a plan again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { createClosingSweep, DOWNLOAD_DAYS } from "./closing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { fakeProjects } from "./closingFakes.js";
import { shopPlanCopies } from "./shopPlan.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeShopData } from "../../accounts/fakes.js";
import { billingCalls, billingPage, closesLater } from "../../accounts/billingRoutes.js";

const START = 1_800_000_000_000;
const DAY = 86400_000;
const SHOP = "moth-press";

async function trialShop() {
  const clock = START;
  const now = () => clock;
  const stripe = fakeBillingStripe({ clock: () => clock / 1000 });
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const settings = platformSettings({});
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings, ...fakeBillingStores(), registry, auditLog, email,
    shopPlan: shopPlanCopies({ shopData: fakeShopData(), registry }), now,
  });
  const closing = createClosingSweep({ registry, auditLog, billing, email, projects: fakeProjects(), settings, now });
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", plan: "both", status: "live" });
  await billing.startTrial({ account: { accountId: "acct-1", email: "owner@example.com" }, shopId: SHOP, pressName: "Moth Press", plan: "both" });
  const calls = billingCalls({ billing, settings, closing });
  return { billing, registry, email, closing, calls, settings, sent: (kind) => email.list().filter((m) => m.kind === kind) };
}

test("on a free trial, Close shop closes the shop today, with 90 days to come back, and pressing it twice changes nothing", async () => {
  const t = await trialShop();
  assert.equal((await t.billing.status(SHOP)).status, "trialing");
  const answer = await t.calls.close.run(SHOP, {});
  assert.deepEqual(answer, { closed: true, closesAt: null });
  const row = await t.registry.getShop(SHOP);
  assert.equal(row.closing.stage, "closed");
  assert.equal(Date.parse(row.closing.downloadUntil), START + DOWNLOAD_DAYS * DAY);
  assert.equal((await t.billing.status(SHOP)).access, "closed", "the trial plan ended, so no card can be billed");
  assert.equal(t.sent("shop-closed").length, 1);
  assert.deepEqual(await t.calls.close.run(SHOP, {}), { closed: true, closesAt: null });
  assert.equal(t.sent("shop-closed").length, 1, "one email, however many presses");
  // The daily sweep carries on from there: nothing is undone, the stage stays closed.
  await t.closing.sweep();
  assert.equal((await t.registry.getShop(SHOP)).closing.stage, "closed");
});

test("a closed shop can start a plan again: it gets the card page, since the trial is used up", async () => {
  const t = await trialShop();
  await t.calls.close.run(SHOP, {});
  const answer = await t.calls.reopen.run(SHOP, {}, { returnUrl: billingPage(t.settings, SHOP) });
  assert.match(answer.url, /^https:\/\//);
  const status = await t.billing.status(SHOP);
  assert.notEqual(status.status, "canceled", "a new plan is waiting for its card");
  assert.notEqual(status.status, "trialing", "no second free trial");
});

test("a month already paid for runs to its end: Close shop is a cancel, and the shop stays open until then", async () => {
  const done = [];
  const billing = {
    status: async () => ({ status: "active", access: "open", paymentWay: "monthly", cancelEndsAt: "2026-12-12T12:00:00Z", currentPeriodEnd: "2026-12-12T12:00:00Z" }),
    cancel: async (asked) => { done.push(["cancel", asked.shopId]); return { currentPeriodEnd: "2026-12-12T12:00:00Z" }; },
  };
  const closing = { closeNow: async () => { done.push(["closeNow"]); } };
  const calls = billingCalls({ billing, settings: platformSettings({}), closing });
  assert.deepEqual(await calls.close.run(SHOP, {}), { closed: false, closesAt: "2026-12-12T12:00:00Z" });
  assert.deepEqual(done, [["cancel", SHOP]]);
  assert.equal(calls.close.secondStep, true, "a paid plan's owner needs two-step sign-in, as for Cancel");
});

test("when the shop closes: later only with paid time left", () => {
  assert.equal(closesLater({ status: "active", access: "open", paymentWay: "monthly" }), true);
  assert.equal(closesLater({ status: "trialing", access: "open", paymentWay: "monthly" }), false);
  assert.equal(closesLater({ status: "past_due", access: "open", paymentWay: "monthly" }), false);
  assert.equal(closesLater({ status: "paused", access: "paused", paymentWay: "monthly" }), false);
  assert.equal(closesLater({ status: "canceled", access: "open", paymentWay: "payAsYouSell" }), true);
});

test("a shop with no plan at all is told to ask us, and nothing changes", async () => {
  const calls = billingCalls({ billing: { status: async () => null }, settings: platformSettings({}), closing: { closeNow: async () => assert.fail("not closed") } });
  await assert.rejects(calls.close.run(SHOP, {}), /no plan yet/);
});
