import { TIERED_PRICES_ENV } from "../services/billing/fakes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { KIND_WORDS, createShopEmails, emailsSummary, kindWords, shopEmailsRoutes, SHOWN } from "./shopEmails.js";
import { TEMPLATES } from "../services/email/templates.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeRegistry } from "../setup/fakes.js";
import { fakeSentLog } from "../services/email/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const SHOP = "moth-press";
const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

test("this month's receipts, sends and failures; older months don't count", () => {
  const entries = [
    { kind: "bill-paid", status: "sent", at: "2026-11-15T10:00:00Z", platform: true },
    { kind: "trial-ending", status: "failed", error: "Resend said 422", at: "2026-11-10T10:00:00Z", platform: true },
    { kind: "payment-received", status: "sent", at: "2026-11-02T10:00:00Z", platform: true },
    { kind: "bill-paid", status: "sent", at: "2026-10-15T10:00:00Z", platform: true },
  ];
  const summary = emailsSummary(entries, NOW);
  assert.deepEqual([summary.receiptsThisMonth, summary.sentThisMonth, summary.failedThisMonth], [2, 2, 1]);
  assert.equal(summary.lastReceiptAt, "2026-11-15T10:00:00Z");
  assert.deepEqual(summary.emails[1], { kind: "trial-ending", words: "Trial ending", at: "2026-11-10T10:00:00Z", sent: false, error: "Resend said 422" });
  assert.equal(summary.more, 0);
  assert.equal(emailsSummary(Array.from({ length: SHOWN + 5 }, () => entries[0]), NOW).more, 5);
});

test("every named kind is a real platform email, and an unknown kind still reads", () => {
  for (const kind of Object.keys(KIND_WORDS)) assert.ok(TEMPLATES[kind], kind);
  assert.equal(kindWords("some-new-kind"), "Some new kind");
  // Every email a press can get has a plain name on its record (the platform team's own emails never show there).
  const teamOnly = new Set(["health-alert", "backup-access-used", "recovery-new", "support-new", "job-late", "apps-deleting-soon", "chitchats-late", "switch-stuck", "weekly-summary"]);
  for (const kind of Object.keys(TEMPLATES)) if (!teamOnly.has(kind)) assert.ok(KIND_WORDS[kind], `${kind} has no plain name`);
});

test("the door: platform admins only, a real shop; the shop's shopper emails are never listed", async () => {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, status: "live" });
  const emailLog = fakeSentLog();
  await emailLog.put("k1", { shopId: SHOP, kind: "bill-paid", status: "sent", at: "2026-11-15T10:00:00Z", platform: true });
  await emailLog.put("k2", { shopId: SHOP, kind: "order-receipt", status: "sent", at: "2026-11-16T10:00:00Z" });
  const desk = createShopEmails({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, emailLog, now: () => NOW });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings(TIERED_PRICES_ENV), routes: shopEmailsRoutes(desk), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/shop-emails", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await ask(ADMIN, { shopId: "nope" })).status, 404);
  const answer = await ask(ADMIN, { shopId: SHOP });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.emails.map((m) => m.kind), ["bill-paid"]);
  assert.equal(answer.body.receiptsThisMonth, 1);
  const none = createShopEmails({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, now: () => NOW });
  assert.equal((await none.forShop(ADMIN, { shopId: SHOP })).emails, null);
});
