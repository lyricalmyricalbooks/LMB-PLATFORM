// Billing by country (12 November 2026): a press in the United States pays Colophon in US dollars, a Canadian press in
// Canadian dollars; the running cost converts at the month's Bank of Canada rate; the tax code and the "plus tax" lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling } from "./billing.js";
import { billingCurrencyFor, currencyOf, feeIn, moneyWords } from "./currencies.js";
import { createExchange, rateFromObservations } from "./exchangeRate.js";
import { planPrice } from "./plans.js";
import { addressOf } from "./hub.js";
import { taxWatch } from "./taxWatch.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const NOW = 1_800_000_000_000;
const US = { accountId: "acct-us", email: "us@example.com", name: "Sam" };
const CA = { accountId: "acct-ca", email: "ca@example.com", name: "Ada" };

function make({ env = {}, tax = false, rate = 0.72 } = {}) {
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const stores = fakeBillingStores();
  const asked = [];
  const exchange = { rate: async (q) => { asked.push(q); return rate; } };
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings(env), ...stores, registry: fakeRegistry(), auditLog: fakeAuditLog(), email: fakePlatformEmail(), tax, exchange, now: () => NOW,
  });
  return { stripe, stores, billing, asked };
}

test("the currency a press pays in: US dollars in the United States, Canadian dollars in Canada and anywhere else", () => {
  const settings = platformSettings({});
  assert.equal(billingCurrencyFor("US", settings), "USD");
  assert.equal(billingCurrencyFor("ca", settings), "CAD");
  assert.equal(billingCurrencyFor("GB", settings), "CAD");
  assert.equal(billingCurrencyFor(null, settings), "CAD");
  assert.equal(currencyOf({}, settings), "CAD", "a row from before kept no currency: it was billed in CAD");
  assert.equal(currencyOf({ currency: "usd" }, settings), "USD");
  assert.equal(feeIn("both", platformSettings({ PLAN_PRICE_BOTH_USD: "400" }), "USD"), 400);
  assert.equal(moneyWords(500, "USD", settings), "US$5.00");
  assert.equal(moneyWords(500, "CAD", settings), "$5.00");
  const usd = planPrice("both", settings, "USD");
  assert.deepEqual([usd.amount, usd.currency, usd.lookupKey, usd.priceText], [500, "usd", "colophon_both_usd_500_monthly", "US$5.00"]);
});

test("a US press's plan, card page and status are in US dollars; a Canadian press's in Canadian dollars", async () => {
  const w = make();
  const us = await w.billing.startTrial({ account: US, shopId: "us-press", pressName: "US Press", country: "US" });
  const ca = await w.billing.startTrial({ account: CA, shopId: "ca-press", pressName: "CA Press", country: "CA" });
  assert.equal(us.currency, "USD");
  assert.equal(ca.currency, "CAD");
  const prices = [...w.stripe.world.prices.values()].map((p) => [p.currency, p.lookup_key]).sort();
  assert.deepEqual(prices, [["cad", "colophon_both_cad_500_monthly"], ["usd", "colophon_both_usd_500_monthly"]]);
  assert.equal(w.stores.customers.rows.get(US.accountId).currency, "USD", "kept on the person who pays");
  await w.billing.cardLink({ shopId: "us-press", returnUrl: "https://platform.example/account/billing" });
  assert.equal([...w.stripe.world.sessions.values()].at(-1).currency, "usd");
  const status = await w.billing.status("us-press");
  assert.deepEqual([status.currency, status.price, status.usage.alert.text], ["USD", "US$5.00", "US$25.00"]);
  assert.equal((await w.billing.status("ca-press")).price, "$5.00");
});

test("a second shop of a US press stays in US dollars, wherever it is: Stripe bills one person in one currency", async () => {
  const w = make();
  await w.billing.startTrial({ account: US, shopId: "us-press", pressName: "US Press", country: "US" });
  const second = await w.billing.startTrial({ account: US, shopId: "us-two", pressName: "Second", country: "CA" });
  assert.equal(second.currency, "USD");
});

test("a person billed before currencies were kept stays in Canadian dollars", async () => {
  const w = make();
  await w.billing.startTrial({ account: US, shopId: "old-press", pressName: "Old Press" });
  const row = w.stores.customers.rows.get(US.accountId);
  w.stores.customers.rows.set(US.accountId, { ...row, currency: undefined });
  const later = await w.billing.startTrial({ account: US, shopId: "new-press", pressName: "New", country: "US" });
  assert.equal(later.currency, "CAD");
});

