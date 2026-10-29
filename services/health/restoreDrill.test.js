import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { DRILL_COLLECTIONS, countsMatch, runRestoreDrill } from "./restoreDrill.js";
import { runHealth } from "./runner.js";

const row = (shopId, extra = {}) => ({ shopId, projectId: shopId, pressName: `Press ${shopId}`, plan: "both", status: "live", testMode: false, testShop: false, ...extra });
const NOW = new Date("2026-11-03T12:00:00Z");

async function setup({ rows = [row("press-a"), row("press-b")], restored = {}, live = {}, backups = ["press-a", "press-b"], failRestore = false, failRemove = false, failSend = false } = {}) {
  const registry = fakeRegistry();
  for (const r of rows) await registry.createShop(r.shopId, r);
  const calls = [];
  const alerts = [];
  const world = {
    registry, calls, alerts,
    backups: {
      latest: async (id) => (backups.includes(id) ? { name: "backups/2026-11-02/" } : null),
      restoreScratch: async (id) => { calls.push(["restore", id]); if (failRestore) throw new Error("PERMISSION_DENIED"); return { database: "drill-2026-11-03" }; },
      removeScratch: async (id, db) => { calls.push(["remove", id, db]); if (failRemove) throw new Error("busy"); },
    },
    firestore: { count: async (id, db, collection) => (db === "(default)" ? live[id]?.[collection] ?? 50 : restored[id]?.[collection] ?? 50) },
    notify: { sendPlatform: async (message) => { if (failSend) throw new Error("mail down"); alerts.push(message); } },
    config: { alertTo: "alerts@example.com" },
    now: () => NOW,
  };
  world.run = (extra = {}) => runRestoreDrill({ ...world, ...extra });
  return world;
}

test("counts match within 10%, at least 5 documents, and never zero against a live shop with documents", () => {
  assert.equal(countsMatch(50, 50), true);
  assert.equal(countsMatch(46, 50), true);
  assert.equal(countsMatch(40, 50), false);
  assert.equal(countsMatch(0, 3), false);
  assert.equal(countsMatch(0, 0), true);
  assert.equal(countsMatch(9, 4), true);
});

test("a good backup passes: one shop is restored, counted and cleaned up, and the result is on its row", async () => {
  const w = await setup();
  const result = await w.run();
  assert.deepEqual([result.ran, result.ok, result.shopId], [true, true, "press-a"]);
  assert.deepEqual(w.calls, [["restore", "press-a"], ["remove", "press-a", "drill-2026-11-03"]]);
  const saved = (await w.registry.getShop("press-a")).restoreDrill;
  assert.equal(saved.ok, true);
  assert.deepEqual(Object.keys(saved.counts), DRILL_COLLECTIONS);
  assert.equal(w.alerts.length, 0);
  assert.equal((await w.registry.getShop("press-a")).health.checks.drill.ok, true);
});

test("a missing order fails: the shop shows a problem and an alert goes to the owner", async () => {
  const w = await setup({ restored: { "press-a": { orders: 30 } }, live: { "press-a": { orders: 50 } } });
  const result = await w.run();
  assert.equal(result.ok, false);
  assert.match(result.detail, /orders: 30 restored, 50 live/);
  const shop = await w.registry.getShop("press-a");
  assert.equal(shop.health.ok, false);
  assert.equal(shop.health.checks.drill.ok, false);
  assert.deepEqual(w.alerts.map((a) => [a.kind, a.data.check, a.data.state]), [["health-alert", "drill", "failing"]]);
  assert.deepEqual(w.calls.at(-1), ["remove", "press-a", "drill-2026-11-03"], "the scratch copy is removed even when the counts are wrong");
});

test("a restore that fails is a failed drill, and a scratch copy that stays is reported", async () => {
  const bad = await setup({ failRestore: true });
  const result = await bad.run();
  assert.match(result.detail, /couldn't restore: PERMISSION_DENIED/);
  assert.equal(bad.calls.some(([kind]) => kind === "remove"), false, "nothing was made, so nothing is removed");
  const stuck = await setup({ failRemove: true });
  assert.match((await stuck.run()).detail, /drill-2026-11-03 was not removed: busy/);
});

test("it runs once a month: not again within 28 days, then the shop drilled longest ago goes next", async () => {
  const w = await setup();
  assert.equal((await w.run()).shopId, "press-a");
  assert.deepEqual(await w.run(), { ran: false, reason: "the last drill was less than a month ago" });
  const later = await w.run({ now: () => new Date("2026-12-02T12:00:00Z") });
  assert.equal(later.shopId, "press-b");
});

test("a shop with no backup is skipped, and with none at all nothing runs", async () => {
  const w = await setup({ backups: ["press-b"] });
  assert.equal((await w.run()).shopId, "press-b");
  const none = await setup({ backups: [] });
  assert.deepEqual(await none.run(), { ran: false, reason: "no live shop has a backup to test yet" });
  assert.equal(none.calls.length, 0);
});

test("the five-minute health run keeps the drill's result and never touches the live shop's data", async () => {
  const w = await setup({ restored: { "press-a": { orders: 30 } }, live: { "press-a": { orders: 50 } } });
  await w.run();
  const checks = { pages: async () => ({ ok: true }) };
  await runHealth({ registry: w.registry, checks: { pages: async () => ({ ok: true }), checkout: async () => ({ ok: true }), webhook: async () => ({ ok: true }), backup: async () => ({ ok: true }), ...checks }, notify: w.notify, config: { alertTo: "a@example.com" }, now: w.now });
  const shop = await w.registry.getShop("press-a");
  assert.equal(shop.health.checks.drill.ok, false);
  assert.equal(shop.health.ok, false);
});

test("an alert that can't be sent is left to try again, not lost", async () => {
  const w = await setup({ restored: { "press-a": { orders: 10 } }, failSend: true });
  await w.run();
  assert.equal((await w.registry.getShop("press-a")).health.checks.drill.alertedAt, undefined);
});
