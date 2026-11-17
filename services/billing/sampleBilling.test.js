// The test shops' sample billing (sampleBilling.js): same shapes as the real answers, in the shop's own currency, the
// sums adding up, and a plan copy only for a test shop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_READS, sampleBillingAnswer, testShopPlanDocument } from "./sampleBilling.js";
import { platformSettings } from "../settings.js";

const settings = platformSettings({});
const now = new Date("2026-11-17T01:00:00Z");
const CA = { shopId: "test-press", pressName: "Test Press", testShop: true };
const US = { shopId: "test-press-us", pressName: "Test Press US", testShop: true, currency: "USD" };
const ask = (call, row = CA) => sampleBillingAnswer(call, row, { settings, now, email: "owner@example.com" });
const cents = (text) => Math.round(Number(String(text).replace(/[^0-9.]/g, "")) * 100);

test("every read answers; a change is refused; the download stays real", () => {
  for (const call of SAMPLE_READS) assert.ok(ask(call));
  assert.equal(ask("download"), undefined);
  for (const call of ["card", "pay-now", "cancel", "details/save", "payment-methods/remove", "cost-alert", "add-on"]) {
    assert.throws(() => ask(call), (error) => error.status === 409);
  }
});

test("a Canadian test shop: four paid monthly bills with HST, each adding up, newest first", () => {
  const { invoices } = ask("invoices");
  assert.deepEqual(invoices.map((b) => b.date.slice(0, 10)), ["2026-11-01", "2026-10-01", "2026-09-01", "2026-08-01"]);
  for (const bill of invoices) {
    const p = bill.paper;
    const sum = p.lines.reduce((s, l) => s + cents(l.amount), 0);
    assert.equal(cents(p.subtotal), sum);
    assert.equal(cents(p.total), sum - cents(p.discount) + p.taxes.reduce((s, t) => s + cents(t.amount), 0));
    assert.equal(bill.amount, p.total);
    assert.match(p.taxes[0].words, /HST/);
  }
  // The first bill (the month the trial ended) has no running cost before it.
  assert.equal(invoices.at(-1).paper.lines.length, 1);
});

test("the US test shop is all in US dollars with no tax line", () => {
  assert.match(ask("status", US).billing.price, /^US\$/);
  const bill = ask("upcoming", US).bill;
  assert.match(bill.total, /^US\$/);
  assert.equal(bill.tax, "");
  assert.equal(ask("details", US).details.address.country, "US");
  assert.ok(ask("invoices", US).invoices.every((b) => b.paper.taxes.length === 0));
});

test("the running costs so far and the month's estimate are measured and add up", () => {
  const { costs } = ask("costs");
  assert.equal(costs.measured, true);
  assert.equal(costs.groups.reduce((s, g) => s + g.cents, 0), costs.soFar.cents);
  assert.ok(costs.monthEnd.cents >= costs.soFar.cents);
  assert.equal(costs.trend.filter((t) => t.cents !== null).length, 4);
});

test("the plan copy: open, a card on file, the billing door's address; only for a test shop", () => {
  const doc = testShopPlanDocument(CA, { platformUrl: "https://platform.example", now });
  assert.equal(doc.state, "active");
  assert.equal(doc.hub, "https://platform.example/api/shop-billing/");
  assert.equal(doc.shopId, "test-press");
  assert.equal(doc.hasCard, true);
  assert.throws(() => testShopPlanDocument({ shopId: "moth-press" }, { platformUrl: "https://platform.example", now }));
});
