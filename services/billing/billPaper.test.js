import { test } from "node:test";
import assert from "node:assert/strict";
import { billPaper } from "./billing.js";

const settings = { platformName: "Colophon", mailingAddress: "1 Example St, Toronto ON" };
const money = (cents) => `CA$${(cents / 100).toFixed(2)}`;

const bill = (extra = {}) => ({
  currency: "cad",
  account_name: "Colophon",
  customer_name: "Test Press",
  customer_email: "owner@example.com",
  customer_address: { line1: "2 Example Ave", city: "Toronto", state: "ON", postal_code: "M1M 1M1", country: "CA" },
  customer_tax_ids: [{ type: "ca_gst_hst", value: "123456789RT0001" }],
  account_tax_ids: ["txi_ours"],
  lines: { data: [{ description: "Colophon plan (Nov 2026)", amount: 3500 }, { description: "Running cost, October", amount: 400 }] },
  subtotal: 3900,
  total_taxes: [{ amount: 507, tax_rate_details: { tax_rate: "txr_hst" } }],
  total: 4407,
  amount_paid: 4407,
  amount_remaining: 0,
  status_transitions: { paid_at: 1794000000 },
  ...extra,
});

test("a bill names its tax lines and both tax numbers from Stripe, amounts untouched", async () => {
  const asked = [];
  const named = async (ref, path) => {
    asked.push(`${path}/${ref}`);
    if (path === "/v1/tax_rates") return { display_name: "HST", percentage: 13, jurisdiction: "ON" };
    if (path === "/v1/tax_ids") return { type: "ca_gst_hst", value: "987654321RT0001" };
    return null;
  };
  const paper = await billPaper(bill(), { named, money, settings });
  assert.deepEqual(asked, ["/v1/tax_rates/txr_hst", "/v1/tax_ids/txi_ours"]);
  assert.equal(paper.from.name, "Colophon");
  assert.equal(paper.from.address, "1 Example St, Toronto ON");
  assert.deepEqual(paper.from.taxNumbers, ["GST/HST number: 987654321RT0001"]);
  assert.deepEqual(paper.to.address, ["2 Example Ave", "Toronto ON M1M 1M1", "CA"]);
  assert.deepEqual(paper.to.taxNumbers, ["GST/HST number: 123456789RT0001"]);
  assert.equal(paper.currency, "CAD");
  assert.deepEqual(paper.lines.map((l) => l.amount), ["CA$35.00", "CA$4.00"]);
  assert.equal(paper.subtotal, "CA$39.00");
  assert.deepEqual(paper.taxes, [{ words: "HST (13%), ON", amount: "CA$5.07" }]);
  assert.equal(paper.total, "CA$44.07");
  assert.equal(paper.paid, "CA$44.07");
  assert.equal(paper.due, "CA$0.00");
  assert.equal(paper.paidAt, new Date(1794000000 * 1000).toISOString());
});

test("a lookup that fails leaves a plain Tax line and no number, never the bill out", async () => {
  const paper = await billPaper(bill(), { named: async () => null, money, settings });
  assert.deepEqual(paper.taxes, [{ words: "Tax", amount: "CA$5.07" }]);
  assert.deepEqual(paper.from.taxNumbers, []);
  assert.equal(paper.total, "CA$44.07");
});

test("an older bill with only a tax total still shows it; a bill with no lines has no page", async () => {
  const older = await billPaper(bill({ total_taxes: undefined, tax: 507 }), { named: async () => null, money, settings });
  assert.deepEqual(older.taxes, [{ words: "Tax", amount: "CA$5.07" }]);
  assert.equal(await billPaper(bill({ lines: { data: [] } }), { named: async () => null, money, settings }), null);
});
