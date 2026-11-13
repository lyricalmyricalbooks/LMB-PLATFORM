// Pay what you use: the running-cost maths, and billing putting last month's cost on the next bill exactly once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { DEFAULT_ALERT_CENTS, EXAMPLE_SHOPS, examples, meterCost, monthWords, paidShare, previousMonth, projectedCents, runningCostCents } from "./runningCost.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { platformSettings } from "../settings.js";
import { TEMPLATES } from "../email/templates.js";
import { TEMPLATES_FR } from "../email/templatesFr.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const DAY = 86_400_000;

test("a month of use is priced line by line at cost; junk counts as nothing", () => {
  const { cents, lines } = meterCost({ reads: 1_000_000, egressGb: 10, emails: 1000, writes: -5, storageGb: "lots" });
  // 1M reads at $0.83 a million, 10 GB of traffic at $0.207, 1,000 emails at $0.0006.
  assert.equal(cents, Math.round((0.83 + 2.07 + 0.6) * 100));
  assert.equal(lines.find((l) => l.kind === "writes").amount, 0);
  assert.equal(lines.find((l) => l.kind === "storageGb").cents, 0);
  assert.equal(lines.find((l) => l.kind === "egressGb").words, "Web traffic");
  assert.equal(meterCost().cents, 0);
});

test("the meters win; without them the shop's own project's cost; nothing known is null, never zero", () => {
  assert.equal(runningCostCents({ meters: { egressGb: 10 }, exportCents: 999 }), 207);
  assert.equal(runningCostCents({ meters: {}, exportCents: 140 }), 140);
  assert.equal(runningCostCents({ exportCents: -30 }), 0, "a month of free-tier credits costs nothing");
  assert.equal(runningCostCents({}), null);
});

test("only the part of the month the plan was paid for counts; a trial month costs nothing", () => {
  assert.equal(paidShare({ month: "2026-11", paidFrom: null }), 1);
  assert.equal(paidShare({ month: "2026-11", paidFrom: "2026-11-16T00:00:00Z" }), 0.5);
  assert.equal(paidShare({ month: "2026-11", paidFrom: "2026-12-04T00:00:00Z" }), 0, "still in the trial");
  assert.equal(paidShare({ month: "2026-11", paidFrom: "2026-10-01T00:00:00Z", endedAt: "2026-11-11T00:00:00Z" }), 0.333);
  assert.throws(() => paidShare({ month: "November" }), /2026-11/);
  assert.equal(previousMonth(Date.parse("2026-12-03T10:00:00Z")), "2026-11");
  assert.equal(previousMonth(Date.parse("2027-01-01T00:00:00Z")), "2026-12");
  assert.equal(monthWords("2026-10"), "October 2026");
});

test("a month heads where its use so far points; the first day counts as a whole day", () => {
  assert.equal(projectedCents({ soFarCents: 300, now: Date.parse("2026-11-11T00:00:00Z"), month: "2026-11" }), 900);
  assert.equal(projectedCents({ soFarCents: 10, now: Date.parse("2026-11-01T01:00:00Z"), month: "2026-11" }), 300);
});

test("the example shops: quiet, typical and busy, all from the same prices", () => {
  const list = examples(500);
  assert.deepEqual(list.map((e) => e.id), EXAMPLE_SHOPS.map((e) => e.id));
  assert.deepEqual(list.map((e) => e.totalCents), [551, 753, 1995]);
  assert.ok(list.every((e) => e.totalCents === e.runningCents + 500));
  assert.ok(list[2].totalCents < DEFAULT_ALERT_CENTS, "a busy shop isn't told about an ordinary month");
});

const NOW = Date.parse("2026-12-03T12:00:00Z");
const ACCOUNT = { accountId: "acct-1", email: "owner@example.com", name: "Ada" };

function make() {
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const stores = fakeBillingStores();
  const email = fakePlatformEmail();
  const registry = fakeRegistry();
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...stores, registry, auditLog: fakeAuditLog(), email, now: () => NOW,
  });
  return { stripe, stores, email, registry, billing };
}

