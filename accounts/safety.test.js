// Account safety (plan 4.5): new-device alerts and the account recovery review queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { TEMPLATES } from "../services/email/templates.js";
import { platformSettings } from "../services/settings.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { MAX_DEVICES, browserWords, deviceWatch } from "./devices.js";
import { fakeDeviceStore, fakeRecoveryStore } from "./fakes.js";
import { HOLD_HOURS, MAX_REQUESTS_PER_WEEK, createRecovery, recoveryByHand } from "./recovery.js";
import { recoveryRoutes } from "./recoveryRoutes.js";

const settings = platformSettings({});
const ADA = { uid: "uid-ada", email: "Ada@Moth.example", email_verified: true };
const NEW_ADA = { uid: "uid-ada2", email: "ada.new@moth.example", email_verified: true };
const EVE = { uid: "uid-eve", email: "eve@example.com", email_verified: true };
const ADMIN = { uid: "uid-admin", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
const DEVICE_1 = "device-0000000000000001";
const DEVICE_2 = "device-0000000000000002";

function deviceWorld() {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const devices = fakeDeviceStore();
  const email = fakePlatformEmail();
  const logged = [];
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings, log: (line) => logged.push(line),
    routes: { "GET /api/ping": () => ({ pong: true }) },
    onSignedIn: deviceWatch({ devices, email, now: () => new Date(clock) }),
  });
  const call = (claims, device, agent = FIREFOX) => api({
    method: "GET", path: "/api/ping",
    headers: { Authorization: `Bearer ${JSON.stringify(claims)}`, ...(device ? { "X-Device-Id": device } : {}), "User-Agent": agent },
  });
  return { devices, email, logged, call, api, tick: (minutes) => { clock += minutes * 60_000; } };
}

test("the first device is remembered quietly; a new one emails the owner once", async () => {
  const { call, email, devices } = deviceWorld();
  assert.equal((await call(ADA, DEVICE_1)).status, 200);
  assert.equal(email.list().length, 0, "nothing to warn about on the first device");
  await call(ADA, DEVICE_1);
  assert.equal(email.list().length, 0);

  await call(ADA, DEVICE_2);
  await call(ADA, DEVICE_2);
  const sent = email.list();
  assert.deepEqual(sent.map((m) => [m.kind, m.to]), [["new-device", "ada@moth.example"]]);
  assert.equal(sent[0].data.browser, "Firefox on Windows");
  const row = devices.rows.get("uid-ada");
  assert.equal(Object.keys(row.known).length, 2);
  assert.doesNotMatch(JSON.stringify(row), /device-000/, "only a hash of the device id is kept");
});

test("a call with no or a malformed device id counts as a device of its own", async () => {
  const { call, email } = deviceWorld();
  await call(ADA, DEVICE_1);
  await call(ADA, null);
  await call(ADA, "short");
  assert.equal(email.list().length, 1, "missing and malformed ids are the same 'no device id' device");
});

test("last-seen times are written at most hourly, and the oldest devices are forgotten past the limit", async () => {
  const { call, devices, tick } = deviceWorld();
  await call(ADA, DEVICE_1);
  const first = devices.rows.get("uid-ada");
  tick(30);
  await call(ADA, DEVICE_1);
  assert.deepEqual(devices.rows.get("uid-ada"), first);
  tick(31);
  await call(ADA, DEVICE_1);
  assert.notDeepEqual(devices.rows.get("uid-ada"), first);

  for (let i = 0; i < MAX_DEVICES + 2; i += 1) {
    tick(1);
    await call(ADA, `device-extra-${String(i).padStart(10, "0")}`);
  }
  assert.equal(Object.keys(devices.rows.get("uid-ada").known).length, MAX_DEVICES);
});

test("a broken device store never stops the call; it is logged", async () => {
  const email = fakePlatformEmail();
  const logged = [];
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings, log: (line) => logged.push(line),
    routes: { "GET /api/ping": () => ({ pong: true }) },
    onSignedIn: deviceWatch({ devices: { get: async () => { throw new Error("store down"); }, set: async () => {} }, email }),
  });
  const res = await api({ method: "GET", path: "/api/ping", headers: { Authorization: `Bearer ${JSON.stringify(ADA)}` } });
  assert.equal(res.status, 200);
  assert.match(logged[0], /store down/);
});

test("unverified or signed-out callers are never recorded", async () => {
  const { api, devices } = deviceWorld();
  const res = await api({ method: "GET", path: "/api/ping", headers: { Authorization: `Bearer ${JSON.stringify({ ...ADA, email_verified: false })}` } });
  assert.equal(res.status, 200, "the route itself decides; the ping route doesn't check");
  assert.equal(devices.rows.size, 0);
});