test("a US press's running cost converts at the month's rate, with no markup, and the rate is kept; no rate, it waits", async () => {
  const w = make({ tax: true });
  await w.billing.startTrial({ account: US, shopId: "us-press", pressName: "US Press", country: "US" });
  await w.billing.startTrial({ account: CA, shopId: "ca-press", pressName: "CA Press", country: "CA" });
  for (const id of ["us-press", "ca-press"]) await w.stores.subscriptions.set(id, { ...(await w.stores.subscriptions.get(id)), status: "active", trialEnd: "2026-10-01T00:00:00Z" });
  const run = await w.billing.billRunningCosts({ month: "2026-11", costs: { "us-press": 1000, "ca-press": 1000 } });
  assert.deepEqual(run.billed.sort((a, b) => (a.shopId < b.shopId ? -1 : 1)), [{ shopId: "ca-press", cents: 1000 }, { shopId: "us-press", cents: 720 }]);
  assert.deepEqual(w.asked, [{ from: "CAD", to: "USD", month: "2026-11" }], "one rate a month, read once");
  const items = [...w.stripe.world.invoiceItems.values()];
  const usItem = items.find((i) => i.currency === "usd");
  assert.deepEqual([usItem.amount, usItem.metadata.lmb_cost_cents, usItem.metadata.lmb_rate, usItem.tax_behavior, usItem.tax_code], [720, "1000", "0.72", "exclusive", "txcd_10103001"]);
  assert.equal(items.find((i) => i.currency === "cad").tax_code, "txcd_10103001");
  assert.deepEqual((await w.stores.subscriptions.get("us-press")).runningCosts["2026-11"].rate, 0.72);

  const noRate = make({ rate: null });
  await noRate.billing.startTrial({ account: US, shopId: "us-press", pressName: "US Press", country: "US" });
  await noRate.stores.subscriptions.set("us-press", { ...(await noRate.stores.subscriptions.get("us-press")), status: "active", trialEnd: "2026-10-01T00:00:00Z" });
  const waited = await noRate.billing.billRunningCosts({ month: "2026-11", costs: { "us-press": 1000 } });
  assert.deepEqual([waited.billed, waited.waiting], [[], ["us-press"]]);
  assert.equal(noRate.stripe.world.invoiceItems.size, 0);
});

test("with tax on, the plan's product carries the software-as-a-service tax code", async () => {
  const w = make({ tax: true });
  await w.billing.startTrial({ account: CA, shopId: "ca-press", pressName: "CA Press", country: "CA" });
  assert.equal(w.stripe.world.products.get("colophon_both").tax_code, "txcd_10103001");
});

test("the billing address: a Canadian one needs its province, a US one its state and ZIP code", () => {
  const fail = class extends Error { constructor(status, message) { super(message); this.status = status; } };
  const base = { line1: "1 Main St", city: "Springfield" };
  assert.throws(() => addressOf({ ...base, postal_code: "M5V 2T6", country: "CA" }, fail), /province/);
  assert.equal(addressOf({ ...base, postal_code: "M5V 2T6", state: "on", country: "CA" }, fail).state, "ON");
  assert.throws(() => addressOf({ ...base, postal_code: "1234", state: "NY", country: "US" }, fail), /ZIP/);
  assert.throws(() => addressOf({ ...base, postal_code: "10001", state: "ON", country: "US" }, fail), /state/);
  assert.deepEqual(addressOf({ ...base, postalCode: "10001-1234", state: "ny", country: "US" }, fail), { ...base, state: "NY", postal_code: "10001-1234", country: "US" });
});

test("the tax watch adds US sales by state, in US dollars, against a US$100,000 line", () => {
  const now = Date.parse("2026-11-12T00:00:00Z");
  const created = Math.floor(now / 1000) - 86400;
  const watch = taxWatch({ now, invoices: [
    { created, amount: 7_500_000, currency: "usd", state: "NY", country: "US" },
    { created, amount: 100_000, currency: "usd", state: "WA", country: "US" },
    { created, amount: 500_000, currency: "cad", state: "ON", country: "CA" },
  ] });
  assert.equal(watch.lines.find((l) => l.id === "gst").total, 500_000, "US dollars never count as Canadian sales");
  const ny = watch.states.find((s) => s.state === "NY");
  assert.deepEqual([ny.total, ny.level], [7_500_000, "amber"]);
  assert.match(ny.words, /US\$75,000 of US\$100,000/);
  assert.equal(watch.states.find((s) => s.state === "WA").level, "ok");
  assert.equal(watch.attention, true);
});

test("the Bank of Canada rate: the month's last business day, turned into US dollars for one Canadian dollar", async () => {
  const observations = [{ d: "2026-10-30", FXUSDCAD: { v: "1.3900" } }, { d: "2026-10-29", FXUSDCAD: { v: "1.3800" } }];
  assert.deepEqual(rateFromObservations(observations, "FXUSDCAD", { from: "CAD", to: "USD" }), { rate: 0.719424, day: "2026-10-30" });
  let url = "";
  const exchange = createExchange({ fetch: async (u) => { url = u; return { ok: true, json: async () => ({ observations }) }; } });
  assert.equal(await exchange.rate({ from: "CAD", to: "USD", month: "2026-10" }), 0.719424);
  assert.match(url, /FXUSDCAD\/json\?start_date=2026-10-01&end_date=2026-10-31$/);
  assert.equal(await exchange.rate({ from: "CAD", to: "CAD", month: "2026-10" }), 1);
  const down = createExchange({ fetch: async () => ({ ok: false }) });
  assert.equal(await down.rate({ from: "CAD", to: "USD", month: "2026-10" }), null);
});
