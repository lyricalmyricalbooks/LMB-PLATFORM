// The weekly deletion note: once a week, the platform owner hears which closed apps' records go within the week, and
// which are past their date and stuck. Nothing due, no email; twice in one week, one email; nobody to tell, a failed run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DELETION_NOTE, dueForDeletion, isoWeek, weeklyDeletionNote } from "./deletionNote.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { TEMPLATES } from "../services/email/templates.js";
import { platformSettings } from "../services/settings.js";
import { JOBS } from "../services/jobs/index.js";
import { RUNNERS } from "../server/jobs.js";

const NOW = new Date("2026-11-23T13:00:00Z"); // a Monday
const DAY = 86_400_000;
const on = (days) => new Date(NOW.getTime() + days * DAY).toISOString();
const closedShop = (shopId, app, entry, extra = {}) => ({ shopId, pressName: `${shopId} press`, ownerEmail: `${shopId}@example.com`, plan: app === "shop" ? "stockroom" : "shop", closedApps: { [app]: { closedAt: on(-85), ...entry } }, ...extra });

const rows = [
  closedShop("soon", "stockroom", { downloadUntil: on(4), warnedAt: on(-1) }),
  closedShop("stuck", "shop", { downloadUntil: on(-2), warnedAt: on(-5), problem: "Deleting needs the server's Google access." }, { closingEmailBounce: { kind: "app-download-ending", at: on(-5) } }),
  closedShop("later", "stockroom", { downloadUntil: on(20) }),
  closedShop("gone", "stockroom", { downloadUntil: on(-10), warnedAt: on(-13), deletedAt: on(-7) }),
  closedShop("back", "stockroom", { downloadUntil: on(2) }, { plan: "both" }),
  closedShop("platform-test", "stockroom", { downloadUntil: on(1) }, { testShop: true }),
];
const registryOf = (list) => ({ listShops: async () => structuredClone(list) });

test("lists what goes within the week, stuck ones first; not later ones, deleted ones, re-added ones or the test shop", () => {
  assert.deepEqual(dueForDeletion(rows, NOW).map((c) => [c.shopId, c.overdue]), [["stuck", true], ["soon", false]]);
});

test("one email a week to the platform owner, with each press, its app, the date and whether the press was told", async () => {
  const email = fakePlatformEmail();
  const first = await weeklyDeletionNote({ registry: registryOf(rows), email, to: "owner@example.com", now: () => NOW });
  assert.deepEqual(first, { sent: true, listed: 2 });
  await weeklyDeletionNote({ registry: registryOf(rows), email, to: "owner@example.com", now: () => new Date(NOW.getTime() + 2 * DAY) });
  const sent = email.list();
  assert.equal(sent.length, 1, "a retry in the same week sends nothing more");
  assert.equal(sent[0].kind, DELETION_NOTE);
  assert.equal(sent[0].to, "owner@example.com");
  assert.equal(sent[0].idempotencyKey, `${DELETION_NOTE}-2026-W48`);
  const mail = TEMPLATES[DELETION_NOTE](sent[0].data, { settings: platformSettings({}) });
  assert.equal(mail.subject, "2 closed apps to be deleted this week (1 overdue)");
  assert.match(mail.text, /stuck press \(stuck, stuck@example\.com\): Website\. Its download ended .* still waiting to be deleted: Deleting needs the server's Google access\./);
  assert.match(mail.text, /but a closing email bounced/);
  assert.match(mail.text, /soon press \(soon, soon@example\.com\): Stockroom\. Its download ends .*; its records are deleted after that\. The last-days email went out /);
  // The next week is a new note.
  await weeklyDeletionNote({ registry: registryOf(rows), email, to: "owner@example.com", now: () => new Date(NOW.getTime() + 7 * DAY) });
  assert.equal(email.list().length, 2);
});

test("nothing due: no email, even with nobody to tell; something due and nobody to tell: the run fails", async () => {
  const email = fakePlatformEmail();
  assert.deepEqual(await weeklyDeletionNote({ registry: registryOf([rows[2]]), email, to: null, now: () => NOW }), { sent: false, listed: 0, why: "nothing is due for deletion this week" });
  await assert.rejects(weeklyDeletionNote({ registry: registryOf(rows), email, to: null, now: () => NOW }), /PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO/);
  assert.equal(email.list().length, 0);
});

test("the weeks are ISO weeks, and the job runs weekly on the hosted server", () => {
  assert.equal(isoWeek(new Date("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
  assert.equal(isoWeek(new Date("2026-11-29T23:00:00Z")), "2026-W48");
  assert.equal(JOBS.find((j) => j.name === "deletion-note").every, 7 * 24 * 60);
  assert.equal(typeof RUNNERS["deletion-note"], "function");
});

test("on the hosted server the note goes to PLATFORM_ADMIN_EMAIL, else to the alert address", async () => {
  for (const [env, to] of [[{ PLATFORM_ADMIN_EMAIL: "julian@example.com", HEALTH_ALERT_TO: "alerts@example.com" }, "julian@example.com"], [{ HEALTH_ALERT_TO: "alerts@example.com" }, "alerts@example.com"]]) {
    const email = fakePlatformEmail();
    await RUNNERS["deletion-note"]({ parts: { env, email, registry: registryOf(rows), now: () => NOW } })();
    assert.equal(email.list()[0].to, to);
  }
});