test("browsers are named in plain words", () => {
  assert.equal(browserWords(FIREFOX), "Firefox on Windows");
  assert.equal(browserWords("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone or iPad");
  assert.equal(browserWords("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0"), "Edge on Mac");
  assert.equal(browserWords(""), "A browser");
});

function recoveryWorld({ applyRecovery } = {}) {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const registry = fakeRegistry();
  registry.shops.set("moth-press", { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "ada@moth.example", status: "live" });
  registry.shops.set("other-press", { shopId: "other-press", pressName: "Other", ownerEmail: "bea@example.com", status: "live" });
  const store = fakeRecoveryStore();
  const email = fakePlatformEmail();
  const auditLog = fakeAuditLog();
  const applied = [];
  let n = 0;
  const recovery = createRecovery({
    store, email, registry, auditLog, settings, admins: ["team@platform.example"],
    findAccount: async (address) => (address === "ada@moth.example" ? { accountId: "uid-ada" } : null),
    applyRecovery: applyRecovery ?? (async (move) => { applied.push(move); return recoveryByHand(move); }),
    now: () => new Date(clock), newId: () => `rec${String((n += 1)).padStart(4, "0")}`,
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: recoveryRoutes(recovery) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { store, email, registry, auditLog, applied, ask, tick: (hours) => { clock += hours * 3600_000; } };
}

const DETAILS = "I run Moth Press; my last order was for 12 copies of Night Moths.";

test("asking emails the old address, the person asking and the team, and says nothing about the old account", async () => {
  const { ask, email, store, registry, auditLog } = recoveryWorld();
  const res = await ask(NEW_ADA, "POST", "/api/recovery/ask", { oldEmail: " Ada@Moth.example ", details: DETAILS });
  assert.equal(res.status, 200);
  const { request } = res.body;
  assert.equal(request.status, "waiting");
  assert.deepEqual(Object.keys(request).sort(), ["askedAt", "holdUntil", "id", "oldEmail", "reason", "status"]);
  assert.deepEqual(email.list().map((m) => [m.kind, m.to]), [
    ["recovery-asked", "ada@moth.example"], ["recovery-received", "ada.new@moth.example"], ["recovery-new", settings.supportEmail],
  ]);
  assert.equal(email.list()[2].data.accountFound, true);
  assert.equal(email.list()[2].data.shopCount, 1);
  assert.deepEqual(store.rows.get(request.id).shops, ["moth-press"]);
  assert.equal(registry.events.get("moth-press").size, 1);
  assert.equal(auditLog.entries.get("moth-press").size, 1);

  const again = await ask(NEW_ADA, "POST", "/api/recovery/ask", { oldEmail: "ada@moth.example", details: DETAILS });
  assert.equal(again.body.request.id, request.id, "asking twice makes one request");
  assert.equal(email.list().length, 3);

  const unknown = await ask(EVE, "POST", "/api/recovery/ask", { oldEmail: "nobody@example.com", details: DETAILS });
  assert.deepEqual(Object.keys(unknown.body.request).sort(), Object.keys(request).sort(), "the same answer whether or not the account exists");
});

test("the form's words are checked and asking is limited per week", async () => {
  const { ask } = recoveryWorld();
  const bad = await ask(NEW_ADA, "POST", "/api/recovery/ask", { oldEmail: "ada.new@moth.example", details: "short" });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.problems.oldEmail && bad.body.problems.details);
  for (let i = 0; i < MAX_REQUESTS_PER_WEEK; i += 1) {
    assert.equal((await ask(EVE, "POST", "/api/recovery/ask", { oldEmail: `old${i}@example.com`, details: DETAILS })).status, 200);
  }
  assert.equal((await ask(EVE, "POST", "/api/recovery/ask", { oldEmail: "more@example.com", details: DETAILS })).status, 429);
});

test("the old address's owner sees the request and stops it", async () => {
  const { ask, email } = recoveryWorld();
  const { request } = (await ask(EVE, "POST", "/api/recovery/ask", { oldEmail: "ada@moth.example", details: DETAILS })).body;
  const mine = await ask(ADA, "GET", "/api/recovery/mine");
  assert.deepEqual(mine.body.againstMe.map((r) => [r.id, r.requesterEmail]), [[request.id, "eve@example.com"]]);
  assert.doesNotMatch(JSON.stringify(mine.body), /12 copies/, "the owner doesn't see what the asker wrote");

  assert.equal((await ask(NEW_ADA, "POST", "/api/recovery/cancel", { id: request.id })).status, 404, "a stranger can't stop it");
  const stopped = await ask(ADA, "POST", "/api/recovery/cancel", { id: request.id });
  assert.equal(stopped.body.request.status, "cancelled");
  assert.deepEqual(email.list().slice(3).map((m) => [m.kind, m.to]), [["recovery-stopped", settings.supportEmail], ["recovery-stopped", "eve@example.com"]]);
  assert.equal((await ask(ADA, "POST", "/api/recovery/cancel", { id: request.id })).status, 409);
  assert.deepEqual((await ask(ADA, "GET", "/api/recovery/mine")).body.againstMe, []);
});

test("only platform admins review; approving holds the move, and applying needs the wait and the by-hand step", async () => {
  const { ask, email, applied, tick, store, auditLog } = recoveryWorld();
  const { request } = (await ask(NEW_ADA, "POST", "/api/recovery/ask", { oldEmail: "ada@moth.example", details: DETAILS })).body;
  assert.equal((await ask(NEW_ADA, "POST", "/api/control/recovery", {})).status, 403);
  const queue = await ask(ADMIN, "POST", "/api/control/recovery", {});
  assert.deepEqual(queue.body.requests.map((r) => r.id), [request.id]);
  assert.equal(queue.body.requests[0].details, DETAILS);

  assert.equal((await ask(ADMIN, "POST", "/api/control/recovery/approve", { id: request.id, note: "ok" })).status, 400);
  const approved = await ask(ADMIN, "POST", "/api/control/recovery/approve", { id: request.id, note: "Called the press's listed phone." });
  assert.equal(approved.body.request.status, "approved");
  assert.equal(approved.body.request.holdUntil, "2026-10-31T12:00:00.000Z");
  assert.deepEqual(email.list().slice(3).map((m) => [m.kind, m.to]), [["recovery-approved", "ada@moth.example"], ["recovery-approved", "ada.new@moth.example"]]);

  const early = await ask(ADMIN, "POST", "/api/control/recovery/apply", { id: request.id, doneByHand: true });
  assert.equal(early.status, 409);
  assert.match(early.body.message, /to object/);
  tick(HOLD_HOURS);
  const notByHand = await ask(ADMIN, "POST", "/api/control/recovery/apply", { id: request.id });
  assert.equal(notByHand.status, 409);
  assert.equal(store.rows.get(request.id).status, "approved", "nothing is recorded until it's done");

  const done = await ask(ADMIN, "POST", "/api/control/recovery/apply", { id: request.id, doneByHand: true });
  assert.equal(done.status, 200);
  assert.equal(done.body.request.status, "applied");
  assert.deepEqual(applied.at(-1), { from: "ada@moth.example", to: "ada.new@moth.example", accountId: "uid-ada", shops: ["moth-press"], doneByHand: true });
  assert.deepEqual(store.rows.get(request.id).history.map((h) => h.what), ["asked", "approved", "applied"]);
  assert.equal(auditLog.entries.get("moth-press").size, 3);
  assert.deepEqual(email.list().slice(5).map((m) => [m.kind, m.to]), [["recovery-applied", "ada.new@moth.example"], ["recovery-applied", "ada@moth.example"]]);
  assert.equal((await ask(ADA, "POST", "/api/recovery/cancel", { id: request.id })).status, 409, "too late to stop once applied");
});

test("a denied request tells the person why, and the owner can still stop an approved one", async () => {
  const { ask, email } = recoveryWorld();
  const first = (await ask(EVE, "POST", "/api/recovery/ask", { oldEmail: "ada@moth.example", details: DETAILS })).body.request;
  assert.equal((await ask(ADMIN, "POST", "/api/control/recovery/deny", { id: first.id, reason: "no" })).status, 400);
  const denied = await ask(ADMIN, "POST", "/api/control/recovery/deny", { id: first.id, reason: "We couldn't match your details to the press." });
  assert.equal(denied.body.request.status, "denied");
  assert.equal(email.list().at(-1).kind, "recovery-denied");
  const mine = await ask(EVE, "GET", "/api/recovery/mine");
  assert.equal(mine.body.asked[0].reason, "We couldn't match your details to the press.");

  const second = (await ask(NEW_ADA, "POST", "/api/recovery/ask", { oldEmail: "ada@moth.example", details: DETAILS })).body.request;
  await ask(ADMIN, "POST", "/api/control/recovery/approve", { id: second.id, note: "Checked the order number." });
  const stopped = await ask(ADA, "POST", "/api/recovery/cancel", { id: second.id });
  assert.equal(stopped.body.request.status, "cancelled");
  assert.equal((await ask(ADMIN, "POST", "/api/control/recovery/apply", { id: second.id, doneByHand: true })).status, 409);
});

test("every account-safety email renders, escapes what people typed and links only to https", () => {
  const data = { requestId: "rec0001", oldEmail: "ada@moth.example", newEmail: "<b>eve</b>@example.com", holdUntil: "2026-10-31T12:00:00.000Z", reason: "No <b>match</b>", by: "the account's owner", browser: "Firefox on Windows", at: "2026-10-28T12:00:00.000Z", accountFound: true, shopCount: 1 };
  for (const kind of ["new-device", "recovery-asked", "recovery-received", "recovery-new", "recovery-stopped", "recovery-approved", "recovery-denied", "recovery-applied"]) {
    const parts = TEMPLATES[kind](data, { settings: { ...settings, platformUrl: "https://platform.example" }, pressName: "" });
    assert.ok(parts.subject && parts.text && parts.html, kind);
    assert.doesNotMatch(parts.html, /<b>/, kind);
  }
  assert.match(TEMPLATES["new-device"](data, { settings: { ...settings, platformUrl: "https://platform.example" } }).html, /href="https:\/\/platform\.example\/accounts\/"/);
  assert.throws(() => TEMPLATES["new-device"](data, { settings: { ...settings, platformUrl: "http://platform.example" } }), /https/);
});
