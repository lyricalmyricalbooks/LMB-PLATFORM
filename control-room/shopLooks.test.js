// The look a live website wears: admins only; the published look, a different one waiting in Studio's draft, the welcome's
// pick and whether it was never published; across presses, live websites only (no test shop, no stockroom-only plan),
// counted per look; a shop that can't be read is named, not fatal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMPLATES, createShopLooks, lookOf, lookTally, shopLooksRoutes } from "./shopLooks.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const marquee = { themeStyle: "marquee", themeBase: { id: "marquee", name: "Marquee", look: {}, sig: "x" } };

async function world() {
  const registry = fakeRegistry();
  await registry.createShop("moth", { shopId: "moth", status: "live", plan: "both" });
  await registry.createShop("wasp", { shopId: "wasp", status: "live", plan: "shop" });
  await registry.createShop("newt", { shopId: "newt", status: "live", plan: "shop" });
  await registry.createShop("stock", { shopId: "stock", status: "live", plan: "stockroom" });
  await registry.createShop("lmb-test-shop", { shopId: "lmb-test-shop", status: "live", plan: "both", testShop: true });
  await registry.createShop("new-press", { shopId: "new-press", status: "making", plan: "both" });
  const shopData = fakeShopData();
  await shopData.set("moth", "settings/website", { design: marquee, designPublishedAt: "2026-11-01T10:00:00Z" });
  await shopData.set("moth", "themes/workspace", { draft: { themeBase: { id: "atlas", name: "Atlas" } }, rev: 3 });
  await shopData.set("moth", "firstWeek/start", { welcome: { theme: "marquee", at: "2026-10-30T09:00:00Z", adminLook: "paper" } });
  await shopData.set("wasp", "settings/website", { design: marquee, designPublishedAt: "2026-11-02T10:00:00Z" });
  await shopData.set("newt", "settings/website", { design: {} });
  await shopData.set("newt", "themes/workspace", { draft: { themeBase: { id: "index", name: "Index" } } });
  await shopData.set("newt", "firstWeek/start", { welcome: { theme: "index", at: "2026-11-03T09:00:00Z", skipped: true } });
  const desk = createShopLooks({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: shopLooksRoutes(desk), log: () => {} });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, shopData };
}

test("only platform admins see a shop's look, or the looks across presses", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "POST", "/api/control/shop-look", { shopId: "moth" })).status, 403);
  assert.equal((await w.ask(PRESS, "GET", "/api/control/live-looks")).status, 403);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop-look", { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/shop-look", { shopId: "moth" })).status, 200);
});

test("a shop's look: what shoppers see, a different look in the draft, and the welcome's pick", async () => {
  const w = await world();
  assert.deepEqual((await w.desk.forShop(ADMIN, { shopId: "moth" })).look, {
    live: { id: "marquee", name: "Marquee" }, template: "marquee", publishedAt: "2026-11-01T10:00:00Z", draft: { id: "atlas", name: "Atlas" },
    welcome: { theme: "marquee", at: "2026-10-30T09:00:00Z", skipped: false, adminLook: "paper" }, waiting: false,
  });
  const newt = (await w.desk.forShop(ADMIN, { shopId: "newt" })).look;
  assert.equal(newt.waiting, true, "picked in the welcome, never published");
  assert.equal(newt.welcome.skipped, true);
  assert.match((await w.desk.forShop(ADMIN, { shopId: "stock" })).words, /no website/);
  assert.equal((await w.desk.forShop(ADMIN, { shopId: "new-press" })).look, null);
  assert.deepEqual(lookOf(null, null, null), { live: null, template: null, publishedAt: null, draft: null, welcome: null, waiting: false });
  assert.equal(lookOf({ design: marquee }, { draft: marquee }, null).draft, null, "the same look in the draft isn't news");
});

test("across presses: live websites only, counted per look, their own designs last", async () => {
  const { looks, templates, shops, waiting, welcome, unread } = await (await world()).desk.acrossPresses(ADMIN);
  assert.deepEqual(welcome, { picked: 1, skipped: 1 });
  assert.deepEqual(templates, [{ id: "marquee", count: 2 }, { id: "", count: 1 }]);
  assert.equal(shops, 3, "no test shop, no stockroom-only plan, nothing not live");
  assert.equal(waiting, 1);
  assert.deepEqual(unread, []);
  assert.deepEqual(looks, [{ id: "marquee", name: "Marquee", count: 2 }, { id: "", name: "", count: 1 }]);
  assert.deepEqual(lookTally([]), []);
});

test("a shop that can't be read is named, not fatal", async () => {
  const w = await world();
  const get = w.shopData.get;
  w.shopData.get = async (shopId, path) => { if (shopId === "wasp") throw new Error("permission denied"); return get(shopId, path); };
  const { shops, unread } = await w.desk.acrossPresses(ADMIN);
  assert.equal(shops, 2);
  assert.deepEqual(unread.map((u) => u.shopId), ["wasp"]);
});

test("the shop drawer and the Setting up page show the looks, and both web doors serve the routes", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/shop-look"/);
  assert.match(app, /"\/control\/live-looks"/);
  assert.match(app, /"Website look"/);
  assert.match(app, /"Looks live shops wear"/);
  assert.match(app, /"Templates live shops show"/);
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /shopLooksRoutes\(shopLooks\)/, door);
});

test("the template list matches the shop's own", () => {
  const ts = readFileSync(new URL("../apps/shop/src/app/features/site/templateStyles.ts", import.meta.url), "utf8");
  // The ids of the TEMPLATE_STYLES list, in order (the shop builds TEMPLATE_STYLE_IDS from it).
  const list = /TEMPLATE_STYLES[^=]*=\s*\[([\s\S]*?)\n\]/.exec(ts)[1];
  const ids = [...list.matchAll(/\{\s*id:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...TEMPLATES], ids);
  assert.equal(lookOf({ design: { themeStyle: "default" } }, null, null).template, null, "the plain look is no template");
});
