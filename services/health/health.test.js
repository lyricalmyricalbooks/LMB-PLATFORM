import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { TEMPLATES } from "../email/templates.js";
import { DEFAULT_SETTINGS } from "../settings.js";
import { BACKUP_MAX_HOURS, checkShop, checksFor, healthChecks } from "./checks.js";
import { runNightlyBackups } from "./nightly.js";
import { REMIND_HOURS, nextState, runHealth } from "./runner.js";
import { CHECKOUT_ERROR_JUMP } from "./checks.js";

const row = (shopId, extra = {}) => ({ shopId, projectId: shopId, pressName: `Press ${shopId}`, plan: "both", status: "live", testMode: false, testShop: false, payments: { provider: "stripe", accountId: "acct_1" }, ...extra });
const NOW = "2026-10-28T12:00:00.000Z";
const clockFrom = (start) => {
  let t = Date.parse(start);
  const now = () => new Date(t);
  now.advance = (minutes) => { t += minutes * 60_000; };
  return now;
};

/** A pretend world for the checks: page answers, the checkout's preflight answer, and each shop's documents. */
function world({ pages = () => 200, checkout = () => ({ status: 204, allow: "same" }), docs = {} } = {}) {
  return {
    siteCheck: { get: async (url) => ({ status: pages(url), problems: [] }) },
    fetch: async (url, init) => {
      assert.equal(init.method, "OPTIONS");
      const { status, allow } = checkout(url);
      return { status, headers: { get: (name) => (name === "access-control-allow-origin" ? (allow === "same" ? init.headers.Origin : allow) : null) } };
    },
    shopDb: (shopId) => ({ get: async (path) => structuredClone(docs[shopId]?.[path] ?? null), query: async (collection) => structuredClone(docs[shopId]?.[collection] ?? []) }),
  };
}
const goodBackup = (at = "2026-10-28T03:00:00.000Z") => ({ "systemStatus/backup": { ok: true, lastSuccessAt: at } });

test("which checks apply: the stockroom alone has no checkout or payment events; no payments account, no webhook check", () => {
  assert.deepEqual(checksFor(row("a")), ["pages", "checkout", "webhook", "errors", "backup"]);
  assert.deepEqual(checksFor(row("a", { plan: "stockroom" })), ["pages", "backup"]);
  assert.deepEqual(checksFor(row("a", { payments: undefined })), ["pages", "checkout", "errors", "backup"]);
});

