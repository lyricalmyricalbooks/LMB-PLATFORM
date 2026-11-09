// The Chit Chats morning note: the platform owner hears, once, about each paid order that passed three days without
// tracking or ran into a problem in the last day. Nothing new, no email; twice in a day, one email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHITCHATS_NOTE, chitChatsNote } from "./chitChatsNote.js";
import { fakeChitChatsStores } from "../services/apps/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { TEMPLATES } from "../services/email/templates.js";
import { platformSettings } from "../services/settings.js";
import { JOBS } from "../services/jobs/index.js";
import { RUNNERS } from "../server/jobs.js";
import { FIXED_TIMES } from "../server/schedules.js";

const NOW = new Date("2026-11-20T13:15:00Z");
const HOUR = 3_600_000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR).toISOString();
const registry = { getShop: async (shopId) => ({ "moth-press": { pressName: "Moth Press" }, kestrel: { pressName: "Kestrel Books" } })[shopId] ?? null };

async function stores() {
  const s = fakeChitChatsStores();
  for (const shopId of ["moth-press", "kestrel", "quiet"]) await s.connections.put(shopId, { shopId });
  const ship = (id, row) => s.shipments.put(id, { id, ...row });
  await ship("m1", { shopId: "moth-press", orderNumber: "1041", status: "open", createdAt: ago(80) }); // went late 8 hours ago
  await ship("m2", { shopId: "moth-press", orderNumber: "1039", status: "open", createdAt: ago(100) }); // late since yesterday
  await ship("m3", { shopId: "moth-press", orderNumber: "1050", status: "open", createdAt: ago(20) }); // not late yet
  await ship("k1", { shopId: "kestrel", orderNumber: "77", status: "problem", problem: "The order has no full shipping address.", createdAt: ago(30), updatedAt: ago(2) });
  await ship("k2", { shopId: "kestrel", orderNumber: "70", status: "problem", problem: "Old problem.", createdAt: ago(200), updatedAt: ago(150) });
  await ship("q1", { shopId: "quiet", orderNumber: "5", status: "sent", createdAt: ago(90) });
  return s;
}

test("names each order on the day it goes wrong: late ones that crossed three days, and new problems, problems first", async () => {
  const email = fakePlatformEmail();
  const s = await stores();
  assert.deepEqual(await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => NOW }), { sent: true, shops: 2 });
  await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => new Date(NOW.getTime() + HOUR) });
  const sent = email.list();
  assert.equal(sent.length, 1, "a retry the same day sends nothing more");
  assert.equal(sent[0].kind, CHITCHATS_NOTE);
  assert.equal(sent[0].to, "owner@example.com");
  assert.equal(sent[0].idempotencyKey, `${CHITCHATS_NOTE}-2026-11-20`);
  assert.deepEqual(sent[0].data.shops.map((x) => [x.pressName, x.late, x.problems.map((p) => p.order)]), [["Kestrel Books", [], ["77"]], ["Moth Press", ["1041"], []]]);
  assert.equal(sent[0].data.stillLate, 1);
  const mail = TEMPLATES[CHITCHATS_NOTE](sent[0].data, { settings: platformSettings({}) });
  assert.equal(mail.subject, "Chit Chats: 1 order waiting for tracking, 1 order with a problem");
  assert.match(mail.text, /Moth Press \(moth-press\): 1 order passed 3 days without a tracking number: 1041\./);
  assert.match(mail.text, /Kestrel Books \(kestrel\): order 77 ran into a problem: The order has no full shipping address\./);
  assert.match(mail.text, /1 order from before is still waiting too\./);
  assert.ok(!/Old problem|1039|1050/.test(mail.text), "only what went wrong in the last day is named");
});

test("nothing new: no email, even with nobody to tell; something new and nobody to tell: the run fails", async () => {
  const email = fakePlatformEmail();
  const s = await stores();
  const tomorrow = () => new Date(NOW.getTime() + 30 * HOUR);
  assert.equal((await chitChatsNote({ stores: s, registry, email, to: null, now: tomorrow })).sent, false);
  await assert.rejects(chitChatsNote({ stores: s, registry, email, to: null, now: () => NOW }), /PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO/);
  assert.equal(email.list().length, 0);
});

test("a daily job in the morning that goes to PLATFORM_ADMIN_EMAIL, else the alert address", async () => {
  assert.equal(JOBS.find((j) => j.name === "chitchats-note").every, 24 * 60);
  assert.equal(FIXED_TIMES["chitchats-note"], "15 8 * * *");
  for (const [env, to] of [[{ PLATFORM_ADMIN_EMAIL: "julian@example.com", HEALTH_ALERT_TO: "alerts@example.com" }, "julian@example.com"], [{ HEALTH_ALERT_TO: "alerts@example.com" }, "alerts@example.com"]]) {
    const email = fakePlatformEmail();
    await RUNNERS["chitchats-note"]({ parts: { env, email, registry, chitchatsStores: await stores(), now: () => NOW } })();
    assert.equal(email.list()[0].to, to);
  }
});
