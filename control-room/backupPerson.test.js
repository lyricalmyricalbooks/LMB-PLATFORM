// The backup person (plan 8.7): sealed emergency access limited to the run book, every use logged and emailed to
// Julian's address. Against pretend releases, a pretend status page and a pretend email service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBackupAccess, emergencyRoutes, SEAL_HOURS } from "./backupPerson.js";
import { runBook } from "./runbook.js";
import { controlRoomPeople } from "./people.js";
import { fakePlatformState } from "./fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings, DEFAULT_SETTINGS } from "../services/settings.js";
import { TEMPLATES } from "../services/email/templates.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { fakeFiles, fakeWorld } from "../services/release-runner/fakes.js";
import { rollBackShop, runRelease } from "../services/release-runner/runner.js";
import { renderStatus } from "../status/page.js";
import { STATUS_DOC } from "../status/publish.js";

const FOLDER = "folders/000000000000";
const BACKUP = { uid: "uid-backup", email: "backup@example.com", email_verified: true };
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true };
const STRANGER = { uid: "uid-x", email: "someone@example.com", email_verified: true };
const WHY = "Julian is away and checkout broke after the release";

async function world({ env = { PLATFORM_ADMIN_EMAIL: "owner@example.com", PLATFORM_BACKUP_PERSON: "Backup@Example.com" }, emailFails = false } = {}) {
  const registry = fakeRegistry();
  const row = (shopId, extra) => ({ shopId, projectId: shopId, plan: "both", status: "live", ...extra });
  const rows = [row("lmb-test-shop", { testShop: true, testMode: true }), row("press-bravo", { release: { version: "1.1.0" } })];
  for (const row of rows) await registry.createShop(row.shopId, row);
  const releases = fakeWorld();
  for (const row of rows) releases.seed(row, "1.1.0");
  const auditLog = fakeAuditLog();
  const ids = rows.map((r) => r.shopId);
  const clients = {
    registry, auditLog, builder: releases.builder, deploy: releases.deploy, siteCheck: releases.siteCheck, releaseCheck: releases.releaseCheck,
    envFiles: fakeFiles("env", ids), profileFiles: fakeFiles("profile", ids), projects: { get: async (id) => ({ projectId: id, parent: FOLDER }) },
    config: { folder: FOLDER },
  };
  const state = fakePlatformState();
  const published = [];
  const platform = { set: async (path, data) => void published.push([path, structuredClone(data)]) };
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const now = () => new Date(clock);
  const sent = [];
  const email = { sendPlatform: async (message) => { if (emailFails) throw new Error("the email service is down (pretend)"); sent.push(message); } };
  const book = runBook({ state, registry, platform, rollBack: (args) => rollBackShop(clients, args), now });
  const access = createBackupAccess({ people: controlRoomPeople(env), admins: [ADMIN.email], runBook: book, state, email, registry, auditLog, now });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: emergencyRoutes(access) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { registry, releases, clients, state, published, sent, ask, auditLog, tick: (ms) => (clock += ms), access };
}

test("nobody is the backup person by default, and only the named person or an admin gets in", async () => {
  assert.equal(controlRoomPeople({}).backupPerson, null);
  const none = await world({ env: { PLATFORM_ADMIN_EMAIL: "owner@example.com" } });
  assert.equal((await none.ask(BACKUP, "GET", "/api/control/emergency")).status, 403);
  const w = await world();
  assert.equal((await w.ask(STRANGER, "GET", "/api/control/emergency")).status, 403);
  assert.equal((await w.ask({ ...BACKUP, email_verified: false }, "GET", "/api/control/emergency")).status, 403);
  assert.equal((await w.ask(null, "GET", "/api/control/emergency")).status, 401);
  const status = await w.ask(BACKUP, "GET", "/api/control/emergency");
  assert.deepEqual([status.body.role, status.body.seal, status.body.releasesPaused, status.body.adminTold], ["backup", null, null, true]);
  // The backup person's routes are the run book's and nothing else.
  assert.deepEqual(Object.keys(emergencyRoutes(w.access)).map((r) => r.split("/").pop()), ["emergency", "open", "pause-releases", "resume-releases", "roll-back", "status-note"]);
});

test("sealed: nothing works until it is opened with a reason, which emails Julian first; no email, no access", async () => {
  const w = await world();
  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/pause-releases", { reason: WHY })).status, 403);
  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/open", { reason: "help" })).status, 400);
  assert.equal(w.state.docs.get("releasePause"), undefined);

  const opened = await w.ask(BACKUP, "POST", "/api/control/emergency/open", { reason: WHY });
  assert.equal(opened.status, 200);
  assert.equal(Date.parse(opened.body.seal.until) - Date.parse("2026-10-28T12:00:00Z"), SEAL_HOURS * 3_600_000);
  assert.deepEqual([w.sent[0].kind, w.sent[0].to, w.sent[0].data.by], ["backup-access-used", "owner@example.com", "backup@example.com"]);
  assert.match(TEMPLATES[w.sent[0].kind](w.sent[0].data, { settings: DEFAULT_SETTINGS }).text, /backup@example\.com opened the emergency access.*Why: Julian is away/s);

  // After the seal runs out, it's shut again.
  w.tick(SEAL_HOURS * 3_600_000 + 1);
  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/pause-releases", { reason: WHY })).status, 403);

  const noAddress = await world({ env: { PLATFORM_BACKUP_PERSON: "backup@example.com" } });
  assert.equal((await noAddress.ask(BACKUP, "POST", "/api/control/emergency/open", { reason: WHY })).status, 503);
  const down = await world({ emailFails: true });
  assert.equal((await down.ask(BACKUP, "POST", "/api/control/emergency/open", { reason: WHY })).status, 503);
  assert.equal(down.state.docs.get("backupSeal"), undefined, "the seal stays shut when Julian can't be told");
  assert.deepEqual([...down.state.entries.values()].map((e) => e.what), ["open", "email-failed"], "the try is still in the log");
});

