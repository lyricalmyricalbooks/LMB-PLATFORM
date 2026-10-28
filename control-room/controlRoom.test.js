// The control room (code plan 2.8), against a test shop made by the real setup steps with pretend Google and services:
// only platform admins get in; the list shows plan, version, health and switches; "act as this shop" is logged before
// any sign-in is made; and a switch changes the saved profile, its file and the live pages, with a log entry.
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ACT_AS_MINUTES, SIGN_IN_HOURS, adminOf, controlRoomAdmins, createControlRoom, profilePublisher, shopHealth, twoStepProblem } from "./controlRoom.js";
import { controlRoutes } from "./routes.js";
import { platformRoutes } from "./platformControls.js";
import { parseSwitchArgs, switchCommand } from "./switch.js";
import { fakeActivity, fakeBreachStore, fakePlatformState, fakeRepairQueue, fakeRepairStore, fakeShopAccess } from "./fakes.js";
import { feeForShop } from "../services/payments/fees.js";
import { createBreachRegister, keepUntil } from "./breaches.js";
import { controlRoomPeople } from "./people.js";
import { createRepairQueue } from "./repairs.js";
import { createSelfChecks } from "./selfChecks.js";
import { createPaymentService } from "../services/payments/service.js";
import { hashServiceKey } from "../services/email/http.js";
import { envPayments } from "./emergencyPayments.js";
import { readShopConfig } from "../apps/shop/functions/shopConfig.js";
import { TEMPLATES } from "../services/email/templates.js";
import { DEFAULT_SETTINGS } from "../services/settings.js";
import { MAX_MINUTES, SUPPORT_UID, supportAccess } from "./supportAccess.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";
import { runSteps } from "../setup/runner.js";
import { shopSteps } from "../setup/later-steps.js";
import { SWITCHES, shopSwitches } from "../setup/steps.js";
import { profileScript } from "../profile/profile.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "../setup/fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "../setup/test-shop.js";

const ID = TEST_SHOP.shopId;
const envOf = (text) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

/** A pretend platform email service: what would be sent, by idempotency key (the real one sends each key once). */
function fakeEmail() {
  const sent = new Map();
  return { sent, sendPlatform: async (message) => void (sent.has(message.idempotencyKey) || sent.set(message.idempotencyKey, structuredClone(message))) };
}

async function world({ repairs, newsletters, googleSteps } = {}) {
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
  const email = fakeEmail();
  const square = new Set();
  const breachStore = fakeBreachStore();
  const built = [];
  const activity = fakeActivity();
  const platformState = fakePlatformState();
  const publish = profilePublisher({ deploy: services.deploy, registry, build: async (v) => void built.push(v) });
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const room = createControlRoom({
    registry, auditLog, profileFiles, publish, shopAccess, repairs, newsletters, shopData: services.shopData,
    envFiles: services.envFiles, deploy: services.deploy, build: async (v) => void built.push(v), email, squareAccount: async (id) => (square.has(id) ? { locationId: "L1" } : null),
    breaches: createBreachRegister({ store: breachStore, registry, auditLog, now: () => new Date(clock), newId: () => `b${breachStore.rows.size + 1}` }),
    people: controlRoomPeople({}),
    activity, platformState, googleSteps,
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: " Admin@Example.com ,not-an-email" }),
    now: () => new Date((clock += 1000)),
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: controlRoutes(room) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const events = (shopId = ID) => [...(registry.events.get(shopId)?.values() ?? [])].filter((e) => e.source === "control-room");
  return { google, services, registry, profileFiles, auditLog, shopAccess, room, ask, events, built, email, square, breachStore, activity, platformState };
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
  assert.deepEqual(w.shopAccess.calls, [{ shopId: ID, by: ADMIN.email, reason: "the owner asked for help with tax", minutes: ACT_AS_MINUTES, mode: "view" }]);
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.by, entry.reason, entry.expiresAt, entry.mode], ["act-as", ADMIN.email, "the owner asked for help with tax", answer.body.expiresAt, "view"]);
  assert.ok(w.auditLog.entries.get(ID).has(entry.id), "in the shop's own audit log too");

  // Making changes is asked for by name; anything else is refused before the log.
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked for help with tax", mode: "owner" })).status, 400);
  const edit = await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked me to fix a price", mode: "edit" });
  assert.equal(edit.body.mode, "edit");
  assert.equal(w.shopAccess.calls.at(-1).mode, "edit");
  assert.equal(w.events().at(-1).mode, "edit");

  // A log that can't be written stops the sign-in.
  w.registry.recordEvent = async () => { throw new Error("the registry is down (pretend error)"); };
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked for help again" })).status, 500);
  assert.equal(w.shopAccess.calls.length, 2);
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
  for (const path of [...Object.keys(controlRoutes({})), ...Object.keys(platformRoutes({}))]) assert.ok(app.includes(`"${path.split(" ")[1].replace("/api", "")}"`), path);
  for (const name of SWITCHES) assert.ok(app.includes(name), `words for ${name}`);
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/);
});

