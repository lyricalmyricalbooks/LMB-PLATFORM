// The control room (code plan 2.8), against a test shop made by the real setup steps with pretend Google and services:
// only platform admins get in; the list shows plan, version, health and switches; "act as this shop" is logged before
// any sign-in is made; and a switch changes the saved profile, its file and the live pages, with a log entry.
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ACT_AS_MINUTES, adminOf, controlRoomAdmins, createControlRoom, profilePublisher, shopHealth } from "./controlRoom.js";
import { controlRoutes } from "./routes.js";
import { parseSwitchArgs, switchCommand } from "./switch.js";
import { fakeRepairQueue, fakeShopAccess } from "./fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";
import { runSteps } from "../setup/runner.js";
import { shopSteps } from "../setup/later-steps.js";
import { SWITCHES } from "../setup/steps.js";
import { profileScript } from "../profile/profile.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "../setup/fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "../setup/test-shop.js";

const ID = TEST_SHOP.shopId;
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world({ repairs } = {}) {
  const google = fakeGoogle();
  const services = fakeServices();
  const registry = fakeRegistry();
  const profileFiles = fakeProfileFiles();
  const auditLog = fakeAuditLog();
  const result = await runSteps({ shop: TEST_SHOP, registry, auditLog, steps: shopSteps({ ...services, google, registry, profileFiles, config: TEST_CONFIG }) });
  assert.equal(result.ok, true, result.error);
  await registry.updateShop(ID, { release: { version: "0.0.0-test", at: "2026-10-28T00:00:00Z", runId: "r1" } });
  await registry.createShop("press-two", { shopId: "press-two", pressName: "Another Press", plan: "shop", status: "creating", ownerEmail: "two@example.com" });
  const shopAccess = fakeShopAccess();
  const built = [];
  const publish = profilePublisher({ deploy: services.deploy, registry, build: async (v) => void built.push(v) });
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const room = createControlRoom({
    registry, auditLog, profileFiles, publish, shopAccess, repairs, admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: " Admin@Example.com ,not-an-email" }),
    now: () => new Date((clock += 1000)),
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: controlRoutes(room) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const events = (shopId = ID) => [...(registry.events.get(shopId)?.values() ?? [])].filter((e) => e.source === "control-room");
  return { google, services, registry, profileFiles, auditLog, shopAccess, room, ask, events, built };
}

test("only platform admins get in; nobody is an admin unless the list says so", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "GET", "/api/control/shops")).status, 403);
  assert.equal((await w.ask({ ...ADMIN, email_verified: false }, "GET", "/api/control/shops")).status, 403);
  assert.equal((await w.ask(null, "GET", "/api/control/shops")).status, 401);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/switch", { shopId: ID, name: SWITCHES[0], on: true, reason: "a press asked for it" })).status, 403);
  assert.deepEqual(controlRoomAdmins({}), []);
  assert.throws(() => adminOf(ADMIN, []), { status: 403 });
});

test("the list: every shop with its plan, version, health and switches, problems first", async () => {
  const w = await world({ repairs: fakeRepairQueue({ "press-two": [] }) });
  await w.registry.recordReleaseCheck(ID, { ok: false, failedCheck: 3, error: "the email never came", finishedAt: "2026-10-28T11:00:00Z", version: "0.0.0-test" });
  const answer = await w.ask(ADMIN, "GET", "/api/control/shops");
  assert.equal(answer.status, 200);
  const [first, second] = answer.body.shops;
  assert.equal(first.shopId, ID);
  assert.deepEqual([first.plan, first.status, first.version, first.testShop], ["both", "live", "0.0.0-test", true]);
  assert.equal(first.health.level, "problem");
  assert.match(first.health.reasons[0], /the last release check failed at check 3: the email never came/);
  assert.deepEqual(first.switches, Object.fromEntries(SWITCHES.map((name) => [name, false])));
  assert.deepEqual([second.shopId, second.health.level, second.switches], ["press-two", "watch", null]);
  assert.deepEqual(answer.body.switchNames, SWITCHES);
});

test("health: ok, watch and problem, in plain words", () => {
  const live = { status: "live" };
  assert.deepEqual(shopHealth({ row: live, profile: {}, checks: [{ ok: true }] }), { level: "ok", reasons: [] });
  assert.equal(shopHealth({ row: { ...live, billing: { access: "paused" } }, profile: {} }).level, "watch");
  assert.equal(shopHealth({ row: { ...live, testShop: true }, profile: {} }).reasons[0], "the test shop has never passed a release check");
  assert.equal(shopHealth({ row: live, profile: null }).level, "problem");
  assert.deepEqual(shopHealth({ row: live, profile: {}, repairs: [{ problem: "step 4 stopped for a person" }] }).reasons, ["in the repair queue: step 4 stopped for a person"]);
});

