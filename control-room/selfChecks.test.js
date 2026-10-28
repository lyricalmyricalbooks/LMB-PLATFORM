// Self-checks after every change and the repair queue (code plan 2.11), against a test shop made by the real setup
// steps with pretend Google and services: a healthy shop passes; a drifted profile file fixes itself; anything else
// goes to the repair queue once (never twice), closes itself when the check passes again, and a person can mark it
// fixed; a switch change and the shop maker both run the checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSelfChecks } from "./selfChecks.js";
import { createRepairQueue } from "./repairs.js";
import { selfCheckCommand } from "./self-check.js";
import { createControlRoom, profilePublisher, shopHealth } from "./controlRoom.js";
import { controlRoutes } from "./routes.js";
import { fakeRepairStore, fakeShopAccess } from "./fakes.js";
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
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };

async function world() {
  const google = fakeGoogle();
  const services = fakeServices();
  const registry = fakeRegistry();
  const profileFiles = fakeProfileFiles();
  const auditLog = fakeAuditLog();
  const result = await runSteps({ shop: TEST_SHOP, registry, auditLog, steps: shopSteps({ ...services, google, registry, profileFiles, config: TEST_CONFIG }) });
  assert.equal(result.ok, true, result.error);
  await registry.updateShop(ID, { release: { version: "0.0.0-test", at: "2026-10-28T00:00:00Z", runId: "r1" } });
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const now = () => new Date((clock += 1000));
  const store = fakeRepairStore();
  const repairs = createRepairQueue({ store, registry, auditLog, now });
  const publish = profilePublisher({ deploy: services.deploy, registry });
  const selfCheck = createSelfChecks({ registry, profileFiles, deploy: services.deploy, publish, repairs, google, now });
  const room = createControlRoom({ registry, auditLog, profileFiles, publish, shopAccess: fakeShopAccess(), repairs, selfCheck, admins: [ADMIN.email], now });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: controlRoutes(room) });
  const ask = (method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(ADMIN)}` } });
  const open = () => [...store.rows.values()].filter((r) => r.status === "open");
  const events = (what) => [...(registry.events.get(ID)?.values() ?? [])].filter((e) => e.what === what);
  return { google, services, registry, profileFiles, auditLog, store, repairs, selfCheck, room, ask, open, events };
}

test("a shop just made passes every self-check, and the run is logged", async () => {
  const w = await world();
  const result = await w.selfCheck.check(ID, { why: "test" });
  assert.equal(result.ok, true, JSON.stringify(result.results));
  assert.deepEqual(result.results.map((r) => r.check), ["profile", "profile-file", "release", "service-key", "plan"]);
  assert.deepEqual(w.open(), []);
  const [entry] = w.events("self-check");
  assert.deepEqual([entry.ok, entry.why], [true, "test"]);
});

test("a /shop-profile.js that drifted fixes itself: rewritten from the saved profile and published", async () => {
  const w = await world();
  await w.profileFiles.write(ID, "// someone's old copy\n");
  const before = w.services.calls.length;
  const result = await w.selfCheck.check(ID);
  const fileCheck = result.results.find((r) => r.check === "profile-file");
  assert.equal(fileCheck.ok, true);
  assert.match(fileCheck.fixed, /rewrote \/shop-profile\.js from the saved profile and deployed the shop and stockroom pages again/);
  assert.equal(await w.profileFiles.read(ID), profileScript(await w.registry.getProfile(ID)));
  assert.equal(w.services.calls.slice(before).filter(([c]) => c === "deploy.pages").length, 2);
  assert.deepEqual(w.open(), [], "nothing for a person");
});

test("a switch missing from the profile is written down as off, the way setup does", async () => {
  const w = await world();
  const profile = await w.registry.getProfile(ID);
  delete profile.switches[SWITCHES[2]];
  await w.registry.saveProfile(ID, profile);
  const result = await w.selfCheck.check(ID);
  assert.equal(result.ok, true, JSON.stringify(result.results));
  assert.equal((await w.registry.getProfile(ID)).switches[SWITCHES[2]], false);
});

test("a problem a person must fix goes to the repair queue once, then closes itself when the check passes", async () => {
  const w = await world();
  await w.registry.updateShop(ID, { release: { version: "0.0.2", at: "t", runId: "r2" } });
  let result = await w.selfCheck.check(ID);
  const release = result.results.find((r) => r.check === "release");
  assert.equal(release.ok, false);
  assert.match(release.problem, /not all on release 0\.0\.2: the rules: 0\.0\.0-test; the server code: 0\.0\.0-test; the shop pages: 0\.0\.0-test; the stockroom pages: 0\.0\.0-test/);
  assert.equal(w.open().length, 1);

  await w.selfCheck.check(ID);
  assert.equal(w.open().length, 1, "the same problem again is counted, not added");
  assert.equal(w.open()[0].count, 2);
  assert.equal(w.events("repair-opened").length, 1);
  assert.ok(w.auditLog.entries.get(ID).size > 0);

  await w.registry.updateShop(ID, { release: { version: "0.0.0-test", at: "t", runId: "r3" } });
  result = await w.selfCheck.check(ID);
  assert.equal(result.ok, true);
  assert.equal(w.open().length, 0);
  const [fixed] = w.events("repair-fixed");
  assert.deepEqual([fixed.by, fixed.check], ["self-check", "release"]);

  // The same problem back again reopens the same item, keeping its history.
  await w.registry.updateShop(ID, { release: { version: "0.0.2", at: "t", runId: "r4" } });
  await w.selfCheck.check(ID);
  const [again] = w.open();
  assert.deepEqual([again.reopened, again.count, again.status], [1, 1, "open"]);
  assert.equal(w.store.rows.size, 1);
});

test("the service key, an ended plan, a failed fix and a check that throws all reach the queue; the others still run", async () => {
  const w = await world();
  await w.registry.updateShop(ID, { billing: { access: "closed" } });
  await w.registry.updateShop(ID, { serviceKeyHash: "0".repeat(64) });
  await w.profileFiles.write(ID, "// old\n");
  w.services.deploy.pages = async () => { throw new Error("deploy refused (pretend error)"); };
  const result = await w.selfCheck.check(ID);
  const byName = Object.fromEntries(result.results.map((r) => [r.check, r]));
  assert.equal(byName["service-key"].ok, false);
  assert.match(byName["service-key"].problem, /doesn't match the registry's/);
  assert.equal(byName.plan.ok, false);
  assert.equal(byName["profile-file"].ok, false);
  const fileItem = w.open().find((r) => r.check === "profile-file");
  assert.match(fileItem.detail, /the fix failed: deploy refused/);
  assert.equal(byName.release.ok, true, "every check still ran");

  w.registry.getProfile = async () => { throw new Error("registry unreachable"); };
  const broken = await w.selfCheck.check(ID);
  assert.equal(broken.ok, false);
  assert.equal(broken.results.length, 5, "a check that throws doesn't stop the rest");
  assert.ok(w.open().some((r) => /couldn't check: registry unreachable/.test(r.problem)));
});

test("a switch change runs the self-checks, and the queue shows in the control room", async () => {
  const w = await world();
  await w.registry.updateShop(ID, { billing: { access: "closed" } });
  const answer = await w.ask("POST", "/api/control/switch", { shopId: ID, name: SWITCHES[0], on: true, reason: "the press asked for it" });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.selfCheck.ok, false);
  const [first] = (await w.ask("GET", "/api/control/shops")).body.shops;
  assert.equal(first.health.level, "problem");
  assert.match(first.health.reasons.join(" "), /in the repair queue: the plan has ended but the shop is still marked live/);

  const queue = (await w.ask("POST", "/api/control/repairs", {})).body.repairs;
  assert.equal(queue.length, 1);
  assert.equal((await w.ask("POST", "/api/control/repairs", { status: "lost" })).status, 400);
  const marked = await w.ask("POST", "/api/control/repairs/fixed", { id: queue[0].id, note: "closed the shop by hand" });
  assert.deepEqual([marked.status, marked.body.repair.status, marked.body.repair.fixedBy], [200, "fixed", ADMIN.email]);
  assert.equal((await w.ask("POST", "/api/control/repairs/fixed", { id: queue[0].id })).status, 200, "marking it twice is fine");
  assert.equal((await w.ask("POST", "/api/control/repairs/fixed", { id: "nope" })).status, 404);
  assert.equal((await w.ask("POST", "/api/control/repairs", { status: "fixed" })).body.repairs.length, 1);

  const now = await w.ask("POST", "/api/control/check", { shopId: ID });
  assert.equal(now.status, 200);
  assert.equal(now.body.ok, false, "the plan is still closed, so it is reported again");
  assert.equal((await w.ask("POST", "/api/control/check", { shopId: "nope" })).status, 404);
});

test("the daily sweep checks live shops only, and one shop's trouble never stops the others", async () => {
  const w = await world();
  await w.registry.createShop("press-two", { shopId: "press-two", pressName: "Another Press", plan: "shop", status: "creating", ownerEmail: "two@example.com" });
  await w.registry.createShop("press-three", { shopId: "press-three", pressName: "Third", plan: "shop", status: "live", ownerEmail: "three@example.com" });
  const results = await w.selfCheck.sweep();
  assert.deepEqual(results.map((r) => [r.shopId, r.ok]), [[ID, true], ["press-three", false]]);
  assert.ok(w.store.rows.size >= 1);
  assert.ok([...w.store.rows.values()].every((r) => r.shopId === "press-three"));
});

test("the five-minute health watch shows in the control room's health", () => {
  const health = shopHealth({ row: { status: "live", health: { checks: { pages: { ok: false, detail: "/admin answered 500" }, backup: { ok: true } } } }, profile: {}, checks: [{ ok: true }] });
  assert.deepEqual(health, { level: "problem", reasons: ["the pages check is failing: /admin answered 500"] });
});

test("the repair queue refuses an item with no shop, check or problem", async () => {
  const repairs = createRepairQueue({ store: fakeRepairStore(), registry: fakeRegistry(), auditLog: fakeAuditLog() });
  await assert.rejects(repairs.report({ shopId: ID, check: "x" }), /needs a shop, a check and a problem/);
  await assert.rejects(repairs.list({ status: "lost" }), /open or fixed/);
  assert.equal(await repairs.markFixed("nope", { by: "a" }), null);
});

test("the command line: one shop or the sweep, prints what it fixed and queued, refuses without real clients", async () => {
  const w = await world();
  await assert.rejects(selfCheckCommand({ clients: {} }), /need the platform's real clients\. Nothing was checked/);
  await w.profileFiles.write(ID, "// old\n");
  await w.registry.updateShop(ID, { billing: { access: "closed" } });
  const printed = [];
  const clients = { registry: w.registry, deploy: w.services.deploy, profileFiles: w.profileFiles, repairStore: w.store, auditLog: w.auditLog, google: w.google };
  const [result] = await selfCheckCommand({ argv: [ID], clients, print: (line) => printed.push(line) });
  assert.equal(result.ok, false);
  assert.deepEqual(printed.slice(0, 1), [`${ID}: problems`]);
  assert.ok(printed.some((line) => /fixed profile-file: rewrote/.test(line)));
  assert.ok(printed.some((line) => /to the repair queue: plan: the plan has ended/.test(line)));
  assert.equal((await selfCheckCommand({ clients, print: () => {} })).length, 1, "the sweep: every live shop");
});
