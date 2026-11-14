// The control room (code plan 2.8), against a test shop made by the real setup steps with pretend Google and services:
// only platform admins get in; the list shows plan, version and health; and "act as this shop" is logged before any
// sign-in is made.
import { TIERED_PRICES_ENV } from "../services/billing/fakes.js";
import { test } from "node:test";
import { PRIVACY_CONTACT } from "../terms/terms.js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ACT_AS_MINUTES, SHOPS_AT_ONCE, SIGN_IN_HOURS, adminOf, controlRoomAdmins, createControlRoom, eachInTurn, payoutWords, profilePublisher, sharedPublisher, shopHealth, twoStepProblem, zoneWriter } from "./controlRoom.js";
import { controlRoutes } from "./routes.js";
import { platformRoutes } from "./platformControls.js";
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

async function world({ repairs, newsletters, googleSteps, googleReady, taxWatch, bills, withStockroom = false, writeZone = null } = {}) {
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
    stockroomData: withStockroom ? { ...services.stockroom, ready: async () => true } : null,
    envFiles: services.envFiles, deploy: services.deploy, build: async (v) => void built.push(v), email, squareAccount: async (id) => (square.has(id) ? { locationId: "L1" } : null),
    breaches: createBreachRegister({ store: breachStore, registry, auditLog, now: () => new Date(clock), newId: () => `b${breachStore.rows.size + 1}` }),
    people: controlRoomPeople({}),
    activity, platformState, googleSteps, googleReady, taxWatch, bills, writeZone,
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: " Admin@Example.com ,not-an-email" }),
    now: () => new Date((clock += 1000)),
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings(TIERED_PRICES_ENV), routes: controlRoutes(room) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const events = (shopId = ID) => [...(registry.events.get(shopId)?.values() ?? [])].filter((e) => e.source === "control-room");
  return { google, services, registry, profileFiles, auditLog, shopAccess, room, ask, events, built, email, square, breachStore, activity, platformState };
}

test("only platform admins get in; nobody is an admin unless the list says so", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "GET", "/api/control/shops")).status, 403);
  assert.equal((await w.ask({ ...ADMIN, email_verified: false }, "GET", "/api/control/shops")).status, 403);
  assert.equal((await w.ask(null, "GET", "/api/control/shops")).status, 401);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/close", { shopId: ID })).status, 403);
  assert.deepEqual(controlRoomAdmins({}), []);
  assert.throws(() => adminOf(ADMIN, []), { status: 403 });
});

test("the list: every shop with its plan, version and health, problems first", async () => {
  const w = await world({ repairs: fakeRepairQueue({ "press-two": [] }) });
  await w.registry.recordReleaseCheck(ID, { ok: false, failedCheck: 3, error: "the email never came", finishedAt: "2026-10-28T11:00:00Z", version: "0.0.0-test" });
  const answer = await w.ask(ADMIN, "GET", "/api/control/shops");
  assert.equal(answer.status, 200);
  const [first, second] = answer.body.shops;
  assert.equal(first.shopId, ID);
  assert.deepEqual([first.plan, first.status, first.version, first.testShop], ["both", "live", "0.0.0-test", true]);
  assert.equal(first.health.level, "problem");
  assert.match(first.health.reasons[0], /the last release check failed at check 3: the email never came/);
  assert.deepEqual([second.shopId, second.health.level], ["press-two", "watch"]);
  assert.equal("switches" in first, false, "the retired switches are gone from the list");
  assert.equal("switchNames" in answer.body, false);
});

test("the list: cost this month from the budget notices, and a notice past the alert amount marks the shop watch (15.17)", async () => {
  const w = await world({ repairs: fakeRepairQueue({ "press-two": [] }) });
  const before = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === "press-two");
  assert.equal(before.costThisMonth, null);
  await w.registry.updateShop("press-two", { status: "live", spending: { level: "slow", costAmount: 12.5, budgetAmount: 10, currency: "USD", at: "2026-11-02T12:00:00Z" } });
  const after = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === "press-two");
  assert.deepEqual(after.costThisMonth, { amount: 12.5, budget: 10, currency: "USD", at: "2026-11-02T12:00:00Z" });
  assert.match(after.health.reasons.join(" "), /past its budget/);
  assert.ok(["watch", "problem"].includes(after.health.level));
});

test("health: ok, watch and problem, in plain words", () => {
  const live = { status: "live" };
  assert.deepEqual(shopHealth({ row: live, profile: {}, checks: [{ ok: true }] }), { level: "ok", reasons: [] });
  assert.equal(shopHealth({ row: { ...live, billing: { access: "paused" } }, profile: {} }).level, "watch");
  assert.equal(shopHealth({ row: { ...live, testShop: true }, profile: {} }).reasons[0], "the test shop has never passed a release check");
  assert.equal(shopHealth({ row: live, profile: null }).level, "problem");
  assert.deepEqual(shopHealth({ row: live, profile: {}, repairs: [{ problem: "step 4 stopped for a person" }] }).reasons, ["in the repair queue: step 4 stopped for a person"]);
});

