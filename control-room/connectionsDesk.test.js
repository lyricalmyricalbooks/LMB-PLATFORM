// Connections that stopped working (connectionsDesk.js): one list across Google, QuickBooks and the social networks,
// open shops only, never a token, and a nightly check that asks Google about each live connection.
import test from "node:test";
import assert from "node:assert/strict";
import { controlRoomAdmins } from "./controlRoom.js";
import { connectionsRoutes, createConnectionsDesk, runConnectionCheck, stoppedConnections } from "./connectionsDesk.js";

function fakePlatform(collections) {
  return {
    async query(name, { where = [] } = {}) {
      const rows = Object.entries(collections[name] ?? {}).map(([id, data]) => ({ id, path: `${name}/${id}`, data: structuredClone(data) }));
      return rows.filter((row) => where.every(([field, op, value]) => op === "==" && row.data[field] === value));
    },
  };
}

const SHOPS = {
  "moth-press": { shopId: "moth-press", pressName: "Moth Press", status: "live" },
  "fern-books": { shopId: "fern-books", pressName: "Fern Books", status: "live" },
  "gone-press": { shopId: "gone-press", pressName: "Gone Press", status: "closed" },
};
const registry = { getShop: async (id) => SHOPS[id] ?? null };

const data = () => ({
  googleConnections: {
    "moth-press": { sealed: "x", reconnectAt: "2026-11-10T08:00:00.000Z", revokedAt: null },
    "fern-books": { sealed: "x", reconnectAt: null, revokedAt: null },
    "gone-press": { sealed: "x", reconnectAt: "2026-11-01T08:00:00.000Z" },
  },
  accountingConnections: {
    "fern-books": { shopId: "fern-books", problem: "lost", disconnectedAt: "2026-11-11T03:30:00.000Z", sealed: null },
    "moth-press": { shopId: "moth-press", problem: null },
  },
  socialConnections: {
    "moth-press~pinterest": { shopId: "moth-press", network: "pinterest", problem: "lost", lostAt: "2026-11-12T06:00:00.000Z", sealed: "secret" },
    "moth-press~meta": { shopId: "moth-press", network: "meta", problem: null },
  },
});

test("lists every connection that stopped working, newest first, open shops only, with where to connect it again", async () => {
  const stopped = await stoppedConnections({ platform: fakePlatform(data()), registry });
  assert.deepEqual(stopped.map((s) => [s.pressName, s.name, s.since, s.where]), [
    ["Moth Press", "Pinterest", "2026-11-12T06:00:00.000Z", "Sales channels"],
    ["Fern Books", "QuickBooks", "2026-11-11T03:30:00.000Z", "Settings › Apps › QuickBooks"],
    ["Moth Press", "Google", "2026-11-10T08:00:00.000Z", "Settings › Google"],
  ]);
  assert.ok(!JSON.stringify(stopped).includes("secret"), "never a token");
});

test("the nightly check asks Google about each live connection only, and a Google outage isn't a lost connection", async () => {
  const asked = [];
  const tokens = { fresh: async (shopId) => { asked.push(shopId); if (shopId === "fern-books") throw new Error("Google didn't answer"); return null; } };
  const result = await runConnectionCheck({ platform: fakePlatform(data()), registry, tokens });
  assert.deepEqual(asked, ["fern-books"], "only the live one that hasn't already stopped");
  assert.equal(result.checked, 0);
  assert.equal(result.problems.length, 1);
  assert.equal(result.stopped, 3);
  assert.deepEqual(await runConnectionCheck({ platform: fakePlatform({}), registry }), { checked: 0, stopped: 0, problems: [] });
});

test("only an admin reads the list", async () => {
  const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" });
  const now = () => new Date("2026-11-12T12:00:00Z");
  const desk = createConnectionsDesk({ admins, platform: fakePlatform(data()), registry, now });
  const route = connectionsRoutes(desk)["POST /api/control/connections-stopped"];
  await assert.rejects(() => route({ uid: "uid-press", email: "press@example.com", email_verified: true }, {}));
  const admin = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(now().getTime() / 1000) };
  assert.equal((await route(admin, {})).stopped.length, 3);
});
