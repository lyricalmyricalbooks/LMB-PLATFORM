// Sign-in safety in a shop's record: admins only; the owner and every member, once each, owner first; two-step on or
// off and backup codes left per person, read from the shop's own sign-in and database (only the count of hashes); a
// shop not live yet has no one to show; a piece not connected keeps its own plain words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOW_CODES, createSignInSafety, safetyOf, signInSafetyRoutes } from "./signInSafety.js";
import { supportAccess } from "./supportAccess.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopAccess } from "./fakes.js";
import { fakeAccountStores, fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";
import { NOT_CONNECTED, notConnectedClient } from "../server/notConnected.js";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const SHOP = "moth-press";
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world({ shopAccess = fakeShopAccess() } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", ownerEmail: "Owner@example.com", status: "live" });
  await registry.createShop("new-press", { shopId: "new-press", pressName: "New Press", ownerEmail: "new@example.com", status: "making" });
  const { memberships } = fakeAccountStores();
  await memberships.set(SHOP, "owner@example.com", { shopId: SHOP, email: "owner@example.com", role: "owner" });
  await memberships.set(SHOP, "sam@example.com", { shopId: SHOP, email: "sam@example.com", role: "staff" });
  await memberships.set(SHOP, "ava@example.com", { shopId: SHOP, email: "ava@example.com", role: "bookkeeper" });
  await memberships.set(SHOP, "fay@example.com", { shopId: SHOP, email: "fay@example.com", role: "fairHelper" });
  await memberships.set(SHOP, "new@example.com", { shopId: SHOP, email: "new@example.com", role: "staff" });
  shopAccess.twoStep?.set(`${SHOP} owner@example.com`, 1);
  shopAccess.codes?.set(`${SHOP} owner@example.com`, 8);
  shopAccess.twoStep?.set(`${SHOP} ava@example.com`, 1);
  shopAccess.codes?.set(`${SHOP} ava@example.com`, LOW_CODES);
  shopAccess.codes?.set(`${SHOP} sam@example.com`, 0);
  const safety = createSignInSafety({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, memberships, shopAccess, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: signInSafetyRoutes(safety), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/sign-in-safety", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { registry, safety, ask };
}

test("only platform admins see a shop's sign-in safety", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(ADMIN, { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, { shopId: SHOP })).status, 200);
});

test("each person once, the owner first, with two-step and codes left", async () => {
  const { people, summary } = await (await world()).safety.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual(people.map((p) => [p.email, p.roleName, p.state, p.codesLeft]), [
    ["owner@example.com", "Owner", "safe", 8],
    ["new@example.com", "Staff", "never", null],
    ["sam@example.com", "Staff", "off", 0],
    ["ava@example.com", "Bookkeeper", "low", LOW_CODES],
    ["fay@example.com", "Fair helper", "never", null],
  ]);
  assert.deepEqual(summary, { withTwoStep: 2, signedIn: 3, ownerOff: false, lowOnCodes: 1,
    roles: [{ role: "owner", name: "Owner", count: 1 }, { role: "staff", name: "Staff", count: 2 }, { role: "bookkeeper", name: "Bookkeeper", count: 1 }, { role: "fairHelper", name: "Fair helper", count: 1 }] });
});

test("the states: never signed in, off, no codes, low, safe", () => {
  assert.equal(safetyOf({ found: false }), "never");
  assert.equal(safetyOf({ found: true, twoStep: false, codesLeft: 5 }), "off");
  assert.equal(safetyOf({ found: true, twoStep: true, codesLeft: 0 }), "no-codes");
  assert.equal(safetyOf({ found: true, twoStep: true, codesLeft: LOW_CODES + 1 }), "safe");
  assert.equal(safetyOf({ found: true, twoStep: true, codesLeft: null }), "safe", "codes unknown: two-step is what counts");
});

test("a shop not live has no one to show, and a piece not switched on says so plainly", async () => {
  const w = await world();
  const early = await w.safety.forShop(ADMIN, { shopId: "new-press" });
  assert.deepEqual(early.people, []);
  const off = await world({ shopAccess: notConnectedClient(NOT_CONNECTED.signInSafety, ["signInSafety"]) });
  await assert.rejects(off.safety.forShop(ADMIN, { shopId: SHOP }), { status: 503, message: NOT_CONNECTED.signInSafety.words });
});

test("the real reading: one lookup on the shop's sign-in project, then only the count of each person's code hashes", async () => {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, status: "live" });
  await registry.saveProfile(SHOP, { firebase: { projectId: "lmb-test-shop" } });
  const asked = [];
  const identity = { secondStepsOf: async (projectId, emails) => {
    asked.push([projectId, emails]);
    return [{ email: "owner@example.com", found: true, uid: "u1", steps: 1 }, { email: "sam@example.com", found: true, uid: "u2", steps: 0 }, { email: "x@example.com", found: false, uid: null, steps: 0 }];
  } };
  const shopData = fakeShopData();
  await shopData.set(SHOP, "twoStepBackup/u1", { hashes: ["a", "b", "c"], madeAt: "2026-11-01T00:00:00Z", email: "owner@example.com" });
  const access = supportAccess({ identity, registry, shopData });
  assert.deepEqual(await access.signInSafety(SHOP, ["owner@example.com", "sam@example.com", "x@example.com"]), [
    { email: "owner@example.com", found: true, twoStep: true, codesLeft: 3, codesMadeAt: "2026-11-01T00:00:00Z", lastSignInAt: null },
    { email: "sam@example.com", found: true, twoStep: false, codesLeft: 0, codesMadeAt: null, lastSignInAt: null },
    { email: "x@example.com", found: false, twoStep: false, codesLeft: null, codesMadeAt: null, lastSignInAt: null },
  ]);
  assert.deepEqual(asked, [["lmb-test-shop", ["owner@example.com", "sam@example.com", "x@example.com"]]]);
});

test("the shop drawer shows the section, and both web doors serve the route", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/sign-in-safety"/);
  assert.match(app, /"Sign-in safety"/);
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /signInSafetyRoutes\(signInSafety\)/, door);
});