test("last month's running cost goes on the next bill once, not discountable, and only for the days that were paid", async () => {
  const w = make();
  await w.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await w.billing.startTrial({ account: { ...ACCOUNT, accountId: "acct-2", email: "two@example.com" }, shopId: "late-press", pressName: "Late Press", plan: "shop" });
  // Moth Press paid all of November; Late Press's trial ended halfway through.
  await w.stores.subscriptions.set("moth-press", { ...(await w.stores.subscriptions.get("moth-press")), status: "active", trialEnd: "2026-10-20T00:00:00Z" });
  await w.stores.subscriptions.set("late-press", { ...(await w.stores.subscriptions.get("late-press")), status: "active", trialEnd: "2026-11-16T00:00:00Z" });

  const run = await w.billing.billRunningCosts({ month: "2026-11", costs: { "moth-press": 253, "late-press": 200 } });
  assert.deepEqual(run.billed, [{ shopId: "moth-press", cents: 253 }, { shopId: "late-press", cents: 100 }]);
  const items = [...w.stripe.world.invoiceItems.values()];
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].amount, items[0].currency, items[0].discountable, items[0].metadata.lmb_month], [253, "cad", "false", "2026-11"]);
  assert.match(items[0].description, /^Running cost, November 2026 \/ Coût de fonctionnement$/);
  assert.equal(items[0].subscription, (await w.stores.subscriptions.get("moth-press")).subscriptionId);
  assert.deepEqual((await w.stores.subscriptions.get("late-press")).runningCosts["2026-11"].share, 0.5);

  // Again (the job runs daily): nothing new.
  const again = await w.billing.billRunningCosts({ month: "2026-11", costs: { "moth-press": 253, "late-press": 200 } });
  assert.deepEqual(again.billed, []);
  assert.equal(w.stripe.world.invoiceItems.size, 2);

  // The line was made but its record didn't save, and the next run comes after Stripe forgot the request key
  // (and with a re-measured cost): the line already waiting is used, never a second one.
  const row = await w.stores.subscriptions.get("moth-press");
  await w.stores.subscriptions.set("moth-press", { ...row, runningCosts: {} });
  const retry = await w.billing.billRunningCosts({ month: "2026-11", costs: { "moth-press": 260, "late-press": 200 } });
  assert.deepEqual(retry.billed, [{ shopId: "moth-press", cents: 253 }]);
  assert.equal(w.stripe.world.invoiceItems.size, 2);
  assert.equal((await w.stores.subscriptions.get("moth-press")).runningCosts["2026-11"].invoiceItemId, items[0].id);

  const status = await w.billing.status("moth-press");
  assert.equal(status.price, "$5.00");
  assert.deepEqual([status.usage.fee, status.usage.lastMonth.monthWords, status.usage.lastMonth.text, status.usage.alert.text], ["$5.00", "November 2026", "$2.53", "$25.00"]);
});

test("a trial month, a missing cost and an ended plan are not billed; a cost of nothing adds no line", async () => {
  const w = make();
  await w.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  const run = await w.billing.billRunningCosts({ month: "2026-11", costs: {} });
  assert.deepEqual(run.missing, ["moth-press"], "the cost isn't known yet: tried again tomorrow");
  const trial = await w.billing.billRunningCosts({ month: "2026-11", costs: { "moth-press": 400 } });
  assert.deepEqual(trial.billed, [{ shopId: "moth-press", cents: 0 }], "the trial ends after November: nothing to charge");
  assert.equal(w.stripe.world.invoiceItems.size, 0);
  await w.stores.subscriptions.set("moth-press", { ...(await w.stores.subscriptions.get("moth-press")), status: "canceled" });
  assert.deepEqual((await w.billing.billRunningCosts({ month: "2026-10", costs: { "moth-press": 400 } })).skipped, ["moth-press"]);
});

