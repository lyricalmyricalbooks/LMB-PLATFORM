// Starter websites in the control room: admins only; with nothing saved every starter shows in the shop's order;
// saving writes the record once and platform/starters into every live shop with a website (never a stockroom-only,
// closed or unfinished one, and no shop sees another's folder); one shop's trouble never stops the rest; a starter added
// to the shop after the last save waits hidden; the list mirrors the shop's own starters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AWAITING_YES, STARTERS, STARTERS_DOC, STARTERS_RECORD, cleanRecord, createStarterSites, recordFrom, shopDocOf, starterRows, starterSitesPublicRoutes, starterSitesRoutes } from "./starterSites.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const ALL = STARTERS.map((s) => s.id);

async function world({ broken = [] } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", status: "live", plan: "both", pressName: "Moth Press" });
  await registry.createShop("fern-goods", { shopId: "fern-goods", status: "live", plan: "shop", pressName: "Fern Goods" });
  await registry.createShop("stock-only", { shopId: "stock-only", status: "live", plan: "stockroom" });
  await registry.createShop("new-press", { shopId: "new-press", status: "making", plan: "both" });
  await registry.createShop("gone-press", { shopId: "gone-press", status: "live", plan: "both", closure: { at: "2026-11-01" } });
  const real = fakeShopData();
  const shopData = { ...real, set: async (shopId, path, data) => { if (broken.includes(shopId)) throw new Error("no answer"); return real.set(shopId, path, data); } };
  const records = new Map();
  const settingsStore = { get: async (name) => records.get(name) ?? null, set: async (name, value) => void records.set(name, value) };
  const activity = { rows: [], record: async (entry) => void activity.rows.push(entry) };
  const desk = createStarterSites({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), settingsStore, registry, auditLog: fakeAuditLog(), shopData, activity, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: starterSitesRoutes(desk), log: () => {} });
  const auth = (claims) => ({ Authorization: `Bearer ${JSON.stringify(claims)}` });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: auth(claims) });
  const get = (claims, path) => api({ method: "GET", path, headers: auth(claims) });
  return { desk, ask, get, shopData: real, records, activity, registry };
}

const choice = (overrides = {}) => ALL.map((id) => ({ id, shown: true, fresh: false, ...(overrides[id] ?? {}) }));

test("new starters wait for the owner's yes in the shop and here alike", () => {
  const gallery = readFileSync(new URL("../apps/shop/src/app/admin/lookGallery.ts", import.meta.url), "utf8");
  assert.deepEqual([...AWAITING_YES], JSON.parse(gallery.match(/export const AWAITING_YES = (\[[^\]]*\])/)[1]));
  assert.deepEqual(starterRows(null).filter((s) => s.state === "waiting").map((s) => s.id), [...AWAITING_YES]);
});

test("the control room's list is the shop's own starters, in the shop's order, with the names the shop shows", () => {
  const gallery = readFileSync(new URL("../apps/shop/src/app/admin/lookGallery.ts", import.meta.url), "utf8");
  const ids = JSON.parse(gallery.match(/export const STARTER_SITES = (\[[^\]]*\])/)[1]);
  assert.deepEqual(ALL, ids);
  const library = readFileSync(new URL("../apps/shop/src/app/admin/studio/themeLibrary.ts", import.meta.url), "utf8");
  for (const { id, name } of STARTERS) assert.match(library, new RegExp(`id: "${id}", name: "${name}"`), id);
});

test("only platform admins see or change the starters", async () => {
  const w = await world();
  assert.equal((await w.get(PRESS, "/api/control/starters")).status, 403);
  assert.equal((await w.ask(PRESS, "/api/control/starters/save", { starters: choice() })).status, 403);
  assert.equal(w.records.size, 0);
  const answer = await w.get(ADMIN, "/api/control/starters");
  assert.equal(answer.status, 200);
  assert.equal(answer.body.saved, false);
  assert.deepEqual(answer.body.starters.map((s) => [s.id, s.state]), ALL.map((id) => [id, AWAITING_YES.includes(id) ? "waiting" : "shown"]));
});

test("saving writes the record once and every live shop with a website gets it; a repeat writes nothing new", async () => {
  const w = await world();
  const starters = [...choice({ "aurel-editorial": { fresh: true }, "juniper-catalogue": { shown: false } })].reverse();
  const first = await w.ask(ADMIN, "/api/control/starters/save", { starters });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.changed, true);
  assert.equal(first.body.shops, 2);
  const reversed = [...ALL].reverse();
  assert.deepEqual(first.body.starters.map((s) => [s.id, s.state, s.fresh]), reversed.map((id) => [id, id === "juniper-catalogue" ? "hidden" : "shown", id === "aurel-editorial"]));
  for (const shopId of ["moth-press", "fern-goods"]) {
    const doc = await w.shopData.get(shopId, STARTERS_DOC);
    assert.deepEqual(doc.order, reversed);
    assert.deepEqual(doc.hidden, ["juniper-catalogue"]);
    assert.deepEqual(doc.fresh, ["aurel-editorial"]);
  }
  for (const shopId of ["stock-only", "new-press", "gone-press"]) assert.equal(await w.shopData.get(shopId, STARTERS_DOC), null, shopId);
  assert.equal(w.activity.rows.length, 1);
  const again = await w.ask(ADMIN, "/api/control/starters/save", { starters });
  assert.equal(again.body.changed, false);
  assert.equal(w.activity.rows.length, 1);
  assert.equal(w.records.get(STARTERS_RECORD).by, "admin@example.com");
});