test("the real support sign-in: a token for the support account with who, why and until, opened at the shop's admin", async () => {
  const w = await world();
  const made = [];
  const identity = { customToken: async (sa, uid, claims) => { made.push({ sa, uid, claims }); return "signed.jwt"; } };
  const now = () => new Date("2026-10-28T12:00:00Z");
  const access = supportAccess({ identity, registry: w.registry, serviceAccount: "platform@example.com", now });
  const { url, until } = await access.supportSignIn(ID, { by: ADMIN.email, reason: "x".repeat(500), minutes: 30 });
  const profile = await w.registry.getProfile(ID);
  assert.equal(url, `${profile.siteUrl}/admin/#support=signed.jwt`);
  assert.equal(until, now().getTime() / 1000 + 1800);
  assert.deepEqual(made[0].uid, SUPPORT_UID);
  assert.deepEqual(made[0].claims.support, { by: ADMIN.email, reason: "x".repeat(200), until, mode: "view" });
  await access.supportSignIn(ID, { by: ADMIN.email, reason: "fix a price", mode: "edit" });
  assert.equal(made[1].claims.support.mode, "edit");
  assert.ok(JSON.stringify(made[0].claims).length < 1000, "a token's claims stay under Firebase's limit");
  // Never longer than the sign-in token itself lasts.
  assert.equal((await access.supportSignIn(ID, { by: ADMIN.email, reason: "long one", minutes: 600 })).until, now().getTime() / 1000 + MAX_MINUTES * 60);
  await assert.rejects(supportAccess({ identity, registry: w.registry }).supportSignIn(ID, { by: ADMIN.email, reason: "r" }), /service account/);
});

