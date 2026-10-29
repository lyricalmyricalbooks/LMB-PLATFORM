// The tax threshold watch (code plan 15.20): totals by province over a rolling 12 months, amber at 70%, over at 100%.
import { test } from "node:test";
import assert from "node:assert/strict";
import { taxWatch, TAX_LINES, WATCH_WINDOW_DAYS } from "./taxWatch.js";
import { createBilling } from "./billing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "./fakes.js";
import { createStripeApi } from "../payments/stripeApi.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const DAY = 86400;
const at = (daysAgo) => Math.floor(NOW / 1000) - daysAgo * DAY;
const inv = (daysAgo, dollars, state, extra = {}) => ({ created: at(daysAgo), amount: dollars * 100, currency: "cad", state, ...extra });
const line = (watch, id) => watch.lines.find((l) => l.id === id);

test("sales roll over 12 months by province: old ones drop out, other currencies and bad rows don't count", () => {
  const watch = taxWatch({ now: NOW, invoices: [
    inv(10, 1000, "ON"), inv(100, 500, "QC"), inv(WATCH_WINDOW_DAYS - 1, 250, "BC"),
    inv(WATCH_WINDOW_DAYS + 1, 99_999, "BC"), inv(5, 777, "ON", { currency: "usd" }), { created: at(3), amount: "x", state: "ON" }, null,
  ] });
  assert.equal(watch.byProvince.ON, 100_000);
  assert.equal(watch.byProvince.QC, 50_000);
  assert.equal(watch.byProvince.BC, 25_000);
  assert.equal(line(watch, "gst").total, 175_000);
  assert.equal(line(watch, "qc").total, 50_000);
  assert.equal(line(watch, "bc").total, 25_000);
  assert.equal(watch.attention, false);
  assert.equal(taxWatch({ now: NOW }).lines.length, TAX_LINES.length);
});

test("amber at 70% of each line and over at 100%, with the accountant note", () => {
  const nearBc = taxWatch({ now: NOW, invoices: [inv(1, 7000, "BC")] });
  assert.equal(line(nearBc, "bc").state, "amber");
  assert.equal(line(nearBc, "bc").percent, 70);
  assert.equal(line(nearBc, "gst").state, "ok");
  assert.match(line(nearBc, "bc").words, /Ask the accountant when to register/);
  assert.equal(nearBc.attention, true);
  assert.equal(line(taxWatch({ now: NOW, invoices: [inv(1, 6999, "BC")] }), "bc").state, "ok");
  const over = taxWatch({ now: NOW, invoices: [inv(1, 10_000, "BC")] });
  assert.equal(line(over, "bc").state, "over");
  assert.match(line(over, "bc").words, /past the line/);
  // Quebec's line is $30,000 of sales to Quebec; the federal line counts every province together.
  const spread = taxWatch({ now: NOW, invoices: [inv(1, 10_000, "ON"), inv(2, 10_000, "AB"), inv(3, 10_000, "QC")] });
  assert.equal(line(spread, "gst").state, "over");
  assert.equal(line(spread, "qc").state, "ok");
  // A sale with no province counts toward Canada only.
  assert.equal(line(taxWatch({ now: NOW, invoices: [inv(1, 25_000, undefined)] }), "gst").state, "amber");
  assert.equal(line(taxWatch({ now: NOW, invoices: [inv(1, 25_000, undefined)] }), "qc").total, 0);
});

test("billing reads Stripe's paid invoices a page at a time, tax left out, province from the customer's address", async () => {
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const billing = createBilling({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings: platformSettings({}), ...fakeBillingStores(), registry: fakeRegistry(), auditLog: fakeAuditLog(), email: fakePlatformEmail(), webhookSecrets: [], now: () => NOW,
  });
  const add = (id, daysAgo, total, tax, state, status = "paid") => stripe.world.invoices.set(id, { id, status, created: at(daysAgo), total, tax, currency: "cad", customer_address: { state } });
  // 230 paid invoices of $29 + 13% HST in Ontario (more than two pages), one unpaid, one too old, one in Quebec.
  for (let n = 0; n < 230; n += 1) add(`in_on${n}`, 1 + (n % 300), 3277, 377, "ON");
  add("in_open", 2, 3277, 377, "ON", "open");
  add("in_old", WATCH_WINDOW_DAYS + 20, 3277, 377, "ON");
  add("in_qc", 4, 3335, 435, "QC");
  const watch = await billing.taxWatch();
  assert.equal(watch.byProvince.ON, 230 * 2900);
  assert.equal(watch.byProvince.QC, 2900);
  assert.equal(stripe.requests.filter((r) => r.path === "/v1/invoices").length, 3, "three pages of up to 100");
});
