import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appUseRoutes, createAppUse, failingApps, installsByApp } from "./appUse.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { createAppAlerts } from "../services/apps/alerts.js";
import { fakeAppAlertStores, fakeAppInstallStores } from "../services/apps/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" });

test("shops per app, with the maker's own test installs counted apart", () => {
  assert.deepEqual(installsByApp([
    { appId: "a", shopId: "s1", installedAt: "2026-11-10T00:00:00Z" }, { appId: "a", shopId: "s2", installedAt: "2026-09-01T00:00:00Z" },
    { appId: "a", shopId: "lmb-test-shop", testing: true, installedAt: "2026-11-19T00:00:00Z" }, { appId: "b", shopId: "s1" },
  ], NOW), { a: { shops: 2, recent: 1, testing: 1 }, b: { shops: 1, recent: 0, testing: 0 } });
});

test("failing apps: last week only, worst first, with the newest reason", () => {
  const failed = [
    { appId: "a", shopId: "s1", failedAt: "2026-11-19T10:00:00Z", lastError: "answered 500" },
    { appId: "a", shopId: "s1", failedAt: "2026-11-20T10:00:00Z", lastError: "answered 404" },
    { appId: "a", shopId: "s2", failedAt: "2026-11-18T10:00:00Z", lastError: "answered 500" },
    { appId: "b", shopId: "s1", failedAt: "2026-11-20T11:00:00Z", lastError: "couldn't be reached" },
    { appId: "c", shopId: "s1", failedAt: "2026-11-01T10:00:00Z", lastError: "old" },
  ];
  assert.deepEqual(failingApps(failed, NOW), [
    { appId: "a", alerts: 3, shops: 2, lastError: "answered 404", lastFailedAt: "2026-11-20T10:00:00Z" },
    { appId: "b", alerts: 1, shops: 1, lastError: "couldn't be reached", lastFailedAt: "2026-11-20T11:00:00Z" },
  ]);
});

test("send again: a given-up alert gets exactly one more try, and is delivered once the app answers", async () => {
  let clock = Date.parse("2026-11-04T12:00:00Z");
  const now = () => new Date(clock);
  const secret = "cs_secret_1";
  const details = { name: "Parcel Pal", alertsAddress: "https://tools.example/alerts", alertTopics: ["orders/paid"], scopes: ["read_orders"] };
  const app = { appId: "app_1", secretHash: createHash("sha256").update(secret).digest("hex"), draft: details, listing: { details } };
  const { installs } = fakeAppInstallStores();
  const install = { installId: "moth-press~app_1", appId: "app_1", shopId: "moth-press", scopes: ["read_orders"], status: "active", installedAt: "2026-11-04T11:00:00Z" };
  installs.rows.set(install.installId, install);
  const stores = fakeAppAlertStores();
  let up = false;
  let calls = 0;
  const fetch = async () => { calls += 1; return { status: up ? 200 : 503 }; };
  const alerts = createAppAlerts({ apps: { get: async () => structuredClone(app) }, installs, outbox: stores.outbox, state: stores.state, shopData: { find: async () => [] }, fetch, now });
  await alerts.removed({ ...install, removedAt: "2026-11-04T12:00:00Z" });
  for (let i = 0; i < 20 && !(await stores.outbox.listByStatus("failed")).length; i++) { await alerts.deliver(); clock += 13 * 60 * 60_000; }
  const [given] = await stores.outbox.listByStatus("failed");
  assert.ok(given, "the alert was given up");

  const desk = createAppUse({ admins, installs, outbox: stores.outbox, now });
  const fresh = { ...ADMIN, auth_time: Math.floor(clock / 1000) };
  const overview = await desk.overview(fresh);
  assert.deepEqual(overview.byApp, { app_1: { shops: 1, recent: 1, testing: 0 } });
  assert.equal(overview.failing[0].appId, "app_1");

  calls = 0;
  assert.deepEqual(await desk.resend(fresh, { appId: "app_1" }), { appId: "app_1", resent: 1 });
  await alerts.deliver();
  assert.equal(calls, 1);
  assert.equal((await stores.outbox.get(given.id)).status, "failed", "one more failure gives it up again, no new day of retries");

  await desk.resend(fresh, { appId: "app_1" });
  up = true;
  await alerts.deliver();
  assert.equal((await stores.outbox.get(given.id)).status, "sent");
  assert.equal((await stores.outbox.get(given.id)).resentBy, "admin@example.com");
  await assert.rejects(desk.resend(fresh, { appId: "app_1" }), /no failed alerts/);
});

test("the door: platform admins only", async () => {
  const { installs } = fakeAppInstallStores();
  const desk = createAppUse({ admins, installs, outbox: fakeAppAlertStores().outbox, now: () => NOW });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: appUseRoutes(desk), log: () => {} });
  const ask = (claims, path, body = {}) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS, "/api/control/app-use")).status, 403);
  assert.equal((await ask(PRESS, "/api/control/app-use/resend", { appId: "a" })).status, 403);
  const answer = await ask(ADMIN, "/api/control/app-use");
  assert.equal(answer.status, 200);
  assert.deepEqual([answer.body.byApp, answer.body.failing, answer.body.failingDays], [{}, [], 7]);
  assert.equal((await ask(ADMIN, "/api/control/app-use/resend", {})).status, 400);
});
