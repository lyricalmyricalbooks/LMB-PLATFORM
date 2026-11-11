// Failed plan payments (code plan 19.9) in the control room: shops whose plan payment is failing, unpaid or paused for a
// card, with days since and days left before the shop closes (the closing sweep's 60 days, then 90 to download),
// most urgent first; the test shop and closed shops left out; admins only, through the platform's door.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentTrouble } from "./paymentTrouble.js";
import { businessRoutes, createBusinessRoom } from "./business.js";
import { DOWNLOAD_DAYS, PAUSED_DAYS } from "../services/billing/closing.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const shop = (shopId, billing, extra = {}) => ({ shopId, pressName: shopId, ownerEmail: `${shopId}@example.com`, billing, ...extra });

const rows = [
  shop("retrying-new", { status: "past_due", access: "open", troubleSince: ago(2) }),
  shop("retrying-old", { status: "past_due", access: "open", troubleSince: ago(9) }),
  shop("paused-long", { status: "paused", access: "paused", hasCard: false, troubleSince: ago(55) }, { closing: { stage: "paused", pausedAt: ago(50) } }),
  shop("unpaid-new", { status: "unpaid", access: "paused", hasCard: true, troubleSince: ago(4) }),
  shop("fine", { status: "active", access: "open" }),
  shop("trial", { status: "trialing", access: "open" }),
  shop("closed", { status: "canceled", access: "closed" }, { closing: { stage: "closed" } }),
  shop("platform-test", { status: "past_due", access: "open", troubleSince: ago(30) }, { testShop: true }),
];

test("most urgent first: the shops closing soonest, then payments still being tried, longest first", () => {
  const list = paymentTrouble(rows, NOW);
  assert.deepEqual(list.map((s) => [s.shopId, s.daysSince, s.daysLeft]), [
    ["paused-long", 50, PAUSED_DAYS - 50],
    ["unpaid-new", 4, PAUSED_DAYS - 4],
    ["retrying-old", 9, null],
    ["retrying-new", 2, null],
  ]);
  const paused = list[0];
  assert.equal(paused.state, "Paused for a card");
  assert.equal(paused.since, ago(50), "the closing sweep's own pause date wins");
  assert.equal(paused.closesAt, new Date(Date.parse(ago(50)) + PAUSED_DAYS * DAY).toISOString());
  assert.equal(paused.downloadUntil, new Date(Date.parse(paused.closesAt) + DOWNLOAD_DAYS * DAY).toISOString());
  assert.deepEqual([list[2].state, list[2].open, list[2].closesAt], ["Payment failing", true, null]);
  assert.equal(list[1].state, "Unpaid");
  assert.deepEqual(paymentTrouble([], NOW), []);
});

test("GET /api/control/payment-trouble is for platform admins only", async () => {
  const registry = fakeRegistry();
  for (const row of rows) await registry.createShop(row.shopId, row);
  const room = createBusinessRoom({ registry, admins: ["admin@example.com"], now: () => NOW });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: businessRoutes(room) });
  const ask = (claims) => api({ method: "GET", path: "/api/control/payment-trouble", headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  assert.equal((await ask(null)).status, 401);
  assert.equal((await ask({ uid: "p", email: "owner@example.com", email_verified: true })).status, 403);
  const admin = { uid: "a", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
  const answer = await ask(admin);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.shops.map((s) => s.shopId), ["paused-long", "unpaid-new", "retrying-old", "retrying-new"]);
});

test("POST /api/control/payment-reminder sends through billing, logs it, and says why when it can't", async () => {
  const registry = fakeRegistry();
  const asked = [];
  const logged = [];
  const billing = { remindPayment: async ({ shopId }) => { asked.push(shopId); return shopId === "owing" ? { sent: true, to: "press@example.com", kind: "payment-failed" } : { sent: false, why: "Nothing is owed on this shop's plan." }; } };
  const room = createBusinessRoom({ registry, admins: ["admin@example.com"], billing, activity: { record: async (e) => logged.push(e) }, now: () => NOW });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: businessRoutes(room) });
  const admin = { uid: "a", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/payment-reminder", headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {}, body });
  assert.equal((await ask({ uid: "p", email: "owner@example.com", email_verified: true }, { shopId: "owing" })).status, 403);
  assert.equal(asked.length, 0);
  const ok = await ask(admin, { shopId: "owing" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.to, "press@example.com");
  assert.deepEqual(logged.map((e) => [e.what, e.shopId]), [["payment-reminder", "owing"]]);
  const refused = await ask(admin, { shopId: "fine" });
  assert.equal(refused.status, 409);
  assert.equal(logged.length, 1);
});

test("each failed payment says whether a reminder fits, when the last one went, and when there's no billing email", () => {
  const list = paymentTrouble([
    shop("reminded", { status: "past_due", access: "open", troubleSince: ago(5), remindedAt: ago(1) }),
    shop("old-reminder", { status: "past_due", access: "open", troubleSince: ago(2), remindedAt: ago(40) }),
    shop("no-email", { status: "past_due", access: "open", troubleSince: ago(3), noBillingEmail: true }),
    shop("paused", { status: "paused", access: "paused", troubleSince: ago(3) }),
  ], NOW);
  const by = Object.fromEntries(list.map((s) => [s.shopId, s]));
  assert.equal(by.reminded.remindedAt, ago(1));
  assert.equal(by["old-reminder"].remindedAt, null, "a reminder from an earlier problem doesn't count");
  assert.deepEqual([by["no-email"].noBillingEmail, by["no-email"].canRemind], [true, true]);
  assert.equal(by.paused.canRemind, false);
});