test("act as this shop: the use is logged first, and no log means no sign-in", async () => {
  const w = await world();
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
  // "edit" waits for the press's yes (19.6, accessRequests.test.js): with no way to ask them, nothing is opened.
  const edit = await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked me to fix a price", mode: "edit" });
  assert.equal(edit.status, 503);
  assert.equal(w.shopAccess.calls.length, 1);

  // A log that can't be written stops the sign-in.
  w.registry.recordEvent = async () => { throw new Error("the registry is down (pretend error)"); };
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/act-as", { shopId: ID, reason: "the owner asked for help again" })).status, 500);
  assert.equal(w.shopAccess.calls.length, 1);
});

test("a shared-system shop has nothing to deploy when its profile changes; a shop with a project of its own is deployed again", async () => {
  const records = { get: async () => ({ profile: {} }) };
  const shared = new Set([ID]);
  const deployed = [];
  const publish = sharedPublisher({ recordsFor: async (id) => (shared.has(id) ? records : null), fallback: async (id) => (deployed.push(id), { apps: ["shop"] }) });
  assert.deepEqual(await publish(ID), { apps: [] });
  assert.deepEqual(deployed, []);
  shared.clear();
  assert.deepEqual(await publish(ID), { apps: ["shop"] });
  assert.deepEqual(deployed, [ID]);
});

test("the retired switches have no routes left", () => {
  const routes = Object.keys(controlRoutes({}));
  for (const gone of ["POST /api/control/switch", "POST /api/control/switch-all", "GET /api/control/new-shop-switches", "POST /api/control/new-shop-switches"]) {
    assert.equal(routes.includes(gone), false, gone);
  }
});

test("a shop's time zone moves its record, its saved profile and its registry row, with a log entry", async () => {
  const record = { SHOP_CURRENCY: "USD" };
  const sets = [];
  const records = {
    get: async () => structuredClone(record),
    set: async (shopId, data, { fields }) => { sets.push({ shopId, fields }); Object.assign(record, data); },
  };
  const shared = new Set([ID]);
  const w = await world({ writeZone: zoneWriter({ recordsFor: async (id) => (shared.has(id) ? records : null) }) });
  record.profile = { ...(await w.registry.getProfile(ID)) };
  assert.equal((await w.room.shop(ADMIN, { shopId: ID })).timeZone, "America/Toronto", "a shop with none follows Eastern time");

  const answer = await w.ask(ADMIN, "POST", "/api/control/time-zone", { shopId: ID, timeZone: "America/Los_Angeles", reason: "the press is in Portland, Oregon" });
  assert.equal(answer.status, 200);
  assert.deepEqual([answer.body.from, answer.body.to, answer.body.changed], ["America/Toronto", "America/Los_Angeles", true]);
  assert.equal(record.SHOP_TIME_ZONE, "America/Los_Angeles", "the server's clock");
  assert.equal(record.profile.timeZone, "America/Los_Angeles", "the pages' clock");
  assert.equal(record.SHOP_CURRENCY, "USD", "the record's other fields are kept");
  assert.equal((await w.registry.getProfile(ID)).timeZone, "America/Los_Angeles", "a later publish keeps it");
  assert.equal((await w.registry.getShop(ID)).timeZone, "America/Los_Angeles");
  assert.equal((await w.room.shop(ADMIN, { shopId: ID })).timeZone, "America/Los_Angeles");
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.from, entry.to, entry.by], ["time-zone-set", "America/Toronto", "America/Los_Angeles", ADMIN.email]);

  // Repeating it writes nothing new; back to Eastern time leaves the zone off the profile, as setup does.
  await w.room.timeZone(ADMIN, { shopId: ID, timeZone: "America/Los_Angeles", reason: "checking it is still set" });
  assert.equal(sets.length, 1);
  await w.room.timeZone(ADMIN, { shopId: ID, timeZone: "America/Toronto", reason: "the press moved back to Toronto" });
  assert.equal(record.SHOP_TIME_ZONE, "America/Toronto");
  assert.equal("timeZone" in record.profile, false);
  assert.equal("timeZone" in (await w.registry.getProfile(ID)), false);

  // Refused: a made-up zone, an unknown shop, a shop with its own project, and a room that can't write zones.
  const ask = (body) => w.ask(ADMIN, "POST", "/api/control/time-zone", { shopId: ID, reason: "a good reason here", ...body });
  assert.equal((await ask({ timeZone: "Pacific time" })).status, 400);
  assert.equal((await ask({ timeZone: "Mars/Olympus_Mons" })).status, 400);
  assert.equal((await ask({ timeZone: "America/Denver", shopId: "nope" })).status, 404);
  shared.clear();
  assert.equal((await ask({ timeZone: "America/Denver" })).status, 409);
  assert.equal((await (await world()).ask(ADMIN, "POST", "/api/control/time-zone", { shopId: ID, timeZone: "America/Denver", reason: "a good reason here" })).status, 501);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/time-zone", { shopId: ID, timeZone: "America/Denver", reason: "a good reason here" })).status, 403);
});

test("no reason is asked for: closing a shop and opening it again go through without one", async () => {
  const w = await world();
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/close", { shopId: ID })).status, 200);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/reopen", { shopId: ID })).status, 200);
});

