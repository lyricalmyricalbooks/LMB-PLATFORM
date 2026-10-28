import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_STEPS, TIPS, TIP_DAYS, createTrialTips, dueTip, offToken, trialStart } from "./index.js";
import { fakeGuide, fakePlatformEmail, fakeTipStore } from "./fakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { platformSettings } from "../settings.js";

const settings = platformSettings({});
const SECRET = "a-test-secret-of-enough-length";
const START = "2026-11-01T09:00:00.000Z";
const at = (day, hour = 9) => new Date(Date.parse(START) + day * 86_400_000 + (hour - 9) * 3_600_000);
const ALL = ["logo", "look", "add-books", "shipping", "payments", "address", "practice", "open"];

function world({ progress = { steps: ALL, done: [] }, row = {}, guideDoc } = {}) {
  const registry = fakeRegistry();
  const shop = { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", status: "ready", createdAt: START, billing: { status: "trialing", access: "open" }, ...row };
  registry.shops.set(shop.shopId, shop);
  registry.profiles.set(shop.shopId, { siteUrl: "https://moth-press.web.app", apps: { shop: true, stockroom: false } });
  const auditLog = fakeAuditLog();
  const guide = fakeGuide({ "moth-press": guideDoc === undefined ? { sellingToday: "starting", progress } : guideDoc });
  const email = fakePlatformEmail(settings);
  const store = fakeTipStore();
  let clock = at(0);
  const tips = createTrialTips({ registry, auditLog, guide, email, store, settings, secret: SECRET, now: () => clock });
  const runOn = async (day, hour) => { clock = at(day, hour); return tips.run(); };
  return { registry, auditLog, guide, email, store, tips, runOn };
}

test("days 2, 4, 7, 21 and 60, one tip each, for the next step not done", async () => {
  assert.deepEqual(TIP_DAYS, [2, 4, 7, 21, 60]);
  const w = world();
  for (let day = 0; day <= 70; day++) await w.runOn(day);
  assert.deepEqual(w.email.sent.map((m) => m.idempotencyKey.match(/day-(\d+)/)[1]).map(Number), [2, 4, 7, 21, 60]);
  assert.deepEqual(w.email.sent.map((m) => m.data.subject), [TIPS.logo, TIPS.look, TIPS["add-books"], TIPS.shipping, TIPS.payments].map((t) => t.subject));
  const first = w.email.sent[0];
  assert.equal(first.to, "owner@example.com");
  assert.equal(first.kind, "trial-tip");
  assert.match(first.parts.subject, /^Moth Press: Put your logo/);
  assert.match(first.parts.html, /https:\/\/moth-press\.web\.app\/admin#designer/);
  assert.match(first.parts.text, /Turn them off here: https:\/\/platform\.example\/tips\/off\?shop=moth-press&sig=/);
  // Recorded in the registry and the shop's audit log.
  assert.equal(w.registry.events.get("moth-press").get("trial-tip-day-2").step, "logo");
  assert.equal(w.auditLog.entries.get("moth-press").get("trial-tip-day-60").step, "payments");
});

test("a done step is skipped, and nothing goes once every step is done", async () => {
  const w = world({ progress: { steps: ALL, done: ["logo", "look"] } });
  await w.runOn(2);
  assert.equal(w.email.sent[0].data.subject, TIPS["add-books"].subject);
  w.guide.docs.set("moth-press", { progress: { steps: ALL, done: ALL } });
  const { sent, skipped } = await w.runOn(4);
  assert.equal(sent.length, 0);
  assert.equal(skipped[0].why, "all-done");
});

test("never twice: a re-run the same day, or the next, sends nothing new", async () => {
  const w = world();
  await w.runOn(2);
  await w.runOn(2, 15);
  await w.runOn(3);
  assert.equal(w.email.sent.length, 1);
  assert.equal(dueTip({ day: 2, progress: { steps: ALL, done: [] }, record: { sent: { 2: { step: "logo" } } }, now: at(2) }).why, "already-sent");
});

test("at most one email every two days; a missed run sends the next day, never later", async () => {
  // The day-2 tip went late (day 3), so day 4 is too soon and day 5 sends day 4's tip.
  const w = world();
  await w.runOn(3);
  assert.equal(w.email.sent.length, 1);
  assert.deepEqual((await w.runOn(4)).skipped[0].why, "too-soon");
  await w.runOn(5);
  assert.equal(w.email.sent.length, 2);
  assert.match(w.email.sent[1].idempotencyKey, /day-4$/);
  // A shop first seen on day 9 gets no day-7 tip.
  const late = world();
  assert.equal((await late.runOn(9)).skipped[0].why, "not-a-tip-day");
  assert.equal(late.email.sent.length, 0);
});

test("turned-off tips stop; the off link must be the platform's own; billing emails never pass through here", async () => {
  const w = world();
  assert.deepEqual(await w.tips.turnOff("moth-press", "forged"), { ok: false });
  assert.equal((await w.tips.handleOff(`/tips/off?shop=moth-press&sig=${offToken("another-secret-entirely", "moth-press")}`)).status, 400);
  const page = await w.tips.handleOff(`/tips/off?shop=moth-press&sig=${offToken(SECRET, "moth-press")}`);
  assert.equal(page.status, 200);
  assert.match(page.html, /plan and payments still come/);
  assert.ok([...w.registry.events.get("moth-press").keys()].some((k) => k.startsWith("trial-tips-off-")));
  for (const day of TIP_DAYS) await w.runOn(day);
  assert.equal(w.email.sent.length, 0);
  // The sweep sends only setup tips; the billing emails (trial-ending, card-needed…) are sent by services/billing.
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.deepEqual([...new Set(source.match(/kind: "[a-z-]+"/g))], ['kind: "trial-tip"', 'kind: "trial-tips-off"']);
});

test("an owner who never opened the admin gets the general order; a stockroom-only or test shop and a closed one get none", async () => {
  const fresh = world({ guideDoc: { sellingToday: null } });
  await fresh.runOn(2);
  assert.equal(fresh.email.sent[0].data.subject, TIPS[DEFAULT_STEPS[0]].subject);
  for (const [why, opts] of [
    ["no-guide", { guideDoc: null }],
    ["not-a-trial-shop", { row: { testShop: true } }],
    ["not-a-trial-shop", { row: { status: "closed" } }],
    ["paused", { row: { billing: { status: "paused", access: "paused" } } }],
  ]) {
    const w = world(opts);
    const { skipped } = await w.runOn(2);
    assert.equal(skipped[0].why, why);
    assert.equal(w.email.sent.length, 0);
  }
});

test("the trial starts at the first trial end minus the trial's length, else when the shop was made", () => {
  assert.equal(trialStart({ billing: { trialEnd: "2026-11-15T09:00:00.000Z" } }, 14), "2026-11-01T09:00:00.000Z");
  assert.equal(trialStart({ createdAt: START }, 14), START);
  assert.throws(() => createTrialTips({ secret: "short" }), /signing secret/);
});

test("every step of the shop's setup guide has a tip, in plain words naming no rival", () => {
  const source = readFileSync(new URL("../../apps/shop/src/app/admin/firstWeek.ts", import.meta.url), "utf8");
  const steps = [...source.match(/export type StepId =([^;]+);/)[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(Object.keys(TIPS).sort(), [...steps].sort());
  const words = JSON.stringify(TIPS).toLowerCase();
  for (const bad of ["shopify", "big cartel", "squarespace", "etsy", "wix", "woocommerce", "firebase", "api", "webhook", "dns", "deploy", "secret"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(words), bad);
  }
});
