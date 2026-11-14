// The running-cost tracker (costTracker.js) and billing.costTracker: the page's figures match what the bill is made from.
import test from "node:test";
import assert from "node:assert/strict";
import { costGroups, monthsBefore, taxOn, trackerFigures } from "./costTracker.js";
import { EXAMPLE_SHOPS, meterCost, monthPace } from "./runningCost.js";
import { createBilling } from "./billing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { platformSettings } from "../settings.js";

const TYPICAL = EXAMPLE_SHOPS.find((shop) => shop.id === "typical").meters;
const NOV_15 = Date.UTC(2026, 10, 16); // 15 whole days of a 30-day month gone

test("the groups are plain words, biggest first, and add up to the month's cost exactly", () => {
  const total = meterCost(TYPICAL).cents;
  const groups = costGroups(TYPICAL, 1, total);
  assert.deepEqual(groups.map((g) => g.id).sort(), ["emails", "records", "storage", "visitors", "work"]);
  assert.equal(groups.reduce((sum, g) => sum + g.cents, 0), total);
  assert.deepEqual(groups.map((g) => g.cents), [...groups.map((g) => g.cents)].sort((a, b) => b - a));
  const by = Object.fromEntries(groups.map((g) => [g.id, g]));
  assert.equal(by.visitors.used, "6 GB of pages and photos shown");
  assert.equal(by.emails.used, "500 emails sent");
  assert.equal(by.storage.used, "2 GB kept");
  for (const g of groups) assert.doesNotMatch(`${g.words} ${g.used}`, /database|egress|invocation|firestore|compute/i);
});

test("nothing used gives five groups of nothing, and a US press sees the same use at the exchange rate", () => {
  assert.deepEqual(costGroups({}, 1, 0).map((g) => [g.cents, g.used]), Array(5).fill([0, ""]));
  const home = meterCost(TYPICAL).cents;
  const us = costGroups(TYPICAL, 0.72, Math.round(home * 0.72));
  assert.equal(us.reduce((sum, g) => sum + g.cents, 0), Math.round(home * 0.72));
});

test("halfway through the month: so far, the month-end estimate, the bill before tax and the comparison", () => {
  const f = trackerFigures({ month: "2026-11", now: NOV_15, record: TYPICAL, history: { "2026-10": { cents: 300 }, "2026-09": { cents: 200 } }, feeCents: 500, feeAfterCents: 375, alertCents: 2500, paidFrom: "2026-09-01T00:00:00Z" });
  // The same pace as the heads-up email: counts doubled at halfway, the photos and records kept priced once.
  const { soFarCents: soFar, monthEndCents: end } = monthPace({ meters: TYPICAL, now: NOV_15, month: "2026-11" });
  assert.deepEqual([f.day, f.days, f.measured, f.soFar, f.monthEnd], [15, 30, true, soFar, end]);
  assert.equal(f.groups.reduce((sum, g) => sum + g.cents, 0), soFar);
  assert.deepEqual(f.estimate, { fee: 500, discount: 125, running: end, beforeTax: 375 + end, freeTrial: false });
  assert.deepEqual(f.trend.map((t) => t.month), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(f.trend.map((t) => t.cents), [null, null, null, 200, 300, end]);
  assert.deepEqual([f.lastMonth.month, f.average], ["2026-10", 250]);
  assert.equal(f.change, Math.round(((end - 300) / 300) * 100));
  assert.deepEqual([f.alert.on, f.alert.passing, f.alert.watched], [true, false, 375 + end]);
});

test("photos and records kept are a whole month's size: so far is the part gone, the month's end their whole price", () => {
  const kept = { storageGb: 10, firestoreGb: 1 }; // 35.88¢ + 24.84¢ a month
  assert.deepEqual(monthPace({ meters: kept, now: NOV_15, month: "2026-11" }), { soFarCents: 30, monthEndCents: 61 });
  assert.deepEqual(monthPace({ meters: { emails: 100 }, now: NOV_15, month: "2026-11" }).monthEndCents, 2 * monthPace({ meters: { emails: 100 }, now: NOV_15, month: "2026-11" }).soFarCents);
  // On the first day a month's storage isn't counted thirty times over.
  assert.equal(monthPace({ meters: kept, now: Date.UTC(2026, 10, 1, 5), month: "2026-11" }).monthEndCents, 61);
  const f = trackerFigures({ month: "2026-11", now: NOV_15, record: kept, feeCents: 500 });
  assert.deepEqual([f.soFar, f.monthEnd, f.groups.reduce((sum, g) => sum + g.cents, 0)], [30, 61, 30]);
});

test("a month heading past the amount says so; 0 turns the watch off; nothing measured promises nothing", () => {
  const busy = EXAMPLE_SHOPS.find((shop) => shop.id === "busy").meters;
  const over = trackerFigures({ month: "2026-11", now: NOV_15, record: busy, feeCents: 500, alertCents: 1000 });
  assert.deepEqual([over.alert.passing, over.alert.used], [true, 1]);
  const off = trackerFigures({ month: "2026-11", now: NOV_15, record: busy, feeCents: 500, alertCents: 0 });
  assert.deepEqual([off.alert.on, off.alert.passing, off.alert.used], [false, false, null]);
  const none = trackerFigures({ month: "2026-11", now: NOV_15, record: null, feeCents: 500 });
  assert.deepEqual([none.measured, none.soFar, none.monthEnd, none.estimate.beforeTax, none.groups.length, none.change], [false, null, null, null, 0, null]);
  // A US press with no exchange rate yet: no made-up figure either.
  assert.equal(trackerFigures({ month: "2026-11", now: NOV_15, record: busy, feeCents: 500, rate: null }).soFar, null);
});

test("a trial month costs nothing to run; a trial ending mid-month pays for its share", () => {
  const trial = trackerFigures({ month: "2026-11", now: NOV_15, record: TYPICAL, feeCents: 500, paidFrom: "2026-12-05T00:00:00Z" });
  assert.deepEqual([trial.estimate.running, trial.estimate.freeTrial], [0, true]);
  const half = trackerFigures({ month: "2026-11", now: NOV_15, record: TYPICAL, feeCents: 500, paidFrom: "2026-11-16T00:00:00Z" });
  assert.equal(half.estimate.running, Math.round(half.monthEnd * 0.5));
});

test("months before, and tax at the next bill's own rate", () => {
  assert.deepEqual(monthsBefore("2027-02", 3), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(taxOn(1000, { taxCents: 65, beforeTaxCents: 500 }), 130);
  assert.equal(taxOn(1000, { taxCents: 0, beforeTaxCents: 500 }), 0);
  assert.equal(taxOn(1000, { taxCents: 65, beforeTaxCents: 0 }), null);
  assert.equal(taxOn(1000, {}), null);
});

const ACCOUNT = { accountId: "acct-1", email: "owner@example.com", name: "Sam Owner" };
function make({ exchange = null } = {}) {
  const stripe = fakeBillingStripe({ clock: () => NOV_15 / 1000 });
  const stores = fakeBillingStores();
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...stores, registry: fakeRegistry(), auditLog: fakeAuditLog(), email: fakePlatformEmail(), exchange, now: () => NOV_15,
  });
  return { stores, billing };
}
const metersOf = (records) => ({ get: async (shopId, month) => records[`${shopId}_${month}`] ?? null });