test("a choice must name every starter once and keep one showing", async () => {
  const w = await world();
  assert.equal((await w.ask(ADMIN, "/api/control/starters/save", { starters: choice().slice(1) })).status, 400);
  assert.equal((await w.ask(ADMIN, "/api/control/starters/save", { starters: [...choice().slice(1), choice()[1]] })).status, 400);
  const none = await w.ask(ADMIN, "/api/control/starters/save", { starters: ALL.map((id) => ({ id, shown: false })) });
  assert.equal(none.status, 400);
  assert.match(none.body.message, /at least one/);
  assert.equal(w.records.size, 0);
});

test("one shop that can't be written is named and the rest still get it; the sweep reaches it later and new shops too", async () => {
  const w = await world({ broken: ["fern-goods"] });
  const saved = await w.ask(ADMIN, "/api/control/starters/save", { starters: choice() });
  assert.equal(saved.body.shops, 1);
  assert.deepEqual(saved.body.failed.map((f) => f.shopId), ["fern-goods"]);
  await w.registry.createShop("late-press", { shopId: "late-press", status: "live", plan: "both" });
  const swept = await w.desk.sweep();
  assert.equal(swept.saved, true);
  assert.ok(await w.shopData.get("late-press", STARTERS_DOC));
});

test("the sweep does nothing while nothing was ever saved", async () => {
  const w = await world();
  assert.deepEqual(await w.desk.sweep(), { shops: 0, failed: [], saved: false });
  assert.equal(await w.shopData.get("moth-press", STARTERS_DOC), null);
});

test("a starter the shop added after the last save waits hidden; ids the shop no longer has are dropped", () => {
  const record = { order: ["juniper-catalogue", "old-gone", "juniper-slow-season"], hidden: [], fresh: ["old-gone"], known: ["juniper-catalogue", "juniper-slow-season", "old-gone"] };
  assert.deepEqual(starterRows(record).map((s) => [s.id, s.state]), [["juniper-catalogue", "shown"], ["juniper-slow-season", "shown"], ["aurel-editorial", "waiting"], ...AWAITING_YES.map((id) => [id, "waiting"])]);
  assert.deepEqual(shopDocOf(record).known, ["juniper-catalogue", "juniper-slow-season"]);
  assert.equal(cleanRecord(null), null);
  assert.deepEqual(recordFrom(choice(), "a", "t").known, ALL);
});

test("each starter's styles are the shop's own, in the shop's order, with the names the shop shows", () => {
  const styles = readFileSync(new URL("../apps/shop/src/app/admin/studio/starterStyles.ts", import.meta.url), "utf8");
  for (const { id, styles: list } of STARTERS) {
    const block = styles.slice(styles.indexOf(`"${id}": [`));
    const shop = [...block.slice(0, block.indexOf("\n  ],")).matchAll(/\{ id: "([^"]+)", name: "([^"]+)"/g)].map((m) => ({ id: m[1], name: m[2] }));
    assert.deepEqual(list, shop, id);
  }
});

test("each starter's newest version is the shop's (studio/starterVersions.ts)", () => {
  const versions = readFileSync(new URL("../apps/shop/src/app/admin/studio/starterVersions.ts", import.meta.url), "utf8");
  for (const { id, version } of STARTERS) {
    const block = versions.slice(versions.indexOf(`"${id}": {`));
    const numbers = [...block.slice(0, block.indexOf("looks:")).matchAll(/version: (\d+)/g)].map((m) => Number(m[1]));
    assert.equal(version, Math.max(...numbers), id);
  }
});

test("a style can be hidden from shops, never a starter's own; shops get the list with the rest", async () => {
  const w = await world();
  const starters = choice({ "aurel-editorial": { hiddenStyles: ["sand", "cobalt", "made-up"] }, "juniper-catalogue": { hiddenStyles: ["night"] } });
  const saved = await w.ask(ADMIN, "/api/control/starters/save", { starters });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual((await w.shopData.get("moth-press", STARTERS_DOC)).hiddenStyles, ["juniper-catalogue/night", "aurel-editorial/sand"]);
  const aurel = saved.body.starters.find((s) => s.id === "aurel-editorial");
  assert.deepEqual(aurel.styles.map((s) => [s.id, s.shown, s.own]), [["cobalt", true, true], ["sand", false, false], ["night", true, false]]);
  // Showing the style again is a change; saving the same again is not.
  assert.equal((await w.ask(ADMIN, "/api/control/starters/save", { starters })).body.changed, false);
  const back = await w.ask(ADMIN, "/api/control/starters/save", { starters: choice() });
  assert.equal(back.body.changed, true);
  assert.deepEqual((await w.shopData.get("moth-press", STARTERS_DOC)).hiddenStyles, []);
  assert.ok(starterRows(null).every((s) => s.styles.every((x) => x.shown)));
});

test("the public starter library reads which starters are offered, with no sign-in and nothing about who saved it", async () => {
  const w = await world();
  const route = starterSitesPublicRoutes(w.desk)["GET /api/starters/offered"];
  assert.deepEqual(await route({}), { choice: null });
  await w.ask(ADMIN, "/api/control/starters/save", { starters: choice({ "juniper-catalogue": { shown: false } }) });
  const { choice: offered } = await route({});
  assert.deepEqual(offered.hidden, ["juniper-catalogue"]);
  assert.deepEqual(offered.known, ALL);
  assert.deepEqual(Object.keys(offered).sort(), ["hidden", "hiddenStyles", "known", "order"]);
});
