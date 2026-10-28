import { test } from "node:test";
import assert from "node:assert/strict";
import { refusal, runReleaseCheck, waiter } from "./runner.js";
import { BOOK, CHECKS } from "./checks.js";
import { fakeClock, fakeTestShop } from "./fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { TEST_SHOP } from "../setup/test-shop.js";
import { TEST_STOCK } from "../setup/test-catalogue.js";

const ID = TEST_SHOP.shopId;
const INBOX = "checks@example.com";

async function setup({ faults, row = {}, orders } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(ID, { shopId: ID, testShop: true, testMode: true, status: "live", ...row });
  const auditLog = fakeAuditLog();
  const shop = fakeTestShop({ faults, orders });
  const clock = fakeClock();
  const lines = [];
  const run = () => runReleaseCheck({
    shopId: ID, version: "1.2.3", registry, auditLog, clients: shop.clients, inbox: INBOX,
    now: clock.now, wait: waiter({ now: clock.now, sleep: clock.sleep }), print: (line) => lines.push(line), runId: "run-1",
  });
  return { registry, auditLog, shop, run, lines };
}

test("the eight checks are numbered in order", () => {
  assert.deepEqual(CHECKS.map((c) => c.number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a healthy test shop passes all eight checks, and the run is logged in the registry and the audit log", async () => {
  const { registry, auditLog, shop, run } = await setup();
  const result = await run();
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.results.map((r) => r.status), Array(8).fill("passed"));
  const { world } = shop;
  // The sale moved both counts, and the refund put both back.
  assert.equal(world.books[BOOK].stockLevel, TEST_STOCK);
  assert.equal(world.stockroom.onHand[BOOK], TEST_STOCK);
  assert.equal(result.results[3].detail.stockroom, TEST_STOCK - 1, "check 4 saw the stockroom count drop");
  // The stockroom was opened as the test owner and closed at the end, with the browser.
  assert.ok(world.calls.includes("openStockroom:owner@example.com"));
  assert.equal(world.stockroom.open, false);
  assert.equal(world.browserClosed, true);
  const [entry] = await registry.readReleaseChecks(ID);
  assert.equal(entry.ok, true);
  assert.equal(entry.version, "1.2.3");
  assert.equal(entry.orderId, "TEST-1");
  assert.deepEqual([...auditLog.entries.get(ID).values()].map((e) => e.kind), ["release-check"]);
});

test("the stockroom is opened before buying when it hasn't published a count yet, and kept open", async () => {
  const { shop, run } = await setup();
  await run();
  const { calls } = shop.world;
  assert.ok(calls.indexOf("openStockroom:owner@example.com") < calls.indexOf("buy"));
  assert.equal(calls.filter((c) => c.startsWith("openStockroom")).length, 1);
});

for (const [fault, failedCheck, words] of [
  ["pages-broken", 1, /shows no price/],
  ["no-payment-event", 3, /the order showing as paid didn't happen within 60 seconds/],
  ["live-payment", 3, /not paid in test mode/],
  ["no-import", 4, /the stockroom bringing the order in didn't happen within 300 seconds/],
  ["no-email", 5, /the order email being sent didn't happen/],
  ["admin-hidden", 6, /didn't list the new order/],
  ["no-refund-event", 7, /the order showing as refunded didn't happen/],
]) {
  test(`a failure stops the check at check ${failedCheck} (${fault}); later checks are not run and the run is logged`, async () => {
    const { registry, auditLog, shop, run } = await setup({ faults: [fault] });
    const result = await run();
    assert.equal(result.ok, false);
    assert.equal(result.failedCheck, failedCheck);
    assert.match(result.error, words);
    assert.deepEqual(result.results.map((r) => r.status), [...Array(failedCheck - 1).fill("passed"), "failed", ...Array(8 - failedCheck).fill("not-run")]);
    assert.equal(shop.world.browserClosed, true, "the browser is closed after a failure too");
    const [entry] = await registry.readReleaseChecks(ID);
    assert.equal(entry.failedCheck, failedCheck);
    assert.equal(auditLog.entries.get(ID).size, 1);
  });
}

test("a press's shop, a shop not in test mode or not live is refused before anything is opened or bought", async () => {
  for (const [row, words] of [[{ testShop: false }, /not the platform's test shop/], [{ testMode: false }, /not in test mode/], [{ status: "creating" }, /not live yet/]]) {
    const { registry, shop, run } = await setup({ row });
    const result = await run();
    assert.equal(result.refused, true);
    assert.match(result.error, words);
    assert.deepEqual(shop.world.calls, []);
    assert.deepEqual(await registry.readReleaseChecks(ID), []);
  }
  assert.match(refusal(null), /no such shop/);
});

test("clean-up removes only test orders paid in test mode and older than seven days", async () => {
  const orders = {
    old: { isTest: true, sandboxPayment: true, createdAt: "2026-10-01T00:00:00Z" },
    recent: { isTest: true, sandboxPayment: true, createdAt: "2026-10-27T00:00:00Z" },
    real: { isTest: false, sandboxPayment: false, createdAt: "2026-09-01T00:00:00Z" },
    oddTest: { isTest: true, createdAt: "2026-09-01T00:00:00Z" },
  };
  const { shop, run } = await setup({ orders });
  const result = await run();
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.results[7].detail, { removed: 1 });
  assert.deepEqual(Object.keys(shop.world.orders).sort(), ["TEST-1", "oddTest", "real", "recent"]);
});

test("a sold-out test book stops check 2 for a person, before anything is bought", async () => {
  const { shop, run } = await setup();
  shop.world.books[BOOK].stockLevel = 0;
  const result = await run();
  assert.equal(result.failedCheck, 2);
  assert.match(result.error, /sold out; a person restocks/);
  assert.ok(!shop.world.calls.includes("buy"));
});

test("the waiter asks until the answer comes, then stops", async () => {
  const clock = fakeClock();
  let asked = 0;
  const wait = waiter({ now: clock.now, sleep: clock.sleep, everyMs: 1000 });
  assert.equal(await wait("x", async () => (++asked >= 3 ? "yes" : null), { timeoutMs: 10_000 }), "yes");
  assert.equal(asked, 3);
  await assert.rejects(wait("the thing", async () => null, { timeoutMs: 2000 }), /the thing didn't happen within 2 seconds/);
});

test("the inbox address is required", async () => {
  const { registry, auditLog, shop } = await setup();
  await assert.rejects(runReleaseCheck({ shopId: ID, registry, auditLog, clients: shop.clients, inbox: "" }), /test inbox/);
});
