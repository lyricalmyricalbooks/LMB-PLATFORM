// The Chit Chats morning note: the platform owner hears, once, about each paid order that passed three days without
// tracking or ran into a problem in the last day, and each press hears about its own. Nothing new, no email; twice in a
// day, one email each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHITCHATS_NOTE, PRESS_NOTE, chitChatsNote } from "./chitChatsNote.js";
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
const SHOPS = { "moth-press": { pressName: "Moth Press", ownerEmail: "moth@example.com" }, kestrel: { pressName: "Kestrel Books", ownerEmail: "kestrel@example.com" } };
const registry = {
  getShop: async (shopId) => SHOPS[shopId] ?? null,
  getProfile: async (shopId) => (shopId === "moth-press" ? { siteUrl: "https://moth-press.web.app" } : null),
};
const owners = (email) => email.list().filter((m) => m.kind === CHITCHATS_NOTE);
const presses = (email) => email.list().filter((m) => m.kind === PRESS_NOTE);

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
  assert.deepEqual(await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => NOW }), { sent: true, shops: 2, pressesTold: 2 });
  await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => new Date(NOW.getTime() + HOUR) });
  const sent = owners(email);
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
  assert.ok(!("shop" in sent[0].data.shops[0]), "the shop's record stays out of the email");
});

test("each press hears about its own orders, once a day, in its own words", async () => {
  const email = fakePlatformEmail();
  const s = await stores();
  await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => NOW });
  await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => new Date(NOW.getTime() + HOUR) });
  const sent = presses(email);
  assert.deepEqual(sent.map((m) => [m.to, m.shopId, m.idempotencyKey]).sort(), [
    ["kestrel@example.com", "kestrel", `${PRESS_NOTE}-kestrel-2026-11-20`],
    ["moth@example.com", "moth-press", `${PRESS_NOTE}-moth-press-2026-11-20`],
  ]);
  const moth = sent.find((m) => m.shopId === "moth-press");
  assert.deepEqual([moth.data.late, moth.data.problems, moth.data.link], [["1041"], [], "https://moth-press.web.app/admin#orders"]);
  const mail = TEMPLATES[PRESS_NOTE](moth.data, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.equal(mail.subject, "1 order still waiting to ship");
  assert.match(mail.text, /A paid order has waited 3 days without a tracking number: 1041\./);
  const kestrel = TEMPLATES[PRESS_NOTE](sent.find((m) => m.shopId === "kestrel").data, { settings: platformSettings({}), pressName: "Kestrel Books" });
  assert.equal(kestrel.subject, "1 order Chit Chats couldn't take");
  assert.match(kestrel.text, /Chit Chats couldn't take order 77: The order has no full shipping address\./);
  assert.ok(!/See your orders/.test(kestrel.text), "no link without the shop's address");
  assert.match(kestrel.text, /To stop these emails, open Chit Chats in Settings › Apps\./);
});

test("a press that turned the email off isn't emailed, but the owner's note still names it", async () => {
  const email = fakePlatformEmail();
  const s = await stores();
  await s.connections.put("kestrel", { shopId: "kestrel", emailsOff: true });
  assert.equal((await chitChatsNote({ stores: s, registry, email, to: "owner@example.com", now: () => NOW })).pressesTold, 1);
  assert.deepEqual(presses(email).map((m) => m.shopId), ["moth-press"]);
  assert.deepEqual(owners(email)[0].data.shops.map((x) => x.shopId).sort(), ["kestrel", "moth-press"]);
  assert.ok(!("emailsOff" in owners(email)[0].data.shops[0]));
});

test("a press with no owner or a closed shop isn't emailed, and one failed email stops nothing", async () => {
  const s = await stores();
  const base = fakePlatformEmail();
  const email = { list: base.list, sendPlatform: async (m) => { if (m.shopId === "kestrel") throw new Error("bounced"); return base.sendPlatform(m); } };
  const quiet = { ...registry, getShop: async (shopId) => (shopId === "moth-press" ? { ...SHOPS["moth-press"], status: "closed" } : SHOPS[shopId] ?? null) };
  const errors = [];
  const was = console.error;
  console.error = (line) => errors.push(line);
  try {
    assert.equal((await chitChatsNote({ stores: s, registry: quiet, email, to: "owner@example.com", now: () => NOW })).pressesTold, 0);
  } finally {
    console.error = was;
  }
  assert.equal(presses(base).length, 0);
  assert.equal(owners(base).length, 1, "the owner's note still goes");
  assert.match(errors.join(" "), /kestrel: bounced/);
});

test("nothing new: no email, even with nobody to tell; something new and nobody to tell: the presses hear, the run fails", async () => {
  const email = fakePlatformEmail();
  const s = await stores();
  const tomorrow = () => new Date(NOW.getTime() + 30 * HOUR);
  assert.equal((await chitChatsNote({ stores: s, registry, email, to: null, now: tomorrow })).sent, false);
  await assert.rejects(chitChatsNote({ stores: s, registry, email, to: null, now: () => NOW }), /PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO/);
  assert.equal(owners(email).length, 0);
  assert.equal(presses(email).length, 2, "the presses still hear");
});

test("a daily job in the morning that goes to PLATFORM_ADMIN_EMAIL, else the alert address", async () => {
  assert.equal(JOBS.find((j) => j.name === "chitchats-note").every, 24 * 60);
  assert.equal(FIXED_TIMES["chitchats-note"], "15 8 * * *");
  for (const [env, to] of [[{ PLATFORM_ADMIN_EMAIL: "julian@example.com", HEALTH_ALERT_TO: "alerts@example.com" }, "julian@example.com"], [{ HEALTH_ALERT_TO: "alerts@example.com" }, "alerts@example.com"]]) {
    const email = fakePlatformEmail();
    await RUNNERS["chitchats-note"]({ parts: { env, email, registry, chitchatsStores: await stores(), now: () => NOW } })();
    assert.equal(owners(email)[0].to, to);
  }
});
