// Shop types in the control room: admins only; counts live shops with a website by type (a shop's own answer first, its
// sign-up answer when it hasn't answered or can't be read), book sellers among product shops, and every change of type,
// newest first, with Switch back marked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createShopTypes, shopTypesRoutes, shopTypeOf, typeChangeOf, changeLine, START_DOC } from "./shopTypes.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world() {
  const registry = fakeRegistry();
  const shop = (id, fields) => registry.createShop(id, { shopId: id, status: "live", plan: "both", pressName: id, ...fields });
  await shop("moth-press", { publishes: "books" });
  await shop("goods", { publishes: "clothing" });
  await shop("salon", { publishes: "hair" });
  await shop("studio", { publishes: "lessons", testShop: true });
  await shop("stock-only", { plan: "stockroom", publishes: "books" });
  await shop("new", { status: "making", publishes: "hair" });
  const shopData = fakeShopData();
  await shopData.set("goods", START_DOC, { sells: "hair", sellsProducts: true, typeChange: { at: "2026-11-20T10:00:00Z", from: "products", to: "both", website: "follow", before: {} } });
  await shopData.set("studio", START_DOC, { sells: "lessons", typeChange: { at: "2026-11-24T10:00:00Z", from: "services", to: "products", website: "later", before: {}, undoneAt: "2026-11-25T10:00:00Z" } });
  const desk = createShopTypes({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: shopTypesRoutes(desk), log: () => {} });
  const ask = (claims) => api({ method: "GET", path: "/api/control/shop-types", headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask };
}

test("only platform admins see shop types", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS)).status, 403);
  assert.equal((await w.ask(ADMIN)).status, 200);
});

test("counts live shops with a website by type and lists changes newest first", async () => {
  const w = await world();
  const view = await w.desk.overview(ADMIN);
  assert.deepEqual(view.totals, { shops: 4, products: 1, services: 2, both: 1, books: 1, changed: 2, switchedBack: 1, unread: 0 });
  assert.deepEqual(view.changes.map((c) => c.shopId), ["studio", "goods"]);
  assert.equal(view.changes[1].line, "Product shop → Products and services · website followed");
  assert.match(view.changes[0].line, /^Services → Product shop · website left for later · switched back 25 Nov$/);
  assert.deepEqual(view.shops.map((s) => [s.shopId, s.type]), [["moth-press", "products"], ["salon", "services"], ["studio", "services"], ["goods", "both"]]);
});

test("a shop's own answer wins; a record that can't be read falls back to the sign-up answer", async () => {
  assert.equal(shopTypeOf({ sells: "hair", sellsProducts: true }, { publishes: "books" }), "both");
  assert.equal(shopTypeOf(null, { publishes: "hair" }), "services");
  assert.equal(shopTypeOf({ sells: "clothing", sellsProducts: true }, {}), "products");
  assert.equal(typeChangeOf({ typeChange: { at: "x", from: "nope", to: "both" } }), null);
  assert.equal(changeLine(null), "");
});
