// The QuickBooks link in the control room: admins only; whether it's on; each shop that connected, lost connections
// first, then shops whose sales stopped going; never Intuit's tokens or the company's QuickBooks id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickBooksDesk, quickbooksDeskRoutes } from "./quickbooks.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeRegistry } from "../setup/fakes.js";
import { fakeConnections } from "../services/accounting/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world({ switchedOn = "on" } = {}) {
  const registry = fakeRegistry();
  for (const [id, name] of [["moth", "Moth Press"], ["wasp", "Wasp Books"], ["ant", "Ant Editions"], ["bee", "Bee Books"], ["fly", "Fly Press"]]) await registry.createShop(id, { shopId: id, pressName: name, status: "live" });
  const connections = fakeConnections();
  const base = { mode: "live", realmId: "9130350000000001", sealed: "sealed-tokens", ownerEmail: "owner@example.com" };
  await connections.set("moth", { ...base, companyName: "Moth Press Inc.", connectedAt: "2026-11-01T00:00:00Z", disconnectedAt: null, problem: null, lastSent: { date: "2026-11-11", at: "2026-11-12T03:00:00Z" } });
  await connections.set("wasp", { ...base, companyName: "Wasp Books Ltd", connectedAt: "2026-10-01T00:00:00Z", disconnectedAt: "2026-11-10T03:00:00Z", problem: "lost", sealed: null });
  await connections.set("ant", { ...base, companyName: "Ant", connectedAt: "2026-10-01T00:00:00Z", disconnectedAt: "2026-11-05T00:00:00Z", problem: "disconnected", sealed: null });
  await connections.set("bee", { ...base, mode: "test", companyName: "Sandbox Co", connectedAt: "2026-11-01T00:00:00Z", disconnectedAt: null, lastSent: { date: "2026-11-08", at: "2026-11-09T03:00:00Z" } });
  await connections.set("fly", { ...base, companyName: "Fly", connectedAt: "2026-11-12T10:00:00Z", disconnectedAt: null, warnedFor: "2026-12-01T00:00:00Z" });
  const desk = createQuickBooksDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), switchedOn, connections, registry, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: quickbooksDeskRoutes(desk), log: () => {} });
  const ask = (claims) => api({ method: "POST", path: "/api/control/quickbooks", body: {}, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask };
}

test("only platform admins see QuickBooks", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS)).status, 403);
  assert.equal((await w.ask(ADMIN)).status, 200);
});

test("lost first, then behind, then connected, then disconnected by the press", async () => {
  const { switchedOn, shops, counts } = await (await world()).desk.overview(ADMIN);
  assert.equal(switchedOn, "on");
  assert.deepEqual(shops.map((s) => [s.shopId, s.state, s.behind]), [["wasp", "lost", false], ["bee", "connected", true], ["fly", "connected", false], ["moth", "connected", false], ["ant", "disconnected", false]]);
  assert.deepEqual(counts, { connected: 3, lost: 1, behind: 1 });
  const byId = Object.fromEntries(shops.map((s) => [s.shopId, s]));
  assert.equal(byId.bee.sandbox, true);
  assert.equal(byId.moth.lastSentDay, "2026-11-11");
  assert.equal(byId.fly.endsOn, "2026-12-01", "a just-connected shop isn't behind yet");
  assert.equal(byId.wasp.endsOn, null);
});

test("never shows tokens, the QuickBooks id or the owner's address", async () => {
  const text = JSON.stringify(await (await world()).desk.overview(ADMIN));
  for (const secret of ["sealed-tokens", "9130350000000001", "owner@example.com"]) assert.ok(!text.includes(secret), secret);
});

test("says when the link is off", async () => {
  assert.equal((await (await world({ switchedOn: "no-keys" })).desk.overview(ADMIN)).switchedOn, "no-keys");
  assert.equal((await (await world({ switchedOn: "whatever" })).desk.overview(ADMIN)).switchedOn, "off");
});

test("both worlds serve the route and the page shows it", () => {
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /quickbooksDeskRoutes\(createQuickBooksDesk/, door);
  assert.match(readFileSync(new URL("./app.js", import.meta.url), "utf8"), /"\/control\/quickbooks"/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /id="quickbooks"/);
});
