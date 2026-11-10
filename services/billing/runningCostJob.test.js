// The daily running-cost job: where each shop's cost comes from (meters first, else its own project's CAD cost in the
// export, else nothing yet), test shops left out, last month billed only from the 3rd, heads-ups every day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BILL_FROM_DAY, costsFor, runRunningCosts } from "./runningCostJob.js";

const rows = [{ shopId: "moth-press", projectId: "demo-moth" }, { shopId: "late-press", projectId: "demo-late" }, { shopId: "new-press", projectId: "demo-new" }];
const meters = { get: async (shopId, month) => (shopId === "moth-press" && month === "2026-11" ? { egressGb: 10 } : null) };
const reader = (costs) => ({ configured: true, read: async () => costs });

test("meters win, then the shop's own project's CAD cost; a shop with neither is left for a later day", async () => {
  const exported = { projects: [{ projectId: "demo-moth", currency: "CAD", netCents: 999 }, { projectId: "demo-late", currency: "CAD", netCents: 140 }] };
  const costs = await costsFor({ rows, month: "2026-11", meters, reader: reader(exported) });
  assert.deepEqual(costs, { "moth-press": 207, "late-press": 140 });
  assert.deepEqual(await costsFor({ rows, month: "2026-11" }), {}, "nothing connected: nothing known, never zero");
  const usd = await costsFor({ rows, month: "2026-11", reader: reader({ projects: [{ projectId: "demo-late", currency: "USD", netCents: 100 }] }) });
  assert.deepEqual(usd, {}, "a cost in another currency isn't billed as dollars of ours");
});

function fakeBilling() {
  const calls = [];
  return {
    calls,
    billRunningCosts: async (args) => { calls.push(["bill", args]); return { month: args.month, billed: Object.keys(args.costs), missing: [] }; },
    runningCostAlerts: async (args) => { calls.push(["alerts", args]); return []; },
  };
}
const registry = { listShops: async () => [...rows, { shopId: "test-shop", projectId: "demo-test", testShop: true }] };

test("before the 3rd only the heads-ups run; from the 3rd last month is billed too; test shops are left out", async () => {
  const early = fakeBilling();
  const first = await runRunningCosts({ billing: early, registry, meters, now: () => new Date("2026-12-02T03:00:00Z") });
  assert.deepEqual(early.calls.map(([kind, args]) => [kind, args.month]), [["alerts", "2026-12"]]);
  assert.match(first.summary, new RegExp(`bills from day ${BILL_FROM_DAY}; heads-ups sent 0`));

  const later = fakeBilling();
  const run = await runRunningCosts({ billing: later, registry, meters, now: () => new Date("2026-12-03T03:00:00Z") });
  assert.deepEqual(later.calls.map(([kind, args]) => [kind, args.month]), [["bill", "2026-11"], ["alerts", "2026-12"]]);
  assert.deepEqual(later.calls[0][1].costs, { "moth-press": 207 });
  assert.equal(run.summary, "2026-11: billed 1, waiting for costs 0; heads-ups sent 0");
});