test("the page: admins sign in with Google, every route is used, names are shown as text only", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  for (const path of [...Object.keys(controlRoutes({})), ...Object.keys(platformRoutes({}))]) assert.ok(app.includes(`"${path.split(" ")[1].replace("/api", "")}"`), path);
  for (const gone of ["new-shop-switches", "switch-all", "Old stockroom sign-in", "Find receipts in Gmail"]) assert.ok(!app.includes(gone), `${gone} is gone`);
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/);
});

test("the real support sign-in: a token for the support account with who, why and until, opened at the shop's admin", async () => {
  const w = await world();
  const made = [];
  const identity = { customToken: async (sa, uid, claims, list) => { made.push({ sa, uid, claims, list }); return "signed.jwt"; } };
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
  // On the shop's own sign-in list (the shared system); a shop without one uses the project's own.
  assert.deepEqual(made[0].list, { tenantId: profile.tenant ?? null });
  // Never longer than the sign-in token itself lasts.
  assert.equal((await access.supportSignIn(ID, { by: ADMIN.email, reason: "long one", minutes: 600 })).until, now().getTime() / 1000 + MAX_MINUTES * 60);
  await assert.rejects(supportAccess({ identity, registry: w.registry }).supportSignIn(ID, { by: ADMIN.email, reason: "r" }), /service account/);
});

test("two-step off for someone who lost their phone and codes: admins only, a reason and an address, logged first", async () => {
  const w = await world();
  w.shopAccess.twoStep.set(`${ID} staff@example.com`, 1);
  const reason = "owner replied from the address on file";
  assert.equal((await w.ask(PRESS, "POST", "/api/control/two-step-reset", { shopId: ID, email: "staff@example.com", reason })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/two-step-reset", { shopId: ID, email: "not an address", reason })).status, 400);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/two-step-reset", { shopId: "press-two", email: "two@example.com", reason })).status, 409);
  assert.equal(w.events().length, 0);

  const done = await w.ask(ADMIN, "POST", "/api/control/two-step-reset", { shopId: ID, email: " Staff@Example.com ", reason });
  assert.equal(done.status, 200);
  assert.deepEqual(done.body, { ok: true, shopId: ID, email: "staff@example.com", removed: 1 });
  assert.equal(w.shopAccess.twoStep.get(`${ID} staff@example.com`), 0);
  const [entry] = w.events();
  assert.deepEqual([entry.what, entry.by, entry.reason, entry.email], ["two-step-reset", ADMIN.email, reason, "staff@example.com"]);
  assert.ok(w.auditLog.entries.get(ID).has(entry.id), "in the shop's own audit log too");

  // Someone who doesn't sign in to the shop: logged (the attempt is on record), and nothing changes.
  const nobody = await w.ask(ADMIN, "POST", "/api/control/two-step-reset", { shopId: ID, email: "nobody@example.com", reason });
  assert.equal(nobody.status, 404);
  assert.match(nobody.body.message, /Nothing was changed/);
});

test("the real two-step reset reaches the shop's own sign-in project", async () => {
  const w = await world();
  const asked = [];
  const identity = { removeSecondSteps: async (projectId, email) => { asked.push([projectId, email]); return { found: true, removed: 1 }; } };
  const access = supportAccess({ identity, registry: w.registry, serviceAccount: "platform@example.com" });
  assert.deepEqual(await access.removeTwoStep(ID, "staff@example.com"), { found: true, removed: 1 });
  const profile = await w.registry.getProfile(ID);
  assert.deepEqual(asked, [[profile.firebase.projectId, "staff@example.com"]]);
  await assert.rejects(access.removeTwoStep("press-two", "two@example.com"), /no sign-in project/);
});