test("the heads-up email goes once a month when the bill looks set to pass the press's amount; 0 turns it off", async () => {
  const w = make();
  await w.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await w.stores.subscriptions.set("moth-press", { ...(await w.stores.subscriptions.get("moth-press")), status: "active", billingEmail: "owner@example.com" });
  // 3 December, $3 so far: heading for about $31, plus the $5 fee, over the $25 default.
  assert.deepEqual(await w.billing.runningCostAlerts({ month: "2026-12", soFar: { "moth-press": 300 } }), ["moth-press"]);
  assert.deepEqual(await w.billing.runningCostAlerts({ month: "2026-12", soFar: { "moth-press": 900 } }), [], "once a month");
  const mail = w.email.list().find((m) => m.kind === "bill-heads-up");
  assert.ok(mail);
  const words = TEMPLATES["bill-heads-up"](mail.data, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.match(words.subject, /^Moth Press's bill for December 2026 may pass \$25\.00$/);
  assert.match(TEMPLATES_FR["bill-heads-up"](mail.data, { settings: platformSettings({}), pressName: "Moth Press" }).text, /décembre 2026.*25,00 \$/s);

  await w.billing.setCostAlert({ shopId: "moth-press", cents: 0 });
  assert.deepEqual(await w.billing.runningCostAlerts({ month: "2027-01", soFar: { "moth-press": 5000 } }), []);
  await w.billing.setCostAlert({ shopId: "moth-press", cents: 10_000 });
  assert.deepEqual(await w.billing.runningCostAlerts({ month: "2027-01", soFar: { "moth-press": 300 } }), [], "under their own amount");
  await assert.rejects(w.billing.setCostAlert({ shopId: "moth-press", cents: -1 }), /\$0 to \$10,000/);
});

test("the bank feed add-on goes on the next bill once per month a bank was connected, in the shop's currency, never in the trial", async () => {
  const w = make();
  await w.billing.startTrial({ account: ACCOUNT, shopId: "moth-press", pressName: "Moth Press", plan: "both" });
  await w.billing.startTrial({ account: { ...ACCOUNT, accountId: "acct-2", email: "two@example.com" }, shopId: "trial-press", pressName: "Trial Press", plan: "both" });
  await w.billing.startTrial({ account: { ...ACCOUNT, accountId: "acct-3", email: "three@example.com" }, shopId: "no-bank", pressName: "No Bank", plan: "both" });
  await w.stores.subscriptions.set("moth-press", { ...(await w.stores.subscriptions.get("moth-press")), status: "active", trialEnd: "2026-10-20T00:00:00Z" });
  await w.stores.subscriptions.set("no-bank", { ...(await w.stores.subscriptions.get("no-bank")), status: "active", trialEnd: "2026-10-20T00:00:00Z" });
  const cents = (currency, banks) => (currency === "USD" ? 300 : 400) + Math.max(0, banks - 2) * 150;

  const run = await w.billing.billBankFeed({ month: "2026-11", banks: { "moth-press": 3, "trial-press": 1 }, cents });
  assert.deepEqual(run.billed, [{ shopId: "moth-press", cents: 550 }, { shopId: "trial-press", cents: 0 }]);
  const items = [...w.stripe.world.invoiceItems.values()];
  assert.equal(items.length, 1, "no bank, no line; a trial month costs nothing");
  assert.deepEqual([items[0].amount, items[0].currency, items[0].discountable, items[0].metadata.lmb_kind, items[0].metadata.lmb_banks], [550, "cad", "false", "bank-feed", "3"]);
  assert.match(items[0].description, /^Bank feed, November 2026 \/ Flux bancaire$/);

  // Again (the job runs daily), and after a record that didn't save: never a second line.
  assert.deepEqual((await w.billing.billBankFeed({ month: "2026-11", banks: { "moth-press": 3 }, cents })).billed, []);
  await w.stores.subscriptions.set("moth-press", { ...(await w.stores.subscriptions.get("moth-press")), bankFeedBills: {} });
  assert.deepEqual((await w.billing.billBankFeed({ month: "2026-11", banks: { "moth-press": 3 }, cents })).billed, [{ shopId: "moth-press", cents: 550 }]);
  assert.equal(w.stripe.world.invoiceItems.size, 1);
  // A running-cost line for the same month is its own line.
  await w.billing.billRunningCosts({ month: "2026-11", costs: { "moth-press": 100, "trial-press": 0, "no-bank": 0 } });
  assert.equal(w.stripe.world.invoiceItems.size, 2);
});