test("close a shop for abuse: admins only, a reason, logged first, checkout and pages closed; opening it again puts things back", async () => {
  const w = await world();
  const settingsKey = `${ID} settings/website`;
  w.services.world.docs.set(settingsKey, { shopName: "Test Press", maintenance: { enabled: false, message: "Back after the fair" } });
  assert.equal((await w.ask(PRESS, "POST", "/api/control/close", { shopId: ID, reason: "selling stolen card numbers" })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/close", { shopId: ID, reason: "spam" })).status, 400);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/close", { shopId: "no-such-shop", reason: "selling stolen card numbers" })).status, 404);
  assert.equal(w.events().length, 0);

  const closed = await w.ask(ADMIN, "POST", "/api/control/close", { shopId: ID, reason: "selling stolen card numbers" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.changed, true);
  // The shop's own pause: its server closes checkout and its pages show the press's pause words.
  assert.deepEqual(w.services.world.docs.get(settingsKey), { shopName: "Test Press", maintenance: { enabled: true, message: "Back after the fair" } });
  const row = await w.registry.getShop(ID);
  assert.deepEqual([row.closure.by, row.closure.reason], [ADMIN.email, "selling stolen card numbers"]);
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.by, entry.reason], ["shop-closed", ADMIN.email, "selling stolen card numbers"]);
  assert.ok(w.auditLog.entries.get(ID).has(entry.id), "in the shop's own audit log too");
  const listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.equal(listed.closed.reason, "selling stolen card numbers");
  assert.match(listed.health.reasons.join(" "), /closed by the platform on 2026-10-28: selling stolen card numbers/);

  // The platform's payment service refuses the shop while it is closed, whatever its own settings say.
  const key = "shop-service-key-test-shop-0123456789abcdef";
  await w.registry.updateShop(ID, { serviceKeyHash: hashServiceKey(key), payments: { provider: "stripe", accountId: "acct_test", mode: "test" } });
  const payments = createPaymentService({ stripe: { call: async () => assert.fail("Stripe was asked") }, registry: w.registry, auditLog: w.auditLog, accounts: {}, deliver: async () => ({ status: 200 }), config: { webhookSecrets: { live: [], test: [] }, fee: { basisPoints: 0, refunded: true } } });
  const refused = await payments.shopCall({ headers: { "X-Shop-Id": ID, Authorization: `Bearer ${key}` }, body: { op: "paymentIntents.create", mode: "test", args: {} } });
  assert.deepEqual([refused.status, refused.body.error.code], [403, "shop_closed"]);

  // Closing twice changes nothing.
  assert.equal((await w.room.closeShop(ADMIN, { shopId: ID, reason: "selling stolen card numbers again" })).changed, false);

  // A press who turns the pause off finds it back on after the next self-check.
  const checks = createSelfChecks({ registry: w.registry, profileFiles: w.profileFiles, deploy: w.services.deploy, publish: async () => ({ apps: [] }), repairs: createRepairQueue({ store: fakeRepairStore(), registry: w.registry, auditLog: w.auditLog }), shopData: w.services.shopData });
  w.services.world.docs.set(settingsKey, { shopName: "Test Press", maintenance: { enabled: false, message: "" } });
  const result = await checks.check(ID);
  assert.deepEqual(result.results.find((r) => r.check === "closed"), { check: "closed", ok: true, fixed: "turned the shop's pause page on again" });
  assert.equal(w.services.world.docs.get(settingsKey).maintenance.enabled, true);

  // Opening again: the pause goes back to how the press had it, and the payment service lets the shop in.
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/reopen", { shopId: ID, reason: "x" })).status, 400);
  w.services.world.docs.set(settingsKey, { shopName: "Test Press", maintenance: { enabled: true, message: "" } });
  const opened = await w.ask(ADMIN, "POST", "/api/control/reopen", { shopId: ID, reason: "the press proved the cards were theirs" });
  assert.equal(opened.status, 200);
  assert.deepEqual(w.services.world.docs.get(settingsKey), { shopName: "Test Press", maintenance: { enabled: false, message: "Back after the fair" } });
  const after = await w.registry.getShop(ID);
  assert.equal(after.closure, null);
  assert.deepEqual([after.lastClosure.reopenedBy, after.lastClosure.reopenReason], [ADMIN.email, "the press proved the cards were theirs"]);
  assert.deepEqual(w.events().map((e) => e.what), ["shop-closed", "shop-reopened"]);
  const allowed = await payments.shopCall({ headers: { "X-Shop-Id": ID, Authorization: `Bearer ${key}` }, body: { op: "account.status", mode: "test", args: {} } }).catch((e) => e);
  assert.notEqual(allowed.body?.error?.code, "shop_closed");
});

