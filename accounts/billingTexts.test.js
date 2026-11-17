// Running costs shows the month's text reminders under the tracker (Services plan phase 7, billed at cost).
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingCalls, textsLine } from "./billingRoutes.js";

const billing = { costTracker: async () => ({ month: "2026-11", groups: [] }) };

test("the costs call adds the month's texts only when some went", async () => {
  const none = billingCalls({ billing, settings: {}, texts: { forShop: async () => ({ texts: 0, cents: 0, currency: "CAD" }) } });
  assert.equal((await none.costs.run("s1")).costs.texts, undefined);
  const some = billingCalls({ billing, settings: {}, texts: { forShop: async () => ({ texts: 42, cents: 67, currency: "CAD" }) } });
  assert.deepEqual((await some.costs.run("s1")).costs.texts, { count: 42, cents: 67, text: "$0.67" });
  const broken = billingCalls({ billing, settings: {}, texts: { forShop: async () => { throw new Error("down"); } } });
  assert.equal((await broken.costs.run("s1")).costs.texts, undefined);
  assert.equal((await billingCalls({ billing, settings: {} }).costs.run("s1")).costs.texts, undefined);
});

test("text costs are written in the shop's own money", () => {
  assert.equal(textsLine({ texts: 3, cents: 5, currency: "USD" }, {}).text, "US$0.05");
  assert.equal(textsLine({ texts: 3, cents: 150, currency: "CAD" }, {}).text, "$1.50");
});