test("the run book: pause releases, roll back a shop, post a status note; each logged and emailed", async () => {
  const w = await world();
  await w.ask(BACKUP, "POST", "/api/control/emergency/open", { reason: WHY });

  // Pause: a release no longer starts.
  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/pause-releases", { reason: WHY })).status, 200);
  const blocked = await runRelease({ version: "1.2.0", ...w.clients, paused: () => w.access.status(BACKUP).then((s) => s.releasesPaused) });
  assert.deepEqual([blocked.ok, blocked.paused.by], [false, "backup@example.com"]);
  assert.deepEqual(w.releases.builds, []);

  // Roll back one shop.
  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/roll-back", { shopId: "press-bravo", version: "latest", reason: WHY })).status, 400);
  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/roll-back", { shopId: "nope", version: "1.0.0", reason: WHY })).status, 404);
  const back = await w.ask(BACKUP, "POST", "/api/control/emergency/roll-back", { shopId: "press-bravo", version: "1.0.0", reason: WHY });
  assert.deepEqual([back.status, back.body.ok], [200, true]);
  assert.equal(w.releases.live.get("press-bravo")["pages:shop"], "1.0.0");
  assert.equal(w.releases.live.get("lmb-test-shop")["pages:shop"], "1.1.0");
  const history = [...w.registry.events.get("press-bravo").values()];
  assert.deepEqual([history[0].what, history[0].by, history[0].version], ["roll-back", "backup@example.com", "1.0.0"]);

  // A status note, straight onto the status page.
  const note = await w.ask(BACKUP, "POST", "/api/control/emergency/status-note", { text: "Some shops' checkout is down. We're putting it right." });
  assert.equal(note.status, 200);
  const [path, summary] = w.published.at(-1);
  assert.equal(path, STATUS_DOC);
  assert.match(renderStatus(summary, { now: () => new Date("2026-10-28T12:00:00Z"), locale: "en-CA" }), /<p class="note" role="note">Some shops&#39; checkout is down\./);
  await w.ask(BACKUP, "POST", "/api/control/emergency/status-note", { text: "" });
  assert.equal(w.published.at(-1)[1].note, undefined, "an empty note takes it down");

  assert.equal((await w.ask(BACKUP, "POST", "/api/control/emergency/resume-releases", { reason: "the new release is fixed now" })).status, 200);
  assert.equal((await w.access.status(BACKUP)).releasesPaused, null);

  const log = [...w.state.entries.values()];
  assert.deepEqual(log.map((e) => e.what), ["open", "pause-releases", "roll-back", "status-note", "status-note", "resume-releases"]);
  assert.ok(log.every((e) => e.by === "backup@example.com"));
  assert.deepEqual(w.sent.map((m) => m.data.action), ["opened the emergency access", "paused releases", "rolled a shop back", "posted a status note", "posted a status note", "resumed releases"]);
  assert.ok(w.sent.every((m) => m.to === "owner@example.com"));
});

test("admins use the run book without a seal, logged but not emailed; an email failure never stops the backup person mid-emergency", async () => {
  const w = await world();
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/emergency/open", { reason: WHY })).status, 400);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/emergency/pause-releases", { reason: WHY })).status, 200);
  assert.deepEqual([...w.state.entries.values()].map((e) => [e.what, e.role]), [["pause-releases", "admin"]]);
  assert.equal(w.sent.length, 0);

  const flaky = await world();
  await flaky.ask(BACKUP, "POST", "/api/control/emergency/open", { reason: WHY });
  flaky.sent.length = 0;
  const sendPlatform = async () => { throw new Error("the email service is down (pretend)"); };
  Object.assign(flaky.access, createBackupAccess({
    people: controlRoomPeople({ PLATFORM_ADMIN_EMAIL: "owner@example.com", PLATFORM_BACKUP_PERSON: "backup@example.com" }), admins: [],
    runBook: runBook({ state: flaky.state, registry: flaky.registry, platform: { set: async () => {} } }), state: flaky.state, email: { sendPlatform }, registry: flaky.registry, auditLog: flaky.auditLog,
    now: () => new Date("2026-10-28T13:00:00Z"),
  }));
  await flaky.access.pauseReleases(BACKUP, { reason: WHY });
  assert.equal(flaky.state.docs.get("releasePause").paused, true);
  assert.deepEqual([...flaky.state.entries.values()].map((e) => e.what).slice(-2), ["pause-releases", "email-failed"]);
});

test("the page offers every run book action, shown as text only", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  for (const path of Object.keys(emergencyRoutes({}))) assert.ok(app.includes(`"${path.split(" ")[1].replace("/api", "")}"`), path);
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/);
});