test("emergency payments: a shop moves to the press's own Stripe keys and back, deployed again, the press emailed each time", async () => {
  const w = await world();
  const ask = (body) => w.ask(ADMIN, "POST", "/api/control/payments", { shopId: ID, reason: "the platform's Stripe account is paused", ...body });
  assert.equal((await w.ask(PRESS, "POST", "/api/control/payments", { shopId: ID, to: "own", reason: "the platform's Stripe account is paused" })).status, 403);
  assert.equal((await ask({ to: "paypal" })).status, 400);
  assert.equal((await ask({ to: "own", reason: "" })).status, 400);
  assert.equal((await ask({ to: "own", shopId: "no-such-shop" })).status, 404);
  assert.equal((await ask({ to: "platform" })).body.shops[0].skipped, "already on the platform's payments", "off unless used");

  const envBefore = await w.services.envFiles.read(ID);
  const profileBefore = await w.registry.getProfile(ID);
  const paymentsBefore = (await w.registry.getShop(ID)).payments;
  const owner = (await w.registry.getShop(ID)).ownerEmail;
  const deploysBefore = w.services.calls.length;

  const moved = await ask({ to: "own" });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.body.shops.map((s) => [s.shopId, s.changed, s.ready, s.server, s.pages]), [[ID, true, false, true, ["shop", "stockroom"]]]);
  // The shop's own-key path: its server reads the new settings as the press's own Stripe keys.
  const envNow = await w.services.envFiles.read(ID);
  assert.deepEqual(envPayments(envNow), { provider: "stripe", mode: "own" });
  assert.deepEqual([readShopConfig({ ...envOf(envNow), GCLOUD_PROJECT: ID }).paymentMode, readShopConfig({ ...envOf(envNow), GCLOUD_PROJECT: ID }).paymentProvider], ["own", "stripe"]);
  assert.equal(envNow.split("\n").length, envBefore.split("\n").length, "every other setting is kept");
  const calls = w.services.calls.slice(deploysBefore).map(([name, , version]) => [name, version]);
  assert.deepEqual(calls, [["envFiles.write", undefined], ["deploy.functions", "0.0.0-test"], ["deploy.pages", "0.0.0-test"], ["deploy.pages", "0.0.0-test"]], "server code and pages go out again at their own release");
  assert.deepEqual((await w.registry.getProfile(ID)).payments, { provider: "stripe", mode: "own" });
  const row = await w.registry.getShop(ID);
  assert.deepEqual([row.paymentsEmergency.to, row.paymentsEmergency.by], ["own", ADMIN.email]);
  assert.deepEqual(row.payments, paymentsBefore, "the platform account is kept for the way back");
  const [first] = w.email.sent.values();
  assert.deepEqual([first.kind, first.to, first.data.to, first.data.ready], ["payments-moved", owner, "own", false]);
  assert.match(TEMPLATES[first.kind](first.data, { settings: DEFAULT_SETTINGS, pressName: first.data.pressName }).text, /connect your own Stripe account\. Until you do, shoppers can't pay by card/);
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.from, entry.to, entry.by], ["payments-moved", "platform", "own", ADMIN.email]);
  assert.ok(w.auditLog.entries.get(ID).has(entry.id));
  const listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.equal(listed.paymentsMoved.to, "own");

  // Running it again changes nothing and emails nobody twice.
  const again = await ask({ to: "own" });
  assert.deepEqual([again.body.shops[0].changed, again.body.shops[0].server, again.body.shops[0].pages], [false, false, []]);
  assert.equal(w.email.sent.size, 1);

  // Back: everything as it was, and the press is told.
  const back = await ask({ to: "platform", reason: "the platform's Stripe account works again" });
  assert.equal(back.body.shops[0].changed, true);
  assert.equal(await w.services.envFiles.read(ID), envBefore);
  assert.deepEqual(await w.registry.getProfile(ID), profileBefore);
  const after = await w.registry.getShop(ID);
  assert.deepEqual([after.paymentsEmergency, after.payments, after.lastPaymentsEmergency.to], [null, paymentsBefore, "own"]);
  assert.deepEqual([...w.email.sent.values()].map((m) => m.data.to), ["own", "platform"]);
});

test("emergency payments: every live shop to Square at once; refused when the switch isn't set up", async () => {
  const w = await world();
  w.square.add(ID);
  const answer = await w.ask(ADMIN, "POST", "/api/control/payments", { all: true, to: "square", reason: "the platform's Stripe account is paused" });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.shops.map((s) => [s.shopId, s.changed, s.ready]), [[ID, true, true]], "only live shops; press-two is still being made");
  const envNow = await w.services.envFiles.read(ID);
  assert.equal(readShopConfig({ ...envOf(envNow), GCLOUD_PROJECT: ID }).paymentProvider, "square");
  assert.deepEqual((await w.registry.getProfile(ID)).payments, { provider: "square", mode: "platform" });
  assert.equal((await w.registry.getShop(ID)).payments.provider, "square", "the payment service routes the shop to Square");
  assert.match(TEMPLATES["payments-moved"]({ to: "square", ready: true }, { settings: DEFAULT_SETTINGS, pressName: "Test Press" }).text, /Square account is connected/);

  const bare = createControlRoom({ registry: w.registry, auditLog: w.auditLog, profileFiles: w.profileFiles, publish: async () => ({ apps: [] }), admins: [ADMIN.email] });
  await assert.rejects(bare.movePayments(ADMIN, { shopId: ID, to: "own", reason: "the platform's Stripe account is paused" }), { status: 503 });
});