test("billing.costTracker puts a paying shop's month into words, in its own currency", async () => {
  const w = make();
  await w.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await w.stores.subscriptions.set("moth-press", { ...(await w.stores.subscriptions.get("moth-press")), status: "active", trialEnd: "2026-09-01T00:00:00Z", runningCosts: { "2026-10": { cents: 300 } }, costAlert: { cents: 1000 } });
  const costs = await w.billing.costTracker({ shopId: "moth-press", meters: metersOf({ "moth-press_2026-11": { ...TYPICAL, updatedAt: "2026-11-15T06:00:00Z" } }) });
  const { soFarCents: soFar, monthEndCents: end } = monthPace({ meters: TYPICAL, now: NOV_15, month: "2026-11" });
  assert.deepEqual([costs.month, costs.monthName, costs.currency, costs.measured, costs.updatedAt], ["2026-11", "November", "CAD", true, "2026-11-15T06:00:00Z"]);
  assert.equal(costs.soFar.cents, soFar);
  assert.match(costs.soFar.text, /^\$\d+\.\d\d$/);
  assert.equal(costs.groups.reduce((sum, g) => sum + g.cents, 0), soFar);
  assert.deepEqual([costs.estimate.fee.text, costs.estimate.discount, costs.estimate.beforeTax.cents], ["$5.00", null, 500 + end]);
  assert.deepEqual(costs.trend.map((t) => t.words), ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
  assert.deepEqual([costs.lastMonth.monthWords, costs.lastMonth.text], ["October 2026", "$3.00"]);
  assert.deepEqual([costs.alert.text, costs.alert.on, costs.alert.sent], ["$10.00", true, false]);
});

test("billing.costTracker for a shop with nothing measured, and for one with no plan", async () => {
  const w = make();
  await w.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  const costs = await w.billing.costTracker({ shopId: "moth-press", meters: null });
  assert.deepEqual([costs.measured, costs.soFar, costs.monthEnd, costs.groups, costs.alert.text], [false, null, null, [], "$25.00"]);
  // A reader that fails never breaks the page.
  const broken = await w.billing.costTracker({ shopId: "moth-press", meters: { get: async () => { throw new Error("down"); } } });
  assert.equal(broken.measured, false);
  await assert.rejects(w.billing.costTracker({ shopId: "nobody" }), /no plan yet/);
});