test("the checks read pages, the checkout preflight, payment events and backups", async () => {
  const now = () => new Date(NOW);
  const r = row("press-alpha", { platformBackup: { stockroomAt: "2026-10-28T02:00:00.000Z" } });
  const healthy = await checkShop(r, healthChecks(world({ docs: { "press-alpha": goodBackup() } })), { now });
  assert.deepEqual(healthy, { pages: { ok: true }, checkout: { ok: true }, webhook: { ok: true }, errors: { ok: true, memo: {} }, backup: { ok: true } });

  const sick = await checkShop(r, healthChecks(world({
    pages: (url) => (url.endsWith("/admin") ? 500 : 200),
    checkout: () => ({ status: 204, allow: null }),
    docs: { "press-alpha": {
      "adminSecrets/stripeWebhookStatus": { lastReceivedAt: "2026-10-28T09:00:00.000Z", lastProcessingFailureAt: "2026-10-28T10:00:00.000Z", lastProcessingFailure: "checkout.session.completed: boom" },
      "systemStatus/backup": { ok: false, lastSuccessAt: "2026-10-26T03:00:00.000Z", error: "permission denied" },
    } },
  })), { now });
  assert.match(sick.pages.detail, /press-alpha\.web\.app\/admin answered 500/);
  assert.match(sick.checkout.detail, /doesn't accept the shop's own pages/);
  assert.match(sick.webhook.detail, /failing since 2026-10-28T10:00:00.000Z: checkout\.session\.completed: boom/);
  assert.match(sick.backup.detail, /the shop's last good backup is 57 hours old \(last try: permission denied\)/);
  assert.ok(57 > BACKUP_MAX_HOURS);
});

test("a webhook failure older than the last good delivery, or a day old, is not a failure", async () => {
  const now = () => new Date(NOW);
  const r = row("press-alpha", { plan: "shop" });
  const checks = (status) => healthChecks(world({ docs: { "press-alpha": { ...goodBackup(), "adminSecrets/stripeWebhookStatus": status } } }));
  assert.deepEqual((await checkShop(r, checks({ lastFailureAt: "2026-10-28T08:00:00.000Z", lastReceivedAt: "2026-10-28T09:00:00.000Z" }), { now })).webhook, { ok: true });
  assert.deepEqual((await checkShop(r, checks({ lastFailureAt: "2026-10-26T08:00:00.000Z" }), { now })).webhook, { ok: true });
});

test("a check that can't be made is a failure, and the other checks still run", async () => {
  const checks = healthChecks(world({ docs: { "press-alpha": goodBackup() } }));
  checks.checkout = async () => { throw new Error("socket hang up"); };
  const results = await checkShop(row("press-alpha", { plan: "shop" }), checks, { now: () => new Date(NOW) });
  assert.deepEqual(results.checkout, { ok: false, detail: "couldn't check: socket hang up" });
  assert.deepEqual(results.backup, { ok: true });
});

test("alert rules: pages and checkout need two failed runs; reminders every few hours; recovery once", () => {
  const at = (minutes) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
  const fail = { ok: false, detail: "down" };
  let s = nextState("checkout", undefined, fail, at(0));
  assert.equal(s.alert, null);
  s = nextState("checkout", s.state, fail, at(5));
  assert.equal(s.alert, "failing");
  assert.equal(s.state.since, at(0));
  s.state.alertedAt = at(5);
  assert.equal(nextState("checkout", s.state, fail, at(10)).alert, null);
  assert.equal(nextState("checkout", s.state, fail, at(5 + REMIND_HOURS * 60)).alert, "still-failing");
  const back = nextState("checkout", s.state, { ok: true }, at(15));
  assert.deepEqual(back, { state: { ok: true, since: at(15), failures: 0 }, alert: "recovered" });
  assert.equal(nextState("backup", undefined, fail, at(0)).alert, "failing", "backups alert at once");
  assert.equal(nextState("checkout", { ok: false, failures: 1, since: at(0) }, { ok: true }, at(5)).alert, null, "a blip that never alerted needs no recovery note");
});

test("the five-minute run checks live shops only, keeps state on the row and emails alerts", async () => {
  const registry = fakeRegistry();
  for (const r of [row("press-alpha", { plan: "shop" }), row("press-new", { status: "creating" })]) await registry.createShop(r.shopId, r);
  let checkoutStatus = 500;
  const w = world({ checkout: () => ({ status: checkoutStatus, allow: "same" }), docs: { "press-alpha": goodBackup() } });
  const sent = [];
  const notify = { sendPlatform: async (m) => void sent.push(m) };
  const now = clockFrom(NOW);
  const run = () => runHealth({ registry, checks: healthChecks(w), notify, config: { alertTo: "alerts@platform.example" }, now });

  const first = await run();
  assert.equal(first.checked, 1, "a shop still being made isn't checked");
  assert.deepEqual(sent, []);
  now.advance(5);
  await run();
  assert.deepEqual(sent.map((m) => [m.kind, m.to, m.data.check, m.data.state]), [["health-alert", "alerts@platform.example", "checkout", "failing"]]);
  const health = (await registry.getShop("press-alpha")).health;
  assert.equal(health.ok, false);
  assert.equal(health.checks.checkout.alertedAt, "2026-10-28T12:05:00.000Z");
  assert.equal(health.checks.checkout.since, NOW);

  now.advance(5);
  await run();
  assert.equal(sent.length, 1, "no repeat within the reminder gap");

  checkoutStatus = 204;
  now.advance(5);
  await run();
  assert.deepEqual(sent.at(-1).data.state, "recovered");
  assert.equal((await registry.getShop("press-alpha")).health.ok, true);
  const events = [...registry.events.get("press-alpha").values()].filter((e) => e.check === "checkout").map((e) => e.ok);
  assert.deepEqual(events, [false, true], "only changes of state are events");
});

test("an alert that couldn't be sent is sent on the next run, recovery included", async () => {
  const registry = fakeRegistry();
  await registry.createShop("press-alpha", row("press-alpha", { plan: "shop" }));
  const docs = { "press-alpha": { "systemStatus/backup": { ok: false, error: "quota" } } };
  const w = world({ docs });
  let down = true;
  const sent = [];
  const notify = { sendPlatform: async (m) => { if (down) throw new Error("Resend 503"); sent.push(m.data.state); } };
  const now = clockFrom(NOW);
  const lines = [];
  const run = () => runHealth({ registry, checks: healthChecks(w), notify, config: { alertTo: "alerts@platform.example" }, now, print: (l) => lines.push(l) });
  await run();
  assert.match(lines[0], /couldn't send the backup alert: Resend 503/);
  down = false;
  now.advance(5);
  await run();
  assert.deepEqual(sent, ["failing"]);

  docs["press-alpha"]["systemStatus/backup"] = { ok: true, lastSuccessAt: NOW };
  down = true;
  now.advance(5);
  await run();
  assert.equal((await registry.getShop("press-alpha")).health.checks.backup.recoveryUnsent, true);
  down = false;
  now.advance(5);
  await run();
  assert.deepEqual(sent, ["failing", "recovered"]);
});

test("the run needs an alert address", async () => {
  await assert.rejects(runHealth({ registry: fakeRegistry(), checks: {}, notify: {} }), /needs an address to send alerts to/);
});

test("nightly: the stockroom is always backed up; the shop only when its own backup missed a night", async () => {
  const registry = fakeRegistry();
  for (const r of [row("press-alpha"), row("press-bravo", { plan: "shop" }), row("press-held", { status: "abandoned" })]) await registry.createShop(r.shopId, r);
  const docs = { "press-alpha": goodBackup("2026-10-28T03:00:00.000Z"), "press-bravo": goodBackup("2026-10-26T03:00:00.000Z") };
  const runs = [];
  const backups = { run: async (projectId, { database }) => { runs.push([projectId, database]); if (projectId === "press-bravo") throw new Error("no permission"); return { name: "backups/2026-10-28/" }; } };
  const result = await runNightlyBackups({ registry, backups, shopDb: world({ docs }).shopDb, now: () => new Date(NOW) });
  assert.deepEqual(runs, [["press-alpha", "stockroom"], ["press-bravo", "(default)"]]);
  assert.deepEqual(result.shops, [{ shopId: "press-alpha", backedUp: ["stockroomAt"], failed: [] }, { shopId: "press-bravo", backedUp: [], failed: ["(default)"] }]);
  assert.equal(result.ok, false);
  assert.deepEqual((await registry.getShop("press-alpha")).platformBackup, { stockroomAt: NOW });
  assert.equal([...registry.events.get("press-bravo").values()][0].error, "no permission");

  // The platform's stockroom backup now satisfies the backup check.
  const r = await registry.getShop("press-alpha");
  assert.deepEqual((await checkShop(r, healthChecks(world({ docs })), { now: () => new Date(NOW) })).backup, { ok: true });
});

test("the real entry point needs a job and, for the checks, an alert address", async () => {
  const { realHealth } = await import("./run.js");
  const fetch = async () => { throw new Error("no network in tests"); };
  await assert.rejects(realHealth({ job: "everything", env: {}, fetch }), /"checks", "nightly" or "drill"/);
  await assert.rejects(realHealth({ job: "checks", env: {}, fetch }), /HEALTH_ALERT_TO is not set/);
  await assert.rejects(realHealth({ job: "drill", env: {}, fetch }), /HEALTH_ALERT_TO is not set/);
});

test("the alert email names the press, the check and what it saw", () => {
  const ctx = { settings: DEFAULT_SETTINGS, pressName: "Press Alpha" };
  const failing = TEMPLATES["health-alert"]({ shopId: "press-alpha", check: "checkout", state: "failing", detail: "the checkout answered 500", since: NOW }, ctx);
  assert.equal(failing.subject, "Press Alpha (press-alpha): checkout failing");
  assert.match(failing.text, /What the check saw: the checkout answered 500/);
  const back = TEMPLATES["health-alert"]({ shopId: "press-alpha", check: "webhook", state: "recovered", detail: "x", since: NOW }, ctx);
  assert.equal(back.subject, "Press Alpha (press-alpha): payment events working again");
  assert.doesNotMatch(back.text, /What the check saw/);
  assert.throws(() => TEMPLATES["health-alert"]({ check: "mood", state: "failing" }, ctx), /no known check/);
});

// Plan 13.7: shoppers' crashes on the cart and checkout pages, from the shop's own scrubbed records.
const record = (id, count, lastPath = "/checkout", extra = {}) => ({ id, path: `clientErrors/${id}`, data: { count, lastPath, lastSeenAt: "2026-10-28T11:58:00.000Z", message: `error ${id}`, ...extra } });

test("checkout errors: the first run saves a baseline, a jump after it fails, a quiet run after that recovers", async () => {
  const now = () => new Date(NOW);
  const r = row("press-alpha", { plan: "shop" });
  const checks = (records) => healthChecks(world({ docs: { "press-alpha": { ...goodBackup(), clientErrors: records } } }));
  const first = (await checkShop(r, checks([record("a", 40), record("b", 5, "/books/x")]), { now })).errors;
  assert.deepEqual(first, { ok: true, memo: { a: 40 } }, "only cart and checkout pages are watched, and the first run alerts nothing");
  const previous = { ...r, health: { checks: { errors: { ok: true, since: NOW, failures: 0, memo: first.memo } } } };
  const quiet = (await checkShop(previous, checks([record("a", 43)]), { now })).errors;
  assert.equal(quiet.ok, true);
  const burst = (await checkShop(previous, checks([record("a", 40 + CHECKOUT_ERROR_JUMP - 2), record("c", 3)]), { now })).errors;
  assert.equal(burst.ok, false);
  assert.match(burst.detail, /11 new errors on the cart and checkout pages since the last check; most often: "error a" \(8\)/);
  assert.deepEqual(burst.memo, { a: 48, c: 3 });
});

test("a checkout error burst raises one alert and is remembered between runs", async () => {
  const registry = fakeRegistry();
  await registry.createShop("press-alpha", row("press-alpha", { plan: "shop" }));
  const sent = [];
  const notify = { sendPlatform: async (message) => { sent.push(message); } };
  let records = [record("a", 100)];
  const checks = { ...healthChecks({ ...world({ docs: { "press-alpha": goodBackup() } }), shopDb: (id) => ({ get: async () => goodBackup()["systemStatus/backup"], query: async () => structuredClone(records) }) }), pages: async () => ({ ok: true }), checkout: async () => ({ ok: true }), webhook: async () => ({ ok: true }) };
  const run = () => runHealth({ registry, checks, notify, config: { alertTo: "alerts@example.com" }, now: () => new Date(NOW) });
  await run();
  assert.equal(sent.length, 0);
  records = [record("a", 125)];
  await run();
  assert.deepEqual(sent.map((m) => [m.data.check, m.data.state]), [["errors", "failing"]]);
  records = [record("a", 126)];
  await run();
  assert.deepEqual(sent.map((m) => [m.data.check, m.data.state]), [["errors", "failing"], ["errors", "recovered"]]);
});
