// Colophon's own apps in the control room: admins only; each app on the store, or what it still waits for (the
// platform's secret, its company's app keys, its Zapier addresses), and an app the team took off stays marked so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOwnAppsDesk, ownAppsDeskRoutes } from "./ownApps.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { createOwnApps, ownAppId } from "../services/apps/ownApps.js";
import { fakeAppStore } from "../services/apps/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const ROOT = "a-made-up-root-secret-for-tests";

function world({ root = ROOT, available = { mailchimp: false }, zapier = {} } = {}) {
  const apps = fakeAppStore();
  const ownApps = createOwnApps({ store: apps, root, platformUrl: "https://platform.example", supportEmail: "support@platform.example", available, zapier, now: () => new Date(NOW) });
  const desk = createOwnAppsDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), ownApps, apps, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: ownAppsDeskRoutes(desk), log: () => {} });
  const ask = (claims) => api({ method: "POST", path: "/api/control/own-apps", body: {}, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, apps, ownApps };
}
const byName = (rows) => Object.fromEntries(rows.map((a) => [a.name, a]));

test("only platform admins see Colophon's apps", async () => {
  const w = world();
  assert.equal((await w.ask(PRESS)).status, 403);
  assert.equal((await w.ask(ADMIN)).status, 200);
});

test("each app on the store, or what it waits for", async () => {
  const w = world();
  await w.ownApps.ensure();
  const apps = byName((await w.desk.list(ADMIN)).apps);
  assert.deepEqual([apps.chitchats.title, apps.chitchats.onStore, apps.chitchats.needs], ["Chit Chats", true, null]);
  assert.equal(apps.chitchats.appId, ownAppId("chitchats"));
  assert.deepEqual([apps.mailchimp.onStore, apps.mailchimp.needs], [false, "company"]);
  assert.deepEqual([apps.zapier.onStore, apps.zapier.needs], [false, "zapier"]);
});

test("Zapier goes on once it has its two addresses", async () => {
  const w = world({ zapier: { inviteUrl: "https://zapier.example/invite", returnAddress: "https://zapier.example/back" } });
  await w.ownApps.ensure();
  const { zapier } = byName((await w.desk.list(ADMIN)).apps);
  assert.deepEqual([zapier.onStore, zapier.needs], [true, null]);
});

test("without the platform's secret every app says so", async () => {
  const { apps } = await world({ root: null }).desk.list(ADMIN);
  assert.ok(apps.length >= 3);
  assert.ok(apps.every((a) => a.needs === "secret" && !a.onStore));
});

test("an app the team took off is marked, not shown as waiting", async () => {
  const w = world();
  await w.ownApps.ensure();
  const id = ownAppId("chitchats");
  await w.apps.put(id, { ...(await w.apps.get(id)), status: "unlisted", onStore: false, unlisted: { by: "admin@example.com", at: "2026-11-11T11:00:00Z" } });
  const { chitchats } = byName((await w.desk.list(ADMIN)).apps);
  assert.deepEqual([chitchats.onStore, chitchats.takenOff], [false, true]);
});

test("both worlds serve the route and the page shows it", () => {
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /ownAppsDeskRoutes\(createOwnAppsDesk/, door);
  assert.match(readFileSync(new URL("./app.js", import.meta.url), "utf8"), /"\/control\/own-apps"/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /id="own-apps"/);
});
