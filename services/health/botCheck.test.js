import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_AT, FREE_AMOUNT, runBotCheckWatch } from "./botCheck.js";
import { fakeGoogle, fakeRegistry } from "../../setup/fakes.js";
import { fakePlatformState } from "../../control-room/fakes.js";

async function world(counts) {
  const google = fakeGoogle();
  const registry = fakeRegistry();
  for (const [shopId, count] of Object.entries(counts)) {
    await registry.createShop(shopId, { shopId, projectId: shopId, status: "live" });
    google.world.assessments.set(shopId, count);
  }
  const sent = [];
  const notify = { sendPlatform: async (mail) => void sent.push(mail) };
  return { google, registry, sent, notify, platformState: fakePlatformState() };
}
const NOW = () => new Date("2026-11-20T12:00:00Z");

test("under 8,000 across all shops: the total is saved and nobody is emailed", async () => {
  const w = await world({ "moth-press": 3000, "fern-books": 4000 });
  const result = await runBotCheckWatch({ ...w, config: { alertTo: "alerts@example.com" }, now: NOW });
  assert.deepEqual([result.total, result.level, result.month], [7000, "ok", "2026-11"]);
  assert.equal(w.sent.length, 0);
  assert.equal((await w.platformState.get("botCheck")).byShop["fern-books"], 4000);
});

test("at 8,000 the platform is emailed once for the month, not on every run", async () => {
  const w = await world({ "moth-press": 5000, "fern-books": ALERT_AT - 5000 });
  const config = { alertTo: "alerts@example.com" };
  assert.equal((await runBotCheckWatch({ ...w, config, now: NOW })).level, "alert");
  await runBotCheckWatch({ ...w, config, now: NOW });
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].idempotencyKey, "bot-check-2026-11");
  assert.match(w.sent[0].data.detail, /8000 bot check assessments/);
  // next month it can alert again
  await runBotCheckWatch({ ...w, config, now: () => new Date("2026-12-10T12:00:00Z") });
  assert.equal(w.sent.length, 2);
});

test("past the free amount the level is over; a shop that can't be counted is listed, not guessed", async () => {
  const w = await world({ "moth-press": FREE_AMOUNT + 1, "fern-books": 0 });
  w.google.monitoring.assessments = async (id) => { if (id === "fern-books") throw new Error("monitoring is off"); return FREE_AMOUNT + 1; };
  const result = await runBotCheckWatch({ ...w, config: {}, now: NOW });
  assert.equal(result.level, "over");
  assert.deepEqual(result.failed, ["fern-books"]);
  assert.equal(w.sent.length, 0, "no alert address, no email");
});

test("a shop that isn't live yet is not counted", async () => {
  const w = await world({ "moth-press": 100 });
  await w.registry.createShop("new-press", { shopId: "new-press", status: "creating" });
  w.google.world.assessments.set("new-press", 9000);
  assert.equal((await runBotCheckWatch({ ...w, config: {}, now: NOW })).total, 100);
});
