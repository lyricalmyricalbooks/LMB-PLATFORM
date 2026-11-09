// The stuck-switch note: the platform owner hears, once, about each card switch that passed two days without
// finishing. Nothing new, no email; the test shop and closed shops are left out; twice in a day, one email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SWITCH_NOTE, switchNote } from "./switchNote.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { TEMPLATES } from "../services/email/templates.js";
import { platformSettings } from "../services/settings.js";
import { JOBS } from "../services/jobs/index.js";
import { RUNNERS } from "../server/jobs.js";
import { FIXED_TIMES } from "../server/schedules.js";

const NOW = new Date("2026-11-20T08:20:00Z");
const HOUR = 3_600_000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR).toISOString();
const switching = (since, extra = {}) => ({ payments: { provider: "stripe", accountId: "acct_1", next: { provider: "square", accountId: "MLR1" }, switching: { to: "square", accountId: "MLR1", at: since } }, ...extra });
const ROWS = [
  { shopId: "wren", pressName: "Wren Press", status: "live", ...switching(ago(53), { paymentsSwitchProblem: { message: "Deploys aren't connected on this server yet." } }) },
  { shopId: "moth-press", pressName: "Moth Press", status: "live", ...switching(ago(30)) }, // not two days yet
  { shopId: "kestrel", pressName: "Kestrel Books", status: "live", ...switching(ago(100)) }, // named on an earlier day
  { shopId: "lmb-test-shop", pressName: "Test Press", status: "live", testShop: true, ...switching(ago(50)) },
  { shopId: "gone", pressName: "Gone Press", status: "closed", ...switching(ago(50)) },
  { shopId: "plain", pressName: "Plain Press", status: "live", payments: { provider: "stripe", accountId: "acct_2" } },
];
const registry = (rows = ROWS) => ({ listShops: async () => rows });

test("names each switch once, on the day it passes two days, with its last problem", async () => {
  const email = fakePlatformEmail();
  const result = await switchNote({ registry: registry(), email, to: "owner@example.com", now: () => NOW });
  assert.deepEqual(result, { sent: true, shops: 1 });
  const [sent] = email.list();
  assert.equal(sent.kind, SWITCH_NOTE);
  assert.equal(sent.to, "owner@example.com");
  assert.equal(sent.idempotencyKey, "switch-stuck-2026-11-20");
  assert.deepEqual(sent.data.shops.map((s) => [s.shopId, s.from, s.to, s.problem]), [["wren", "stripe", "square", "Deploys aren't connected on this server yet."]]);
  assert.equal(sent.data.stillWaiting, 1);
  const parts = TEMPLATES[SWITCH_NOTE](sent.data, { settings: platformSettings({}) });
  assert.match(parts.subject, /Wren Press/);
  assert.match(parts.text, /Wren Press \(wren\): Stripe to Square, started November 17, 2026\. Last try: Deploys aren't connected/);
  assert.match(parts.text, /1 older switch is still waiting too/);

  await switchNote({ registry: registry(), email, to: "owner@example.com", now: () => NOW });
  assert.equal(new Set(email.list().map((m) => m.idempotencyKey)).size, 1, "a second run the same day reuses the day's key");
});

test("nothing passed two days: no email, and no address is needed", async () => {
  const email = fakePlatformEmail();
  const result = await switchNote({ registry: registry(ROWS.slice(1)), email, to: null, now: () => NOW });
  assert.equal(result.sent, false);
  assert.equal(email.list().length, 0);
});

test("a switch to name with nobody to tell fails, so the jobs page shows it", async () => {
  await assert.rejects(switchNote({ registry: registry(), email: fakePlatformEmail(), to: null, now: () => NOW }), /nobody to go to/);
});

test("runs every morning as a job, to the owner's address", async () => {
  assert.equal(JOBS.find((j) => j.name === "switch-note").every, 24 * 60);
  assert.equal(FIXED_TIMES["switch-note"], "20 8 * * *");
  const email = fakePlatformEmail();
  await RUNNERS["switch-note"]({ parts: { env: { PLATFORM_ADMIN_EMAIL: "owner@example.com" }, email, registry: registry(), now: () => NOW } })();
  assert.equal(email.list()[0].to, "owner@example.com");
});