test("the breach register: admins only, every field required, kept two years with no way to delete, the shops' logs told", async () => {
  const w = await world();
  const good = { foundOn: "2026-10-27", what: "A support visit showed one press's order list to another press by mistake.", shops: [ID], people: "about 12 shoppers of the test press", reportedToCommissioner: false, peopleTold: false };
  assert.equal((await w.ask(PRESS, "POST", "/api/control/breaches")).status, 403);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/breaches/record", good)).status, 403);
  for (const wrong of [{ foundOn: "27/10/2026" }, { foundOn: "2026-10-29" }, { what: " " }, { people: "" }, { peopleTold: "no" }, { shops: ["no-such-shop"] }]) {
    assert.equal((await w.ask(ADMIN, "POST", "/api/control/breaches/record", { ...good, ...wrong })).status, 400, JSON.stringify(wrong));
  }
  assert.equal(w.breachStore.rows.size, 0);

  const recorded = await w.ask(ADMIN, "POST", "/api/control/breaches/record", good);
  assert.equal(recorded.status, 200);
  const entry = recorded.body.breach;
  assert.deepEqual([entry.foundOn, entry.shops, entry.reportedToCommissioner, entry.peopleTold, entry.recordedBy, entry.keepUntil], ["2026-10-27", [ID], false, false, ADMIN.email, "2028-10-27"]);
  const [logged] = w.events();
  assert.deepEqual([logged.what, logged.breachId, logged.by], ["breach-recorded", entry.id, ADMIN.email]);
  assert.equal(logged.people, undefined, "the shop's log names the entry, not its details");
  assert.ok(w.auditLog.entries.get(ID).has(logged.id));

  const updated = await w.ask(ADMIN, "POST", "/api/control/breaches/update", { id: entry.id, reportedToCommissioner: true, note: "Filed online, reference 123." });
  assert.equal(updated.body.breach.reportedToCommissioner, true);
  assert.deepEqual(updated.body.breach.history.map((h) => h.what), ["recorded", "reported to the Privacy Commissioner"]);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/breaches/update", { id: entry.id })).status, 400, "nothing to add");
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/breaches/update", { id: "nope", peopleTold: true })).status, 404);
  // A mark can't be taken back.
  await w.ask(ADMIN, "POST", "/api/control/breaches/update", { id: entry.id, reportedToCommissioner: false, note: "checking" });
  assert.equal(w.breachStore.rows.get(entry.id).reportedToCommissioner, true);

  const list = await w.ask(ADMIN, "POST", "/api/control/breaches");
  assert.deepEqual([list.body.breaches.length, list.body.privacyContact], [1, "privacy@platform.example"]);
  assert.ok(!Object.keys(controlRoutes(w.room)).some((route) => /delete|remove/.test(route)), "no route deletes an entry");
  assert.equal(keepUntil("2028-02-29"), "2030-03-01");
});

test("the control room's people: a placeholder privacy contact, and nobody as admin address or backup person until set", () => {
  assert.deepEqual(controlRoomPeople({}), { privacyContact: "privacy@platform.example", adminEmail: null, backupPerson: null });
  assert.deepEqual(controlRoomPeople({ PLATFORM_DOMAIN: "colophon.example", PLATFORM_ADMIN_EMAIL: " Owner@Example.com ", PLATFORM_BACKUP_PERSON: "backup@example.com" }), {
    privacyContact: "privacy@colophon.example", adminEmail: "owner@example.com", backupPerson: "backup@example.com",
  });
  assert.throws(() => controlRoomPeople({ PLATFORM_BACKUP_PERSON: "someone" }), /PLATFORM_BACKUP_PERSON is not an email address/);
});

