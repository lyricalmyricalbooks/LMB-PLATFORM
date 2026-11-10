// The shared system in the control room: admins only; shared release runs newest first, per project with its pages;
// each shared shop's month of use, busiest first, with its share of the bill once the month is reconciled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RUNS_SHOWN, createSharedSystemDesk, sharedSystemRoutes } from "./sharedSystem.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

function fakeMeters(records = {}) {
  return { get: async (shopId, month) => structuredClone(records[`${shopId}_${month}`] ?? null) };
}

async function world({ meters = fakeMeters() } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth", { shopId: "moth", pressName: "Moth Press", status: "live", shared: true, projectId: "demo-shared" });
  await registry.createShop("wasp", { shopId: "wasp", pressName: "Wasp Books", status: "live", shared: true, projectId: "demo-shared" });
  await registry.createShop("own", { shopId: "own", status: "live" });
  await registry.createShop("lmb-test-shop", { shopId: "lmb-test-shop", status: "abandoned", shared: true });
  await registry.recordRelease({ kind: "release", version: "1.0.0", runId: "r0", startedAt: "2026-11-08T10:00:00Z", ok: true, shops: [] });
  await registry.recordRelease({ kind: "shared-first-release", version: "1.1.0", runId: "r1", startedAt: "2026-11-09T10:00:00Z", ok: true, projects: [{ projectId: "demo-shared", status: "shipped" }] });
  await registry.recordRelease({ kind: "shared-release", version: "1.2.0", runId: "r2", startedAt: "2026-11-10T10:00:00Z", finishedAt: "2026-11-10T10:05:00Z", ok: false, error: "demo-shared: the check failed",
    projects: [{ projectId: "lmb-test-shop", status: "shipped", pages: { done: ["test-press"], failed: [] } }, { projectId: "demo-shared", status: "rolled-back", error: "the check failed", pages: { done: ["moth"], failed: [{ shopId: "wasp", error: "timed out" }] } }, { projectId: "demo-later", status: "not-run" }] });
  const desk = createSharedSystemDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, meters, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: sharedSystemRoutes(desk), log: () => {} });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, registry };
}

test("only platform admins see the shared releases and the use", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "GET", "/api/control/shared-releases")).status, 403);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/usage", {})).status, 403);
  assert.equal((await w.ask(ADMIN, "GET", "/api/control/shared-releases")).status, 200);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/usage", { month: "November" })).status, 400);
});

test("shared release runs: newest first, each project's result and its shops' pages", async () => {
  const { runs } = await (await world()).desk.releases(ADMIN);
  assert.deepEqual(runs.map((r) => r.version), ["1.2.0", "1.1.0"], "the per-project runner's runs aren't listed");
  const [latest] = runs;
  assert.equal(latest.ok, false);
  assert.equal(latest.error, "demo-shared: the check failed");
  assert.deepEqual(latest.projects.map((p) => [p.projectId, p.status, p.pagesDone, p.pagesFailed.length]), [["lmb-test-shop", "shipped", 1, 0], ["demo-shared", "rolled-back", 1, 1], ["demo-later", "not-run", 0, 0]]);
  assert.deepEqual(latest.projects[1].pagesFailed, [{ shopId: "wasp", error: "timed out" }]);
  assert.equal(runs[1].kind, "shared-first-release");
});

test("only the newest runs are listed", async () => {
  const w = await world();
  for (let i = 0; i < RUNS_SHOWN + 5; i += 1) await w.registry.recordRelease({ kind: "shared-release", version: `2.0.${i}`, runId: `x${i}`, startedAt: `2026-11-20T10:${String(i).padStart(2, "0")}:00Z`, ok: true, projects: [] });
  const { runs } = await w.desk.releases(ADMIN);
  assert.equal(runs.length, RUNS_SHOWN);
  assert.equal(runs[0].version, `2.0.${RUNS_SHOWN + 4}`);
});

test("each shared shop's month of use, busiest first, and its share once the bill is in", async () => {
  const meters = fakeMeters({
    "moth_2026-11": { invocations: 40, computeGbSeconds: 2, egressGb: 0.1, storageGb: 0.5, emails: 3, reconciled: false, updatedAt: "2026-11-10T06:00:00Z" },
    "moth_2026-10": { invocations: 300, computeGbSeconds: 9, egressGb: 1, storageGb: 0.4, emails: 20, reconciled: true, costCents: 120 },
    "wasp_2026-10": { invocations: 600, computeGbSeconds: 18, egressGb: 2, storageGb: 0.2, emails: 5, reconciled: true, costCents: 240 },
  });
  const w = await world({ meters });
  const now = await w.desk.usage(ADMIN);
  assert.equal(now.month, "2026-11");
  assert.deepEqual(now.shops.map((s) => [s.shopId, s.measured]), [["moth", true], ["wasp", false]], "the abandoned old test shop and the shop on its own project aren't listed");
  assert.equal(now.shops[0].costCents, null, "not split until the bill is in");
  assert.equal(now.reconciled, false);
  const last = await w.desk.usage(ADMIN, { month: "2026-10" });
  assert.deepEqual(last.shops.map((s) => s.shopId), ["wasp", "moth"]);
  assert.equal(last.reconciled, true);
  assert.equal(last.totals.costCents, 360);
  assert.equal(last.totals.invocations, 900);
});

test("before the shared system is on, the use says so", async () => {
  const w = await world({ meters: null });
  assert.deepEqual(await w.desk.usage(ADMIN), { month: "2026-11", connected: false, shops: [] });
});

test("both worlds serve the routes and the page shows them", () => {
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /sharedSystemRoutes\(createSharedSystemDesk/, door);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/shared-releases"/);
  assert.match(app, /"\/control\/usage"/);
});
