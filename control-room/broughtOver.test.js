// What a press brought over from its old shop, in its record: admins only; read from the shop's own audit-log lines
// (the exact words the shop's import steps write) and its photo-copy progress; other lines are ignored; a shop not live
// has nothing to show; the real reading asks only for the import lines, not the whole audit log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { broughtOverRoutes, broughtOverSummary, createBroughtOver, runOf } from "./broughtOver.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";
import { shopDataClient } from "../clients/shop.js";
import { firestoreClient } from "../clients/firestore.js";
import { fakeFirestore } from "../clients/fake-firestore.js";
import { token } from "../clients/fake-fetch.js";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const SHOP = "moth-press";
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

// The lines as the shop's own import steps write them (apps/shop: orderImport.js, giftCardImport.js, ShopMoveDialogs.tsx, BookImportDialog.tsx).
const LINES = [
  { type: "orders", message: "Brought 40 past orders over from the old shop (CA$1234.50 in sales, history only)", orders: 40, createdAt: "2026-11-01T10:00:00Z" },
  { type: "orders", message: "Brought 2 past orders over from the old shop (CA$20.00 in sales, history only)", orders: 2, createdAt: "2026-11-02T10:00:00Z" },
  { type: "giftCards", message: "Brought 3 gift cards over from the old shop (CA$75.00 in balances)", cards: 3, balanceMinor: 7500, createdAt: "2026-11-01T11:00:00Z" },
  { type: "customers", message: "Brought 120 customers over from the old shop; 80 joined the newsletter", createdAt: "2026-11-01T12:00:00Z" },
  { type: "catalog", message: "Old shop links: 15 now lead to the imported books", createdAt: "2026-11-01T13:00:00Z" },
  { type: "orders", message: "Refunded order #12", createdAt: "2026-11-02T09:00:00Z" },
  { type: "catalog", message: "Created book: Moths", createdAt: "2026-11-02T09:30:00Z" },
];
const PHOTOS = { copiedTotal: 30, pending: 4, failed: { "https://old.example/a.jpg": { at: "2026-11-02T00:00:00Z" } }, lastRunAt: "2026-11-03T11:00:00Z" };

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", status: "live" });
  await registry.createShop("new-press", { shopId: "new-press", status: "making" });
  await registry.createShop("fresh-press", { shopId: "fresh-press", status: "live" });
  const shopData = fakeShopData();
  for (const [i, line] of LINES.entries()) await shopData.set(SHOP, `audit-log/l${i}`, line);
  await shopData.set(SHOP, "systemStatus/photoImport", PHOTOS);
  const desk = createBroughtOver({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: broughtOverRoutes(desk), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/brought-over", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask };
}

test("only platform admins see what a shop brought over", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(ADMIN, { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, { shopId: SHOP })).status, 200);
});

test("each kind added up across runs, with its latest date; other lines are left out", async () => {
  const { brought, nothing } = await (await world()).desk.forShop(ADMIN, { shopId: SHOP });
  assert.equal(nothing, false);
  assert.deepEqual(brought.orders, { count: 42, amount: 1254.5, runs: 2, lastAt: "2026-11-02T10:00:00Z" });
  assert.deepEqual(brought.giftCards, { count: 3, amount: 75, runs: 1, lastAt: "2026-11-01T11:00:00Z" });
  assert.deepEqual(brought.customers, { count: 120, amount: 0, newsletter: 80, runs: 1, lastAt: "2026-11-01T12:00:00Z" });
  assert.equal(brought.links.count, 15);
  assert.deepEqual(brought.photos, { copied: 30, waiting: 4, unreadable: 1, lastRunAt: "2026-11-03T11:00:00Z" });
});

test("a shop with nothing brought over, and one not live yet", async () => {
  const w = await world();
  const fresh = await w.desk.forShop(ADMIN, { shopId: "fresh-press" });
  assert.equal(fresh.nothing, true);
  assert.equal((await w.desk.forShop(ADMIN, { shopId: "new-press" })).brought, null);
  assert.equal(runOf({ type: "orders", message: "Brought it up with the press" }).count, 0, "a line without a number counts nothing");
  assert.equal(broughtOverSummary([], { copiedTotal: 0, pending: 0, failed: {} }).photos, null);
});

test("the real reading asks the shop's database only for the import lines", async () => {
  const fs = fakeFirestore();
  const shopData = shopDataClient((projectId) => firestoreClient({ fetch: fs.fetch, token, projectId }));
  for (const [i, line] of LINES.entries()) await shopData.set("lmb-test-shop", `audit-log/l${i}`, line);
  const brought = (await shopData.find("lmb-test-shop", "audit-log", { where: [["message", ">=", "Brought "], ["message", "<", "Brought!"]] })).map((d) => d.data.message);
  assert.equal(brought.length, 4);
  assert.ok(brought.every((m) => m.startsWith("Brought ")));
});

test("the shop drawer shows the section, and both web doors serve the route", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/brought-over"/);
  assert.match(app, /"Brought over from the old shop"/);
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /broughtOverRoutes\(broughtOver\)/, door);
});