test("close a shop for abuse: admins only, logged first, checkout and pages closed; opening it again puts things back", async () => {
  const w = await world();
  const settingsKey = `${ID} settings/website`;
  w.services.world.docs.set(settingsKey, { shopName: "Test Press", maintenance: { enabled: false, message: "Back after the fair" } });
  assert.equal((await w.ask(PRESS, "POST", "/api/control/close", { shopId: ID, reason: "selling stolen card numbers" })).status, 403);
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

test("a press's switch from Stripe to Square: shown while it waits, then finished: server, pages and registry moved", async () => {
  const w = await world();
  const before = (await w.registry.getShop(ID)).payments;
  const next = { provider: "square", accountId: "MERCHANT1", mode: before.mode ?? "test", locationId: "LOC1" };
  await w.registry.updateShop(ID, { payments: { ...before, next, otherAccounts: ["square:MERCHANT1"], switching: { to: "square", accountId: "MERCHANT1", at: "2026-11-09T12:00:00.000Z" } } });
  const listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.deepEqual([listed.paymentsSwitch.from, listed.paymentsSwitch.to], [before.provider, "square"]);
  assert.ok(listed.health.reasons.some((r) => /switching card payments to Square/.test(r)));

  assert.equal((await w.ask(PRESS, "POST", "/api/control/payments/finish-switch", { shopId: ID })).status, 403);
  const deploysBefore = w.services.calls.length;
  const done = await w.ask(ADMIN, "POST", "/api/control/payments/finish-switch", { shopId: ID });
  assert.equal(done.status, 200);
  assert.deepEqual([done.body.finished, done.body.server], [true, true]);
  const config = readShopConfig({ ...envOf(await w.services.envFiles.read(ID)), GCLOUD_PROJECT: ID });
  assert.deepEqual([config.paymentProvider, config.earlierPaymentProvider], ["square", before.provider], "older orders keep their provider");
  assert.ok(w.services.calls.slice(deploysBefore).some(([name]) => name === "deploy.functions"));
  assert.deepEqual((await w.registry.getProfile(ID)).payments, { provider: "square", mode: "platform" });
  const after = (await w.registry.getShop(ID)).payments;
  assert.deepEqual([after.provider, after.accountId, after.next, after.switching], ["square", "MERCHANT1", undefined, undefined]);
  assert.deepEqual([after.earlier[0].provider, after.earlier[0].accountId], [before.provider, before.accountId]);
  assert.deepEqual(after.otherAccounts, [`${before.provider}:${before.accountId}`]);
  assert.equal(w.events().at(-1).what, "payments-switched");
  assert.equal((await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID).paymentsSwitch, null);

  // Again: nothing waits, nothing is deployed.
  const calls = w.services.calls.length;
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/payments/finish-switch", { shopId: ID })).body.skipped, "no switch is waiting");
  assert.equal(w.services.calls.length, calls);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/payments/finish-switches", {})).status, 403);
  assert.deepEqual((await w.ask(ADMIN, "POST", "/api/control/payments/finish-switches", {})).body.shops, [], "nothing waits");
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
  assert.deepEqual([list.body.breaches.length, list.body.privacyContact], [1, PRIVACY_CONTACT]);
  assert.ok(!Object.keys(controlRoutes(w.room)).some((route) => /delete|remove/.test(route)), "no route deletes an entry");
  assert.equal(keepUntil("2028-02-29"), "2030-03-01");
});

test("the control room's people: the terms' privacy contact, and nobody as admin address or backup person until set", () => {
  assert.deepEqual(controlRoomPeople({}), { privacyContact: PRIVACY_CONTACT, adminEmail: null, backupPerson: null });
  assert.deepEqual(controlRoomPeople({ PLATFORM_PRIVACY_CONTACT: "privacy@colophon.example", PLATFORM_ADMIN_EMAIL: " Owner@Example.com ", PLATFORM_BACKUP_PERSON: "backup@example.com" }), {
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
  assert.equal((await w.ask(ADMIN, "POST", path, { shopId: "no-such-shop", reason: "the press cleaned its list" })).status, 404);
  const answer = await w.ask(ADMIN, "POST", path, { shopId: ID, reason: "the press cleaned its list" });
  assert.equal(answer.status, 200);
  assert.deepEqual(calls, [{ shopId: ID, by: "admin@example.com", reason: "the press cleaned its list" }]);
  assert.ok(w.events().some((e) => e.what === "newsletter-resumed" && e.by === "admin@example.com"));
  assert.equal((await w.ask(ADMIN, "POST", path, { shopId: ID, reason: "the press cleaned its list" })).status, 409);
});

test("every logged control-room action also lands in the activity log, once (plan 9.9)", async () => {
  const w = await world();
  await w.room.actAs(ADMIN, { shopId: ID, reason: "help with their tax settings" });
  await w.ask(ADMIN, "POST", "/api/control/close", { shopId: ID });
  const entries = await w.activity.list();
  assert.equal(entries.filter((e) => e.what === "act-as").length, 1);
  assert.equal(new Set(entries.map((e) => e.what)).size, entries.length, "each action once");
  assert.ok(entries.every((e) => e.shopId === ID && e.by === "admin@example.com" && e.keepUntil > e.at));
  assert.ok(entries.every((e) => e.shopId === ID && e.by === "admin@example.com" && e.keepUntil > e.at));
});

test("only Julian's listed address, with two-step sign-in in the last 12 hours, opens the control room (plan 9.1)", async () => {
  const w = await world();
  const { firebase: _, ...oneStep } = ADMIN;
  const noStep = await w.ask(oneStep, "GET", "/api/control/shops");
  assert.equal(noStep.status, 403);
  assert.match(noStep.body.message, /two-step/);
  const old = await w.ask({ ...ADMIN, auth_time: Date.parse("2026-10-28T12:00:00Z") / 1000 - 13 * 3600 }, "GET", "/api/control/shops");
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

test("a line about one shop can be snoozed off Today for a while and put back, logged", async () => {
  const w = await world();
  const ID = "press-two";
  await w.registry.updateShop(ID, { billing: { plan: "both", status: "past_due", access: "open" } });
  const kinds = async () => {
    const { needs, snoozed } = (await w.ask(ADMIN, "GET", "/api/control/today")).body;
    return [needs.filter((n) => n.shopId === ID).map((n) => n.kind), snoozed.map((n) => n.kind)];
  };
  assert.deepEqual((await kinds())[0].includes("payment"), true);
  assert.equal((await w.ask(PRESS, "POST", "/api/control/today-snooze", { shopId: ID, kind: "payment" })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/today-snooze", { shopId: ID, kind: "repairs" })).status, 400, "only lines about one shop");
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/today-snooze", { shopId: ID, kind: "payment", days: 31 })).status, 400);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/today-snooze", { shopId: "nope", kind: "payment" })).status, 404);

  const snooze = await w.ask(ADMIN, "POST", "/api/control/today-snooze", { shopId: ID, kind: "payment" });
  assert.equal(snooze.status, 200);
  assert.equal(Date.parse(snooze.body.until) - Date.parse("2026-10-28T12:00:00Z") > 6.9 * 86_400_000, true, "a week by default");
  const [shown, snoozed] = await kinds();
  assert.ok(!shown.includes("payment") && snoozed.includes("payment"), "off the list, listed apart");

  assert.equal((await w.ask(ADMIN, "POST", "/api/control/today-snooze", { shopId: ID, kind: "payment", days: 0 })).status, 200);
  assert.ok((await kinds())[0].includes("payment"), "back on Today");
  assert.deepEqual(w.events(ID).filter((e) => e.what.startsWith("today-")).map((e) => [e.what, e.kind, e.days]), [["today-snoozed", "payment", 7], ["today-woken", "payment", 0]]);
});

test("a Stripe press's payouts in a few words for its record", () => {
  const stripe = (payoutsEnabled, payoutSchedule) => payoutWords({ provider: "stripe", payoutsEnabled, payoutSchedule });
  const base = { delayDays: null, weeklyAnchor: null, monthlyAnchor: null };
  assert.equal(stripe(true, { ...base, interval: "daily", delayDays: 2 }), "on · every day, 2 days after a sale");
  assert.equal(stripe(true, { ...base, interval: "daily", delayDays: 1 }), "on · every day, 1 day after a sale");
  assert.equal(stripe(true, { ...base, interval: "monthly", monthlyAnchor: 15 }), "on · monthly, on day 15");
  assert.equal(stripe(true, { ...base, interval: "manual" }), "on · started by hand");
  assert.equal(stripe(true, undefined), "on");
  assert.equal(stripe(false, { ...base, interval: "daily" }), "paused");
  assert.equal(stripe(undefined, undefined), null, "Stripe hasn't said yet");
  assert.equal(payoutWords({ provider: "square", payoutsEnabled: true }), null);
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
  assert.equal(record.emailLanguage, "en", "no choice and no Quebec address: English");
  assert.equal(record.emailSample.language, "en");
  assert.match(record.emailSample.text, /^Hello,/);
  await w.registry.updateShop(ID, { billing: { plan: "both", status: "trialing", province: "QC", language: null, hasCard: true } });
  const quebec = (await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body;
  assert.equal(quebec.emailLanguage, "fr+en", "the same rule the emails use");
  assert.match(quebec.emailSample.text, /^Bonjour,.*----- English -----.*Hello,/s, "French first, then the English");
  assert.match(quebec.emailSample.text, /5,00\u00a0\$/, "the price the French way");
  assert.match(quebec.emailSample.text, /Boutique et réserve/, "the plan's French name");
  assert.match(quebec.emailSample.subject, /^Votre essai .* \/ Your .* trial/);
  await w.registry.updateShop(ID, { billing: { plan: "both", status: "trialing", province: "QC", language: null, hasCard: false } });
  assert.match((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body.emailSample.subject, /^Ajoutez une carte .* \/ Add a card/, "no card yet: the add-a-card version, as the press gets it");
  // French picked at sign-up, then automatic on the Plan page outside Quebec: billing's choice wins, so English.
  await w.registry.updateShop(ID, { language: "fr", billing: { plan: "both", status: "trialing", province: "ON", language: null } });
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body.emailLanguage, "en", "the Plan page's later choice wins");
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: "nope" })).status, 404);
  // When Stripe pays the press (kept from account.updated), so "where's my money?" is answered from the record.
  await w.registry.updateShop(ID, { payments: { provider: "stripe", accountId: "acct_x", payoutsEnabled: true, payoutSchedule: { interval: "weekly", delayDays: 7, weeklyAnchor: "friday", monthlyAnchor: null } } });
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body.connections.payments.payouts, "on · every Friday");
  // Receipts by email (services/receipts): on or off and since when, never the shop's private address.
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body.connections.receipts, null);
  await w.registry.updateShop(ID, { receiptMail: { code: "abcdefgh", on: true, startedAt: "2026-11-12T16:00:00.000Z" } });
  assert.deepEqual((await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body.connections.receipts, { on: true, since: "2026-11-12T16:00:00.000Z", today: 0 });
  const listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.deepEqual([listed.ownerEmail, listed.billingStatus], ["owner@example.com", "trialing"]);
  assert.equal(listed.emailLanguage, "en", "the list carries each press's email language too");
  assert.equal(listed.payoutsPaused, false);
  await w.registry.updateShop(ID, { status: "live", payments: { provider: "stripe", accountId: "acct_x", detailsSubmitted: true, payoutsEnabled: false } });
  assert.equal((await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID).payoutsPaused, true, "the Cards filter's Payouts paused, the same rule as Today");
});

test("what a shop sells, against the category its Stripe account was filed under (12.18)", async () => {
  const w = await world();
  const row = await w.registry.getShop(ID);
  await w.registry.updateShop(ID, { publishes: "clothing", payments: { ...(row.payments ?? {}), provider: "stripe", accountId: "acct_moth", mcc: "5651" } });
  let listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.deepEqual([listed.sells.words, listed.sells.mismatch], ["Clothing", false]);
  assert.equal(listed.cards, "stripe", "the list says who takes the shop's card payments");
  let record = (await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body;
  assert.equal(record.sells.line, "Clothing · Stripe files it as Clothing");
  // Filed as a book shop but sells shoes: flagged on the list and in the record.
  await w.registry.updateShop(ID, { publishes: "shoes", payments: { ...(row.payments ?? {}), provider: "stripe", accountId: "acct_moth", mcc: "5942" } });
  listed = (await w.ask(ADMIN, "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === ID);
  assert.equal(listed.sells.mismatch, true);
  record = (await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body;
  assert.match(record.sells.line, /^Shoes · Stripe files it as Book stores, but this answer fits Shoes/);
  // The owner changed the answer later in Settings: the record goes by the shop's own answer.
  await w.registry.updateShop(ID, { status: "live" });
  await w.services.shopData.set(ID, "firstWeek/start", { sells: "books" });
  record = (await w.ask(ADMIN, "POST", "/api/control/shop", { shopId: ID })).body;
  assert.deepEqual([record.sells.words, record.sells.mismatch], ["Books", false]);
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

test("your test shop: the card finds it, and Reset the sample books is admin only, logged and only for the test shop (plan 9.10)", async () => {
  const w = await world();
  await w.registry.recordReleaseCheck(ID, { ok: true, finishedAt: "2026-10-28T11:00:00Z", version: "0.0.0-test" });
  const card = await w.ask(ADMIN, "GET", "/api/control/test-shop");
  assert.equal(card.status, 200);
  const shop = card.body.testShop;
  const profile = await w.registry.getProfile(ID);
  assert.deepEqual([shop.shopId, shop.storefrontUrl, shop.adminUrl], [ID, profile.siteUrl, `${profile.siteUrl}/admin/`]);
  assert.deepEqual([shop.lastCheck.ok, shop.lastCheck.at], [true, "2026-10-28T11:00:00Z"]);
  // Which update it runs and when it got it (each merge's update writes the row's release, docs/updating.md).
  await w.registry.updateShop(ID, { release: { version: "1.2.9-g9644c9fe047e", at: "2026-11-10T23:52:00Z", runId: "r" } });
  const updated = (await w.ask(ADMIN, "GET", "/api/control/test-shop")).body.testShop;
  assert.deepEqual([updated.version, updated.updatedAt], ["1.2.9-g9644c9fe047e", "2026-11-10T23:52:00Z"]);
  assert.equal(updated.lastUpdate, null, "no update run yet");
  // The newest update run that didn't go through, for the red note on Today.
  await w.registry.recordRelease({ kind: "shared-release", version: "1.2.8-gaaaaaaaaaaaa", runId: "u1", startedAt: "2026-11-10T23:40:00Z", finishedAt: "2026-11-10T23:45:00Z", ok: true, projects: [] });
  await w.registry.recordRelease({ kind: "shared-release", version: "1.2.9-g9644c9fe047e", runId: "u2", startedAt: "2026-11-10T23:46:00Z", finishedAt: "2026-11-10T23:55:00Z", ok: false, error: "lmb-test-shop: the release check failed", projects: [] });
  const red = (await w.ask(ADMIN, "GET", "/api/control/test-shop")).body.testShop.lastUpdate;
  assert.deepEqual(red, { ok: false, version: "1.2.9-g9644c9fe047e", at: "2026-11-10T23:55:00Z", error: "lmb-test-shop: the release check failed" });
  assert.equal((await w.ask(PRESS, "GET", "/api/control/test-shop")).status, 403);

  // A sample book sold out in a test, then reset to 5 copies.
  await w.services.shopData.set(ID, "books/test-book-one", { title: "Test Book One", stockLevel: 0 });
  assert.equal((await w.ask(PRESS, "POST", "/api/control/test-shop/reset", { shopId: ID })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/test-shop/reset", { shopId: "press-two" })).status, 409);
  const reset = await w.ask(ADMIN, "POST", "/api/control/test-shop/reset", { shopId: ID });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.reset, 7, "six sample products and the shipping zone");
  assert.equal((await w.services.shopData.get(ID, "books/test-book-one")).stockLevel, 5);
  assert.ok(w.events().some((e) => e.what === "test-shop-reset" && e.by === "admin@example.com"));
  assert.ok((await w.activity.list()).some((e) => e.what === "test-shop-reset"));
});

test("Open admin on a test shop signs the platform's admin in as its owner: admin only, logged first, test shops only", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "POST", "/api/control/test-shop/open", { shopId: ID })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/test-shop/open", { shopId: "press-two" })).status, 409, "a press's shop never opens this way");
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/test-shop/open", { shopId: "nobody" })).status, 404);
  assert.equal(w.shopAccess.calls.length, 0);

  const opened = await w.ask(ADMIN, "POST", "/api/control/test-shop/open", { shopId: ID });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.url, `https://${ID}.example/admin/#support=owner-1`);
  assert.deepEqual(w.shopAccess.calls, [{ shopId: ID, testOwner: true }]);
  assert.ok(w.events().some((e) => e.what === "test-shop-open" && e.by === "admin@example.com"));
  assert.ok((await w.activity.list()).some((e) => e.what === "test-shop-open"));

  // Google refuses (the server's access to the test project isn't given yet): plain words and what to run.
  w.shopAccess.fail = true;
  const refused = await w.ask(ADMIN, "POST", "/api/control/test-shop/open", { shopId: ID });
  assert.equal(refused.status, 502);
  assert.match(refused.body.error ?? refused.body.message ?? JSON.stringify(refused.body), /Make the test shop/);
  w.shopAccess.fail = false;

  await w.registry.updateShop(ID, { status: "making" });
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/test-shop/open", { shopId: ID })).status, 409);
});

test("no test shop yet: the card says so instead of failing (plan 9.10)", async () => {
  const w = await world();
  await w.registry.updateShop(ID, { testShop: false });
  const body = (await w.ask(ADMIN, "GET", "/api/control/test-shop")).body;
  assert.equal(body.testShop, null);
  assert.deepEqual(body.testShops, []);
});

test("two test shops: the book shop first, then the general one, each with its kind; reset puts back each one's own products", async () => {
  const w = await world();
  await w.registry.createShop("test-goods", { shopId: "test-goods", pressName: "Test Goods", plan: "both", status: "live", testShop: true, testMode: true, publishes: "other", ownerEmail: "owner@example.com" });
  await w.registry.saveProfile("test-goods", { siteUrl: "https://lmb-test-goods.web.app" });
  await w.registry.recordReleaseCheck("test-goods", { ok: false, failedCheck: 2, finishedAt: "2026-11-12T01:00:00Z", version: "1.2.9-g9644c9fe047e" });
  const body = (await w.ask(ADMIN, "GET", "/api/control/test-shop")).body;
  assert.deepEqual(body.testShops.map((s) => [s.shopId, s.kind, s.kindWords]), [[ID, "books", "Book test shop"], ["test-goods", "general", "General test shop"]]);
  assert.equal(body.testShop.shopId, ID, "the one card that names a single test shop shows the book shop");
  const goods = body.testShops[1];
  assert.deepEqual([goods.storefrontUrl, goods.adminUrl, goods.lastCheck.ok, goods.lastCheck.failedCheck], ["https://lmb-test-goods.web.app", "https://lmb-test-goods.web.app/admin/", false, 2]);

  // The general shop's reset puts back its own goods, never the book shop's books.
  await w.services.shopData.set("test-goods", "books/test-tote-bag", { title: "Test Tote Bag", stockLevel: 0 });
  const reset = await w.ask(ADMIN, "POST", "/api/control/test-shop/reset", { shopId: "test-goods" });
  assert.equal(reset.status, 200);
  assert.equal((await w.services.shopData.get("test-goods", "books/test-tote-bag")).stockLevel, 5);
  assert.equal(await w.services.shopData.get("test-goods", "books/test-book-one"), null);
  // Its sample records come with it: past orders and the code, in the general shop's own products.
  const order = await w.services.shopData.get("test-goods", "orders/PAST-test-01");
  assert.deepEqual([order.source, order.items[0].id], ["import", "test-tote-bag"]);
  assert.equal((await w.services.shopData.get("test-goods", "discounts/TESTSHOP10")).code, "TESTSHOP10");
});

test("reset sample data writes the sample records again, the stockroom's too, and never touches the item the release check buys", async () => {
  const w = await world({ withStockroom: true });
  // Setup step 12 made them once.
  assert.ok(await w.services.shopData.get(ID, "orders/PAST-test-08"));
  const hist = async (id) => JSON.parse((await w.services.stockroom.get(ID, `books/${id}/data/hist`))?.data ?? "null");
  assert.equal((await hist("test-book-two")).length, 2);
  // Tried out: an order deleted and a sale voided. Reset puts both back.
  await w.services.shopData.set(ID, "orders/PAST-test-01", { gone: true });
  await w.services.stockroom.set(ID, "books/test-book-two/data/hist", { data: "[]", ts: 1 });
  const reset = await w.ask(ADMIN, "POST", "/api/control/test-shop/reset", { shopId: ID });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.stockroom, true);
  assert.equal((await w.services.shopData.get(ID, "orders/PAST-test-01")).source, "import");
  assert.equal((await hist("test-book-two")).length, 2);
  assert.equal(await hist("test-book-one"), null, "the release check's item keeps no sample history");
  const catalog = JSON.parse((await w.services.stockroom.get(ID, "settings/catalog")).data);
  assert.deepEqual(catalog["test-book-two"].profitTiers, [{ revenueUpTo: null, artistPct: 50 }]);
  assert.equal(catalog["test-book-one"].profitTiers, undefined);
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

test("the control room lists what is still to do before Connect Google can be switched on, admins only (15.4)", async () => {
  const googleReady = (now) => ({ ready: false, items: [{ id: "x", done: false, title: "Something to do", words: `Plain words at ${now}.` }] });
  const w = await world({ googleReady });
  assert.equal((await w.ask(PRESS, "GET", "/api/control/google-ready")).status, 403);
  const answer = await w.ask(ADMIN, "GET", "/api/control/google-ready");
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ready, false);
  assert.equal(answer.body.items[0].title, "Something to do");
  assert.equal((await (await world()).ask(ADMIN, "GET", "/api/control/google-ready")).status, 503);
});

test("the control room shows the tax lines, admins only, and says plainly when the sales can't be read (15.20)", async () => {
  const taxWatch = async () => ({ lines: [{ id: "bc", label: "British Columbia PST", state: "amber", words: "$7,000 of $10,000" }], attention: true });
  const w = await world({ taxWatch });
  assert.equal((await w.ask(PRESS, "GET", "/api/control/tax-watch")).status, 403);
  const answer = await w.ask(ADMIN, "GET", "/api/control/tax-watch");
  assert.equal(answer.status, 200);
  assert.equal(answer.body.lines[0].state, "amber");
  assert.equal((await (await world()).ask(ADMIN, "GET", "/api/control/tax-watch")).status, 503);
  const broken = await world({ taxWatch: async () => { throw new Error("Stripe didn't answer"); } });
  const failed = await broken.ask(ADMIN, "GET", "/api/control/tax-watch");
  assert.equal(failed.status, 502);
  assert.match(failed.body.error ?? failed.body.message ?? JSON.stringify(failed.body), /Stripe didn't answer/);
});

test("a shop's platform bills show in the control room, admins only, a page at a time, and say plainly when billing can't be read", async () => {
  const asked = [];
  const bills = async (shopId, page) => {
    asked.push([shopId, page.after]);
    return page.after ? { invoices: [{ id: "in_0", status: "paid" }], more: false, after: null } : { invoices: [{ id: "in_1", status: "paid", pdfUrl: "https://pay.stripe.example/in_1.pdf" }], more: true, after: "in_1" };
  };
  const w = await world({ bills });
  assert.equal((await w.ask(PRESS, "POST", "/api/control/shop-bills", { shopId: ID })).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop-bills", { shopId: "no-such-shop" })).status, 404);
  const first = await w.ask(ADMIN, "POST", "/api/control/shop-bills", { shopId: ID });
  assert.equal(first.status, 200);
  assert.equal(first.body.invoices[0].pdfUrl, "https://pay.stripe.example/in_1.pdf");
  const older = await w.ask(ADMIN, "POST", "/api/control/shop-bills", { shopId: ID, after: first.body.after });
  assert.equal(older.body.more, false);
  assert.deepEqual(asked, [[ID, null], [ID, "in_1"]]);
  assert.equal((await (await world()).ask(ADMIN, "POST", "/api/control/shop-bills", { shopId: ID })).status, 503);
  const broken = await world({ bills: async () => { throw new Error("Stripe didn't answer"); } });
  assert.equal((await broken.ask(ADMIN, "POST", "/api/control/shop-bills", { shopId: ID })).status, 502);
});

test("the shop list and Today read shops a few at a time, not one after another, and keep every shop", async () => {
  let running = 0, most = 0;
  const seen = [];
  await eachInTurn([...Array(30).keys()], SHOPS_AT_ONCE, async (n) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    seen.push(n);
    running -= 1;
  });
  assert.equal(most, SHOPS_AT_ONCE);
  assert.deepEqual(seen.sort((a, b) => a - b), [...Array(30).keys()]);
  await assert.rejects(eachInTurn([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("the registry didn't answer");
  }), /didn't answer/);
  await eachInTurn([], 8, async () => assert.fail("nothing to do"));
});

test("a support visit and the two-step tools use the shop's own sign-in list (the shared system)", async () => {
  const calls = [];
  const identity = {
    customToken: async (...args) => { calls.push(["token", args[3]]); return "signed.jwt"; },
    removeSecondSteps: async (...args) => { calls.push(["remove", args[2]]); return { found: true, removed: 1 }; },
    secondStepsOf: async (...args) => { calls.push(["steps", args[2]]); return []; },
  };
  const registry = { getProfile: async () => ({ siteUrl: "https://press.example", apps: { shop: true }, firebase: { projectId: "lmb-test-shop" }, tenant: "press-a1b2c3" }) };
  const access = supportAccess({ identity, registry, serviceAccount: "platform@example.com" });
  await access.supportSignIn("press", { by: "a@example.com", reason: "r" });
  await access.removeTwoStep("press", "owner@example.com");
  await access.signInSafety("press", ["owner@example.com"]);
  assert.deepEqual(calls, [["token", { tenantId: "press-a1b2c3" }], ["remove", { tenantId: "press-a1b2c3" }], ["steps", { tenantId: "press-a1b2c3" }]]);
});
