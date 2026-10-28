// Today (code plan 9.2): counts by billing state, monthly income with the founding discount, and the needs-you list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyCents, todaySummary } from "./today.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-10-28T12:00:00Z");
const settings = platformSettings({});
const shop = (shopId, billing, extra = {}) => ({ shopId, pressName: shopId, plan: billing?.plan ?? "both", status: "live", createdAt: "2026-09-01T00:00:00Z", billing, ...extra });

const rows = [
  shop("trial-a", { status: "trialing", access: "open", plan: "shop" }, { createdAt: "2026-10-26T00:00:00Z" }),
  shop("paying-both", { status: "active", access: "open", plan: "both" }),
  shop("founding", { status: "active", access: "open", plan: "both", percentOff: 25 }),
  shop("old-price", { status: "active", access: "open", plan: "shop", amount: 2500 }),
  shop("retrying", { status: "past_due", access: "open", plan: "stockroom" }),
  shop("paused", { status: "paused", access: "paused", plan: "shop" }),
  shop("ended", { status: "canceled", access: "closed", plan: "shop" }),
  shop("abuse", { status: "active", access: "open", plan: "shop" }, { closure: { by: "a", reason: "stolen cards", at: "2026-10-27" } }),
  shop("platform-test", { status: "active", access: "open", plan: "both" }, { testShop: true }),
];

test("counts each billing state once and leaves the test shop out", () => {
  const { counts } = todaySummary({ rows, settings, now: NOW });
  assert.deepEqual(counts, { shops: 8, live: 7, trial: 1, paying: 5, paused: 2, closed: 1, signupsThisWeek: 1, failedPayments: 1 });
});

test("monthly income: paying shops at their price, less their founding discount; trials, pauses and the test shop count nothing", () => {
  assert.equal(monthlyCents(rows[0], settings), 0);
  assert.equal(monthlyCents(rows[2], settings), 2925);
  assert.equal(monthlyCents(rows[3], settings), 2500);
  assert.equal(monthlyCents(rows[8], settings), 0);
  const { monthlyIncome, currency } = todaySummary({ rows, settings, now: NOW });
  // both 3900 + founding 2925 + old price 2500 + retrying stockroom 1900 + closed-for-abuse shop 2900 (still billed)
  assert.equal(monthlyIncome, 3900 + 2925 + 2500 + 1900 + 2900);
  assert.equal(currency, "CAD");
});

test("needs you: broken shops, failed payments, the queues and stuck sign-ups, each pointing at its place", () => {
  const broken = shop("broken", { status: "active", access: "open", plan: "shop" }, { health: { checks: { checkout: { ok: false, detail: "500 from checkout" } } } });
  const { needs } = todaySummary({
    rows: [...rows, broken], settings, now: NOW,
    profiles: Object.fromEntries([...rows, broken].map((r) => [r.shopId, { siteUrl: "https://x.example" }])),
    checks: { "platform-test": [{ ok: true }] },
    open: { paused: [{ problem: "release behind" }] },
    support: [{ id: "t1" }, { id: "t2" }], recoveries: [{ id: "r1" }],
    making: [{ shopId: "new-a", status: "failed", canRetry: true }, { shopId: "new-b", status: "making" }],
  });
  assert.deepEqual(needs.map((n) => n.kind), ["shop", "shop", "payment", "repairs", "support", "recovery", "signup"]);
  assert.match(needs.find((n) => n.shopId === "broken").words, /checkout check is failing/);
  assert.equal(needs.find((n) => n.kind === "support").words, "2 support requests waiting");
  assert.equal(needs.find((n) => n.kind === "signup").go, "#making");
  assert.deepEqual(todaySummary({ rows: [], settings, now: NOW }).needs, []);
});