test("act as this shop: a reason is required, the use is logged first, and no log means no sign-in", async () => {
  const w = await world();
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "help" })).status, 400);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: "press-two", reason: "the owner asked for help" })).status, 409);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: "no-such-shop", reason: "the owner asked for help" })).status, 404);
  assert.equal(w.shopAccess.calls.length, 0);

  const answer = await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked for help with tax" });
  assert.equal(answer.status, 200);
  assert.match(answer.body.url, /support=1/);
  assert.deepEqual(w.shopAccess.calls, [{ shopId: ID, by: ADMIN.email, reason: "the owner asked for help with tax", minutes: ACT_AS_MINUTES }]);
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.by, entry.reason, entry.expiresAt], ["act-as", ADMIN.email, "the owner asked for help with tax", answer.body.expiresAt]);
  assert.ok(w.auditLog.entries.get(ID).has(entry.id), "in the shop's own audit log too");

  // A log that can't be written stops the sign-in.
  w.registry.recordEvent = async () => { throw new Error("the registry is down (pretend error)"); };
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked for help again" })).status, 500);
  assert.equal(w.shopAccess.calls.length, 1);
});

test("a switch: the saved profile, its file and the live pages change, with a log entry; repeating it is safe", async () => {
  const w = await world();
  const name = SWITCHES[0];
  const before = w.services.calls.length;
  const saved = await w.registry.getProfile(ID);
  const answer = await w.ask(ADMIN, "POST", "/api/control/switch", { shopId: ID, name, on: true, reason: "the press moved its old stockroom sign-in" });
  assert.equal(answer.status, 200);
  assert.deepEqual([answer.body.from, answer.body.to, answer.body.changed, answer.body.published], [false, true, true, ["shop", "stockroom"]]);

  const profile = await w.registry.getProfile(ID);
  assert.equal(profile.switches[name], true);
  assert.deepEqual({ ...profile, switches: saved.switches }, saved, "everything else in the profile is kept");
  assert.equal(await w.profileFiles.read(ID), profileScript(profile));
  const deploys = w.services.calls.slice(before).filter(([call]) => call === "deploy.pages");
  assert.deepEqual(deploys.map(([, , version, app]) => [version, app]), [["0.0.0-test", "shop"], ["0.0.0-test", "stockroom"]], "the pages go out again at their own release");
  assert.deepEqual(w.built, ["0.0.0-test", "0.0.0-test"]);
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.switch, entry.from, entry.to, entry.by], ["switch-set", name, false, true, ADMIN.email]);
  assert.ok(w.auditLog.entries.get(ID).has(entry.id));

  const again = await w.room.switch(ADMIN, { shopId: ID, name, on: true, reason: "checking it is still on" });
  assert.equal(again.changed, false);
  assert.equal((await w.registry.getProfile(ID)).switches[name], true);
  assert.equal(w.events().length, 2, "every use is on record");

  // Off again; the other switches are untouched.
  await w.room.switch(ADMIN, { shopId: ID, name, on: false, reason: "the press no longer needs it" });
  assert.deepEqual((await w.registry.getProfile(ID)).switches, Object.fromEntries(SWITCHES.map((s) => [s, false])));
});

test("a switch refuses a made-up switch, a missing on/off, a missing reason and a shop with no profile", async () => {
  const w = await world();
  const ask = (body) => w.ask(ADMIN, "POST", "/api/control/switch", { shopId: ID, reason: "a good reason here", ...body });
  assert.equal((await ask({ name: "freeMoney", on: true })).status, 400);
  assert.equal((await ask({ name: SWITCHES[0], on: "yes" })).status, 400);
  assert.equal((await ask({ name: SWITCHES[0], on: true, reason: "" })).status, 400);
  assert.equal((await ask({ shopId: "press-two", name: SWITCHES[0], on: true })).status, 409);
  assert.equal(w.events().length, 0, "nothing changed, nothing logged");
});

test("the command line: same change and log, refuses without a name, a reason or real clients", async () => {
  const w = await world();
  const name = SWITCHES[1];
  assert.throws(() => parseSwitchArgs([ID, name, "maybe", "why"]), /Usage/);
  assert.throws(() => parseSwitchArgs([ID, name, "on"]), /Usage/);
  const argv = [ID, name, "on", "the", "press", "still", "uses", "its", "old", "address"];
  await assert.rejects(switchCommand({ argv, env: {}, clients: {} }), /CONTROL_ROOM_BY/);
  await assert.rejects(switchCommand({ argv, env: { CONTROL_ROOM_BY: "admin@example.com" } }), /needs the platform's real clients\. Nothing was changed/);

  const printed = [];
  const result = await switchCommand({
    argv, env: { CONTROL_ROOM_BY: "Admin@Example.com" }, print: (line) => printed.push(line),
    clients: { registry: w.registry, auditLog: w.auditLog, profileFiles: w.profileFiles, deploy: w.services.deploy },
  });
  assert.equal(result.changed, true);
  assert.equal((await w.registry.getProfile(ID)).switches[name], true);
  assert.match(printed[0], new RegExp(`${name} is on \\(was off\\)`));
  const [entry] = w.events();
  assert.deepEqual([entry.by, entry.reason], ["admin@example.com", "the press still uses its old address"]);
});

test("the page: admins sign in with Google, every route is used, names are shown as text only", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  for (const path of Object.keys(controlRoutes({}))) assert.ok(app.includes(`"${path.split(" ")[1].replace("/api", "")}"`), path);
  for (const name of SWITCHES) assert.ok(app.includes(name), `words for ${name}`);
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/);
});