test("a paused newsletter is turned back on by a platform admin only, with a reason, and logged", async () => {
  const paused = new Set([ID]);
  const calls = [];
  const newsletters = { resume: async (shopId, options) => { calls.push({ shopId, ...options }); return { resumed: paused.delete(shopId) }; } };
  const w = await world({ newsletters });
  const path = "/api/control/newsletter/resume";
  assert.equal((await w.ask(PRESS, "POST", path, { shopId: ID, reason: "the press cleaned its list" })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", path, { shopId: ID, reason: "ok" })).status, 400);
  assert.equal((await w.ask(ADMIN, "POST", path, { shopId: "no-such-shop", reason: "the press cleaned its list" })).status, 404);
  const answer = await w.ask(ADMIN, "POST", path, { shopId: ID, reason: "the press cleaned its list" });
  assert.equal(answer.status, 200);
  assert.deepEqual(calls, [{ shopId: ID, by: "admin@example.com", reason: "the press cleaned its list" }]);
  assert.ok(w.events().some((e) => e.what === "newsletter-resumed" && e.by === "admin@example.com"));
  assert.equal((await w.ask(ADMIN, "POST", path, { shopId: ID, reason: "the press cleaned its list" })).status, 409);
});

test("every logged control-room action also lands in the activity log, once (plan 9.9)", async () => {
  const w = await world();
  await w.room.switch(ADMIN, { shopId: ID, name: SWITCHES[0], on: true, reason: "the press asked for it" });
  await w.room.actAs(ADMIN, { shopId: ID, reason: "help with their tax settings" });
  const entries = await w.activity.list();
  assert.deepEqual(entries.map((e) => e.what).sort(), ["act-as", "switch-set"]);
  assert.ok(entries.every((e) => e.shopId === ID && e.by === "admin@example.com" && e.keepUntil > e.at));
});

test("only Julian's listed address, with two-step sign-in in the last 12 hours, opens the control room (plan 9.1)", async () => {
  const w = await world();
  const { firebase: _, ...oneStep } = ADMIN;
  const noStep = await w.ask(oneStep, "GET", "/api/control/shops");
  assert.equal(noStep.status, 403);
  assert.match(noStep.body.message, /two-step/);
  const old = await w.ask({ ...ADMIN, auth_time: Math.floor(Date.now() / 1000) - 13 * 3600 }, "GET", "/api/control/shops");
  assert.equal(old.status, 401);
  assert.match(old.body.message, /Sign in again/);
  // A stranger with two steps is still a stranger, and isn't told about two-step sign-in.
  const stranger = await w.ask({ ...ADMIN, uid: "x", email: "someone@example.com" }, "GET", "/api/control/shops");
  assert.equal(stranger.status, 403);
  assert.doesNotMatch(stranger.body.message, /two-step/);
  assert.equal((await w.ask(ADMIN, "GET", "/api/control/shops")).status, 200);
  assert.equal(twoStepProblem({ firebase: { sign_in_second_factor: "phone" }, auth_time: 1000 }, 1000 * 1000 + SIGN_IN_HOURS * 3600_000), null);
});

test("Today reads every shop through the control room, admins only (plan 9.2)", async () => {
  const w = await world();
  const today = await w.ask(ADMIN, "GET", "/api/control/today");
  assert.equal(today.status, 200);
  assert.equal(today.body.counts.shops, 1);
  assert.equal(today.body.currency, "CAD");
  assert.equal((await w.ask(PRESS, "GET", "/api/control/today")).status, 403);
});

test("one shop's record: owner, billing, setup, fee and its history, admins only (plan 9.3)", async () => {
  const w = await world();
  await w.registry.updateShop(ID, { billing: { plan: "both", status: "trialing", access: "open", trialEnd: "2026-11-11T00:00:00Z", hasCard: false } });
  await w.room.actAs(ADMIN, { shopId: ID, reason: "help with their tax settings" });
  const record = (await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body;
  assert.equal(record.ownerEmail, "owner@example.com");
  assert.equal(record.billing.status, "trialing");
  assert.ok(record.setup.length >= 6 && record.setup.every((step) => step.ok));
  assert.deepEqual([record.fee.basisPoints, record.fee.next], [0, null]);
  assert.deepEqual(record.history.map((e) => e.what), ["act-as"]);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/shop", { shopId: ID })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: "nope" })).status, 404);
  const listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.deepEqual([listed.ownerEmail, listed.billingStatus], ["owner@example.com", "trialing"]);
});

test("the per-order fee: the press is emailed and the change starts 30 days later; same again changes nothing; today's fee cancels it (plan 9.6)", async () => {
  const w = await world();
  const why = "founding press agreed to 1.5%";
  for (const bad of [{ basisPoints: -1, refunded: true }, { basisPoints: 10001, refunded: true }, { basisPoints: 1.5, refunded: true }, { basisPoints: 150 }]) {
    await assert.rejects(w.room.setFee(ADMIN, { shopId: ID, ...bad, reason: why }), { status: 400 });
  }
  await assert.rejects(w.room.setFee(PRESS, { shopId: ID, basisPoints: 150, refunded: true, reason: why }), { status: 403 });
  const set = await w.room.setFee(ADMIN, { shopId: ID, basisPoints: 150, refunded: true, reason: why });
  assert.equal(set.changed, true);
  const days = (Date.parse(set.next.from) - Date.parse("2026-10-28T12:00:00Z")) / 86_400_000;
  assert.ok(days > 29.99 && days < 30.01, String(days));
  const row = await w.registry.getShop(ID);
  assert.equal(feeForShop(row, undefined, new Date("2026-11-01T00:00:00Z")).basisPoints, 0);
  assert.equal(feeForShop(row, undefined, new Date(Date.parse(set.next.from) + 1)).basisPoints, 150);
  const mails = [...w.email.sent.values()].filter((m) => m.kind === "platform-fee-changing");
  assert.equal(mails.length, 1);
  assert.deepEqual([mails[0].to, mails[0].data.toPercent, mails[0].data.fromPercent], ["owner@example.com", 1.5, 0]);
  assert.match(TEMPLATES[mails[0].kind](mails[0].data, { settings: DEFAULT_SETTINGS, pressName: "Test" }).text, /will be 1\.5%/);
  // The same change again: nothing new, no second email.
  assert.equal((await w.room.setFee(ADMIN, { shopId: ID, basisPoints: 150, refunded: true, reason: why })).changed, false);
  assert.equal([...w.email.sent.values()].filter((m) => m.kind === "platform-fee-changing").length, 1);
  // Setting today's fee again cancels the waiting change.
  const cancelled = await w.room.setFee(ADMIN, { shopId: ID, basisPoints: 0, refunded: true, reason: "press asked to keep it" });
  assert.equal(cancelled.cancelled, true);
  assert.equal((await w.registry.getShop(ID)).platformFee.next, undefined);
  assert.deepEqual(w.events().map((e) => e.what).filter((what) => what.startsWith("fee")), ["fee-change-scheduled", "fee-change-cancelled"]);
});

test("one switch for every live shop, and the switches new shops start with (plan 9.7)", async () => {
  const w = await world();
  const all = await w.room.switchAll(ADMIN, { name: "oldShopSync", on: true, reason: "turn the old tab on for everyone" });
  assert.deepEqual(all.shops, [{ shopId: ID, changed: true }]);
  assert.equal((await w.registry.getProfile(ID)).switches.oldShopSync, true);
  await assert.rejects(w.room.switchAll(ADMIN, { name: "nope", on: true, reason: "turn the old tab on" }), { status: 400 });
  await assert.rejects(w.room.switchAll(PRESS, { name: "oldShopSync", on: true, reason: "turn the old tab on" }), { status: 403 });

  assert.equal((await w.room.newShopSwitches(ADMIN)).switches.gmailOrderScan, false);
  assert.equal((await w.room.setNewShopSwitch(ADMIN, { name: "gmailOrderScan", on: true, reason: "every new shop scans Gmail" })).changed, true);
  assert.equal((await w.room.setNewShopSwitch(ADMIN, { name: "gmailOrderScan", on: true, reason: "every new shop scans Gmail" })).changed, false);
  const defaults = (await w.room.newShopSwitches(ADMIN)).switches;
  assert.equal(defaults.gmailOrderScan, true);
  // Setup step 6 uses them only where the shop has nothing saved.
  assert.equal(shopSwitches(undefined, defaults).gmailOrderScan, true);
  assert.equal(shopSwitches({ gmailOrderScan: false }, defaults).gmailOrderScan, false);
  assert.equal((await w.activity.list()).filter((e) => e.what === "new-shop-switch").length, 1);
});

test("your test shop: the card finds it, and Reset the sample books is admin only, logged and only for the test shop (plan 9.10)", async () => {
  const w = await world();
  await w.registry.recordReleaseCheck(ID, { ok: true, finishedAt: "2026-10-28T11:00:00Z", version: "0.0.0-test" });
  const card = await w.ask(ADMIN, "GET", "/api/control/test-shop");
  assert.equal(card.status, 200);
  const shop = card.body.testShop;
  const profile = await w.registry.getProfile(ID);
  assert.deepEqual([shop.shopId, shop.storefrontUrl, shop.adminUrl], [ID, profile.siteUrl, `${profile.siteUrl}/admin/`]);
  assert.deepEqual([shop.lastCheck.ok, shop.lastCheck.at], [true, "2026-10-28T11:00:00Z"]);
  assert.equal((await w.ask(PRESS, "GET", "/api/control/test-shop")).status, 403);

  // A sample book sold out in a test, then reset to 5 copies.
  await w.services.shopData.set(ID, "books/test-book-one", { title: "Test Book One", stockLevel: 0 });
  assert.equal((await w.ask(PRESS, "POST", "/api/control/test-shop/reset", { shopId: ID })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/test-shop/reset", { shopId: "press-two" })).status, 409);
  const reset = await w.ask(ADMIN, "POST", "/api/control/test-shop/reset", { shopId: ID });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.reset, 6, "five sample books and the shipping zone");
  assert.equal((await w.services.shopData.get(ID, "books/test-book-one")).stockLevel, 5);
  assert.ok(w.events().some((e) => e.what === "test-shop-reset" && e.by === "admin@example.com"));
  assert.ok((await w.activity.list()).some((e) => e.what === "test-shop-reset"));
});

test("no test shop yet: the card says so instead of failing (plan 9.10)", async () => {
  const w = await world();
  await w.registry.updateShop(ID, { testShop: false });
  assert.equal((await w.ask(ADMIN, "GET", "/api/control/test-shop")).body.testShop, null);
});

test("the shop record shows each Google step, and Run again runs one, admins only and logged (6.20 on 9.3)", async () => {
  const ran = [];
  const googleSteps = {
    googleStatus: async (shopId) => ({ shopId, stage: "connected", steps: [{ step: "analytics", state: "done" }, { step: "email", state: "failed", detail: "Google didn't answer.", canRunAgain: true }] }),
    async runAgain(shopId, step) {
      if (step === "deleteFirebase") throw new Error("This shop isn't due to be deleted yet");
      ran.push([shopId, step]);
      return { step, state: "done" };
    },
  };
  const w = await world({ googleSteps });
  await w.registry.updateShop(ID, { closing: { stage: "paused", deleteAfter: "2027-03-01T00:00:00Z" } });
  const record = (await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body;
  assert.deepEqual(record.google.steps.map((s) => s.state), ["done", "failed"]);
  assert.equal(record.closing.stage, "paused");

  assert.equal((await w.ask(PRESS, "POST", "/api/control/google-run-again", { shopId: ID, step: "email" })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/google-run-again", { shopId: ID })).status, 400);
  const again = await w.ask(ADMIN, "POST", "/api/control/google-run-again", { shopId: ID, step: "email" });
  assert.equal(again.status, 200);
  assert.equal(again.body.outcome.state, "done");
  assert.deepEqual(ran, [[ID, "email"]]);
  assert.ok(w.events().some((e) => e.what === "google-run-again" && e.step === "email"));
  // The Google side's own rules still hold: nothing deleted early.
  const early = await w.ask(ADMIN, "POST", "/api/control/google-run-again", { shopId: ID, step: "deleteFirebase" });
  assert.equal(early.status, 409);
  assert.match(early.body.message, /isn't due/);
});

test("without the Google steps the record still opens, and Run again says it can't reach them", async () => {
  const w = await world();
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body.google, null);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/google-run-again", { shopId: ID, step: "email" })).status, 503);
});
