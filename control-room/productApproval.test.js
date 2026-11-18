// Product types that need a check: admins only; a no needs a reason; a yes writes the shop's answers doc and logs once
// (a repeat writes nothing); asking again after a no puts it back on Today; Today finds a live shop's new ask by itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProductApproval, productApprovalRoutes, APPROVALS_DOC } from "./productApproval.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const SHOP = "vine-shop";

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, status: "live", pressName: "Vine Shop" });
  await registry.createShop("quiet", { shopId: "quiet", status: "live", pressName: "Quiet" });
  const shopData = fakeShopData();
  await shopData.set(SHOP, "approvalRequests/alcohol", { typeId: "alcohol", typeName: "Wine", note: "Licence 12345", askedAt: "2026-11-17T09:00:00.000Z", state: "waiting" });
  const auditLog = fakeAuditLog();
  const activity = { rows: [], record: async (entry) => void activity.rows.push(entry) };
  let clock = NOW;
  const desk = createProductApproval({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, auditLog, shopData, activity, now: () => new Date(clock) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: productApprovalRoutes(desk), log: () => {} });
  const auth = (claims) => ({ Authorization: `Bearer ${JSON.stringify(claims)}` });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: auth(claims) });
  const get = (claims, path) => api({ method: "GET", path, headers: auth(claims) });
  return { desk, ask, get, registry, shopData, auditLog, activity, tick: (ms) => (clock += ms) };
}

test("only platform admins see or answer", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "/api/control/approvals", { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(PRESS, "/api/control/approvals/decide", { shopId: SHOP, typeId: "alcohol", approve: true })).status, 403);
  assert.equal((await w.get(PRESS, "/api/control/approvals/waiting")).status, 403);
  assert.equal((await w.ask(ADMIN, "/api/control/approvals", { shopId: "nope" })).status, 404);
  assert.equal(await w.shopData.get(SHOP, APPROVALS_DOC), null);
});

test("each type is listed with the owner's note; a no needs a reason; a type that needs no check is refused", async () => {
  const w = await world();
  const { types } = await w.desk.forShop(ADMIN, { shopId: SHOP });
  const byId = Object.fromEntries(types.map((t) => [t.typeId, t]));
  assert.deepEqual(Object.keys(byId).sort(), ["alcohol", "cbd", "supplements"]);
  assert.deepEqual([byId.alcohol.state, byId.cbd.state, byId.supplements.state], ["waiting", "not-asked", "not-asked"]);
  assert.equal(byId.alcohol.note, "Licence 12345");
  assert.equal((await w.ask(ADMIN, "/api/control/approvals/decide", { shopId: SHOP, typeId: "alcohol", approve: false })).status, 400);
  assert.equal((await w.ask(ADMIN, "/api/control/approvals/decide", { shopId: SHOP, typeId: "tops", approve: true })).status, 400);
  assert.equal((await w.ask(ADMIN, "/api/control/approvals/decide", { shopId: SHOP, typeId: "alcohol" })).status, 400);
});

test("a yes writes the shop's answers, logs once and clears Today; a repeat writes nothing", async () => {
  const w = await world();
  await w.shopData.set(SHOP, APPROVALS_DOC, { kept: true });
  const first = await w.desk.decide(ADMIN, { shopId: SHOP, typeId: "alcohol", approve: true });
  assert.deepEqual([first.state, first.changed, first.waiting], ["approved", true, 0]);
  const saved = await w.shopData.get(SHOP, APPROVALS_DOC);
  assert.equal(saved.kept, true);
  assert.deepEqual(saved.types.alcohol, { state: "approved", reason: "", at: new Date(NOW).toISOString(), by: "admin@example.com" });
  assert.equal((await w.registry.getShop(SHOP)).approvalsWaiting, 0);
  assert.equal((await w.desk.decide(ADMIN, { shopId: SHOP, typeId: "alcohol", approve: true })).changed, false);
  assert.equal(w.activity.rows.length, 1);
  assert.equal(w.auditLog.entries.get(SHOP).size, 1);
  assert.deepEqual((await w.desk.waiting(ADMIN)).asks, []);
});

test("a no keeps the reason; asking again afterwards waits once more and can then be approved", async () => {
  const w = await world();
  await w.desk.decide(ADMIN, { shopId: SHOP, typeId: "alcohol", approve: false, reason: "Please send your liquor licence." });
  let alcohol = (await w.desk.forShop(ADMIN, { shopId: SHOP })).types.find((t) => t.typeId === "alcohol");
  assert.deepEqual([alcohol.state, alcohol.reason], ["declined", "Please send your liquor licence."]);
  w.tick(60_000);
  await w.shopData.set(SHOP, "approvalRequests/alcohol", { typeId: "alcohol", typeName: "Wine", note: "Licence attached", askedAt: new Date(NOW + 60_000).toISOString(), state: "waiting" });
  alcohol = (await w.desk.forShop(ADMIN, { shopId: SHOP })).types.find((t) => t.typeId === "alcohol");
  assert.equal(alcohol.state, "waiting");
  w.tick(60_000);
  assert.equal((await w.desk.decide(ADMIN, { shopId: SHOP, typeId: "alcohol", approve: true })).changed, true);
});

test("Today finds a live shop's new ask by itself and keeps the registry count in step", async () => {
  const w = await world();
  const res = await w.get(ADMIN, "/api/control/approvals/waiting");
  assert.equal(res.status, 200);
  const { asks } = await w.desk.waiting(ADMIN);
  assert.deepEqual(asks.map((a) => [a.shopId, a.typeId, a.pressName, a.note]), [[SHOP, "alcohol", "Vine Shop", "Licence 12345"]]);
  assert.equal((await w.registry.getShop(SHOP)).approvalsWaiting, 1);
  assert.equal((await w.registry.getShop("quiet")).approvalsWaiting, undefined);
  assert.deepEqual(await w.desk.recount(ADMIN, { shopId: SHOP }), { shopId: SHOP, waiting: 1 });
});

test("the control room's list of types is the shop's own", async () => {
  const { createRequire } = await import("node:module");
  const shop = createRequire(import.meta.url)("../apps/shop/functions/shared/typeApproval.js");
  const types = createRequire(import.meta.url)("../apps/shop/functions/shared/productTypes.js");
  const { APPROVAL_TYPES } = await import("./productApproval.js");
  assert.deepEqual(APPROVAL_TYPES.map((t) => t.typeId), [...shop.APPROVAL_TYPE_IDS]);
  for (const t of APPROVAL_TYPES) {
    assert.equal(t.name, types.typeById(t.typeId).name, t.typeId);
    assert.equal(t.why, shop.approvalWhy(t.typeId), t.typeId);
  }
});
