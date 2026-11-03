// A press's data, on request (code plan 19.16): every collection present, the link works 7 days, every export is
// logged, only the owner can ask from the account page, and at most once a day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPORT_DAYS, SETTINGS, SHOP_COLLECTIONS, STOCKROOM_PARTS, buildExport, closingExportHook, createDataExports, exportApps, exportRoutes } from "./export.js";
import { csvCell, flatten, readZip, toCsv, withoutPrivate } from "./files.js";
import { fakeExportStorage, fakeExportStore, fakeShopData } from "./fakes.js";
import { fakeStockroomData } from "../billing/closingFakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeActivity } from "../../control-room/fakes.js";
import { controlRoomAdmins } from "../../control-room/controlRoom.js";
import { fakePlatformEmail } from "../billing/fakes.js";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { platformSettings } from "../settings.js";
import { TEMPLATES } from "../email/templates.js";
import { dateText } from "../billing/billing.js";

const START = Date.parse("2026-11-02T12:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const person = (uid, email) => ({ uid, email, email_verified: true });
const OWNER = person("uid-owner", "owner@example.com");
const STAFF = person("uid-staff", "staff@example.com");

async function seed(shopData, stockroomData) {
  const put = (path, data) => shopData.set("moth-press", path, data);
  await put("books/b1", { title: "Moths of Ontario", price: 2500, stock: 4, author: { name: "Ada", slug: "ada" } });
  await put("books/b2", { title: "=SUM(1,2)", price: 1800, tags: ["poetry", "riso"] });
  await put("books/b1/private/costs", { unitCost: 400 });
  await put("authors/ada", { name: "Ada" });
  await put("orders/AB-1", { email: "reader@example.com", total: 2500, items: [{ bookId: "b1", qty: 1 }], address: { city: "Toronto" }, accessToken: "never-in-the-export" });
  await put("customers/u1", { email: "reader@example.com", name: "Rea, \"the\" Reader" });
  await put("discounts/SPRING", { percent: 10 });
  await put("reviews/r1", { stars: 5, words: "Lovely\nbook" });
  await put("pages/about", { title: "About", status: "published" });
  await put("newsletter/n1", { email: "fan@example.com" });
  await put("settings/website", { name: "Moth Press", theme: { ink: "#111" }, stripeSecretKey: "sk_live_never" });
  await put("adminSecrets/stripe", { secretKey: "sk_live_never" });
  await stockroomData.set("moth-press", "settings/catalog", { data: JSON.stringify({ b1: { title: "Moths of Ontario", isbn: "978" }, _meta: { x: 1 } }), ts: 1 });
  await stockroomData.set("moth-press", "books/b1/data/ledger", { data: JSON.stringify([{ id: "l1", qty: 5, note: "printed" }, { id: "l2", qty: -1, note: "sold" }]), ts: 1 });
  await stockroomData.set("moth-press", "books/b1/data/expenses", { data: JSON.stringify([{ id: "e1", amount: 120 }]), ts: 1 });
}

async function world({ plan = "both" } = {}) {
  let clock = START;
  const now = () => new Date(clock);
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", projectId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", plan, status: "live" });
  const shopData = fakeShopData();
  const stockroomData = fakeStockroomData();
  await seed(shopData, stockroomData);
  const storage = fakeExportStorage();
  const store = fakeExportStore();
  const auditLog = fakeAuditLog();
  const activity = fakeActivity();
  const email = fakePlatformEmail();
  const roleIn = async (who, shopId) => (shopId === "moth-press" && who.email === "owner@example.com" ? "owner" : who.email === "staff@example.com" ? "staff" : null);
  const exports = createDataExports({ shopData, stockroomData, storage, store, registry, auditLog, activity, email, roleIn, admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), now });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: exportRoutes(exports) });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const admin = () => ({ uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(clock / 1000) });
  return { registry, shopData, stockroomData, storage, store, auditLog, activity, email, exports, ask, admin, now, tick: (ms) => void (clock += ms) };
}

test("every collection is in the export, one file each, with the stockroom's ledger and a README", async () => {
  const w = await world();
  const built = await buildExport({ shopId: "moth-press", pressName: "Moth Press", shopData: w.shopData, stockroomData: w.stockroomData, storage: w.storage, now: w.now() });
  const names = built.files.map((f) => f.file);
  for (const c of SHOP_COLLECTIONS) assert.ok(names.includes(c.file), c.file);
  assert.ok(names.includes(SETTINGS.file));
  assert.ok(names.includes("stockroom-books.csv"));
  for (const p of STOCKROOM_PARTS) assert.ok(names.includes(p.file), p.file);
  assert.ok(names.includes("README.txt"));
  assert.equal(built.folder, "exports/moth-press/20261102T120000Z");
  for (const name of names) assert.ok(w.storage.files.has(`${built.folder}/${name}`), name);

  const file = (name) => w.storage.files.get(`${built.folder}/${name}`).content;
  // Rows, counted; an empty collection still has its file with a header.
  assert.equal(built.files.find((f) => f.file === "books.csv").rows, 2, "only the books themselves, not their private costs");
  assert.match(file("giftCards.csv"), /^﻿id\r\n$/);
  assert.match(file("books.csv"), /author\.name/);
  assert.match(file("books.csv"), /'=SUM\(1,2\)/, "a formula is never run by a spreadsheet");
  assert.match(file("orders.csv"), /"\[\{""bookId"":""b1"",""qty"":1\}\]"/);
  assert.doesNotMatch(file("orders.csv"), /never-in-the-export/);
  assert.match(file("customers.csv"), /"Rea, ""the"" Reader"/);
  const settings = JSON.parse(file("settings.json"));
  assert.deepEqual(settings.website, { name: "Moth Press", theme: { ink: "#111" } });
  assert.ok(![...w.storage.files.values()].some((f) => String(f.content).includes("sk_live_never")), "no secret reaches a file");
  assert.match(file("stockroom-ledger.csv"), /bookId,id,qty,note\r\nb1,l1,5,printed\r\nb1,l2,-1,sold/);
  assert.equal(built.files.find((f) => f.file === "stockroom-books.csv").rows, 1);
  assert.match(file("README.txt"), /orders\.csv: every order.*\(1 row\)/);
  assert.ok(file("README.txt").includes(`works until ${dateText("2026-11-09T12:00:00Z")}.`));

  // One zip with every file, readable.
  const zip = readZip(w.storage.files.get(built.zip).content);
  assert.deepEqual(zip.map((f) => f.name), names);
  assert.ok(zip.every((f) => f.crcOk));
  assert.equal(zip.find((f) => f.name === "books.csv").content, file("books.csv"));
});

test("the link works for 7 days, then stops", async () => {
  const w = await world();
  const built = await buildExport({ shopId: "moth-press", shopData: w.shopData, stockroomData: w.stockroomData, storage: w.storage, now: w.now() });
  assert.equal(Date.parse(built.expiresAt) - START, EXPORT_DAYS * DAY);
  assert.ok(w.storage.open(built.link, START + 6 * DAY + 23 * HOUR), "still works on day 7");
  assert.equal(w.storage.open(built.link, START + 7 * DAY), null, "and not after");
  assert.equal(w.storage.links.get(built.link).path, built.zip);
});

test("a shop-only plan exports the shop, a stockroom-only plan the stockroom", async () => {
  const w = await world();
  const shopOnly = await buildExport({ shopId: "moth-press", apps: { shop: true, stockroom: false }, shopData: w.shopData, stockroomData: w.stockroomData, storage: w.storage, now: w.now() });
  assert.ok(!shopOnly.files.some((f) => f.file.startsWith("stockroom-")));
  const stockroomOnly = await buildExport({ shopId: "moth-press", apps: { shop: false, stockroom: true }, shopData: w.shopData, stockroomData: w.stockroomData, storage: w.storage, now: new Date(START + 1000) });
  assert.ok(!stockroomOnly.files.some((f) => f.file === "orders.csv"));
  assert.ok(stockroomOnly.files.some((f) => f.file === "stockroom-ledger.csv"));
});

test("the control room's export: admins only, with a reason, logged in the registry, the shop's log and the activity log, and emailed", async () => {
  const w = await world();
  assert.equal((await w.ask({ ...OWNER, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(START / 1000) }, "/api/control/export", { shopId: "moth-press", reason: "the press asked by phone" })).status, 403);
  assert.equal((await w.ask(w.admin(), "/api/control/export", { shopId: "moth-press", reason: "short" })).status, 400);
  assert.equal((await w.ask(w.admin(), "/api/control/export", { shopId: "nobody-press", reason: "the press asked by phone" })).status, 404);
  assert.equal(w.storage.files.size, 0);

  const answer = await w.ask(w.admin(), "/api/control/export", { shopId: "moth-press", reason: "privacy request from the press" });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.emailedTo, "owner@example.com");
  assert.equal(answer.body.link, undefined, "the link goes only to the owner's inbox");
  const events = [...w.registry.events.get("moth-press").values()];
  assert.ok(events.some((e) => e.what === "data-export" && e.by === "admin@example.com" && e.reason === "privacy request from the press"));
  assert.ok([...w.auditLog.entries.get("moth-press").values()].some((e) => e.what === "data-export"));
  assert.ok([...w.activity.rows.values()].some((e) => e.what === "data-export" && e.shopId === "moth-press"));
  const [sent] = w.email.list();
  assert.equal(sent.kind, "data-export-ready");
  assert.equal(sent.to, "owner@example.com");
  assert.match(sent.data.link, /^https:\/\/storage\.example\/exports\/moth-press\//);
  assert.equal(sent.data.until, dateText("2026-11-09T12:00:00Z"));
  assert.equal(sent.data.reason, "privacy request from the press");
  // The control room isn't held to the press's once a day.
  w.tick(HOUR);
  assert.equal((await w.ask(w.admin(), "/api/control/export", { shopId: "moth-press", reason: "a second copy for the press" })).status, 200);
});

test("the account page's export: the owner only, once a day per shop", async () => {
  const w = await world();
  assert.equal((await w.ask(STAFF, "/api/account/export", { shopId: "moth-press" })).status, 403);
  assert.equal((await w.ask(OWNER, "/api/account/export", { shopId: "other-press" })).status, 403);
  assert.equal(w.email.list().length, 0);

  const first = await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(first.status, 200);
  assert.equal(first.body.emailedTo, "owner@example.com");
  assert.equal(w.email.list().length, 1);
  assert.ok([...w.registry.events.get("moth-press").values()].some((e) => e.what === "data-export" && e.asked === "owner" && e.by === "owner@example.com"));

  w.tick(23 * HOUR);
  const again = await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(again.status, 429);
  assert.match(again.body.message, /less than a day ago/);
  assert.equal(w.email.list().length, 1);

  w.tick(HOUR + 1000);
  assert.equal((await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" })).status, 200);
  assert.equal(w.email.list().length, 2);
});

test("a copy that fails to build sends nothing and doesn't count toward the day", async () => {
  const w = await world();
  w.storage.failWrites = true;
  const failed = await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(failed.status, 502);
  assert.equal(w.email.list().length, 0);
  w.storage.failWrites = false;
  assert.equal((await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" })).status, 200);
});

test("when a shop closes, the closing sweep's hook emails its owner the whole export", async () => {
  const w = await world();
  await closingExportHook(w.exports)({ shopId: "moth-press" }, { at: new Date(START).toISOString() });
  const [sent] = w.email.list();
  assert.equal(sent.kind, "data-export-ready");
  assert.match(sent.data.reason, /closed/);
});

test("the files' pieces: flattening, quoting and leaving out private fields", () => {
  assert.deepEqual(flatten({ a: { b: 1, c: { d: 2 } }, e: [1], f: null, g: new Date(START) }), { "a.b": 1, "a.c": '{"d":2}', e: "[1]", f: "", g: "2026-11-02T12:00:00.000Z" });
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("-5 copies"), "'-5 copies");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell("@me"), "'@me");
  assert.deepEqual(withoutPrivate({ name: "x", apiKey: "k", nested: { password: "p", ok: 1 }, list: [{ tokenHash: "h", keep: 2 }] }), { name: "x", nested: { ok: 1 }, list: [{ keep: 2 }] });
  assert.equal(toCsv([]), "﻿id\r\n");
});

test("the email says how long the link works and keeps a press's words as words", () => {
  const settings = platformSettings({});
  const parts = TEMPLATES["data-export-ready"]({ link: "https://storage.example/x.zip", until: "9 November 2026", asked: "platform", reason: "<b>privacy</b> request" }, { settings, pressName: "Moth Press" });
  assert.match(parts.text, /works until 9 November 2026/);
  assert.doesNotMatch(parts.html, /<b>privacy/);
  assert.throws(() => TEMPLATES["data-export-ready"]({ link: "http://x.example", until: "x", asked: "owner" }, { settings, pressName: "P" }), /https/);
});

test("a copy whose email fails isn't counted: the owner can ask again at once, and isn't told it was emailed", async () => {
  const w = await world();
  const send = w.email.sendPlatform;
  w.email.sendPlatform = async () => { throw new Error("the email service is down (pretend)"); };
  const failed = await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(failed.status, 502);
  assert.match(failed.body.message, /couldn't be sent/);
  assert.ok([...w.store.rows.values()].some((r) => r.shopId === "moth-press" && r.status === "failed"));
  assert.ok(![...w.store.rows.values()].some((r) => r.shopId === "moth-press" && r.status === "ready"));
  w.email.sendPlatform = send;
  const again = await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(again.status, 200);
  assert.equal(w.email.list().length, 1);
});

test("two clicks at the same moment make one copy; a copy stopped part-way stops holding the owner back", async () => {
  const w = await world();
  const [a, b] = await Promise.all([w.ask(OWNER, "/api/account/export", { shopId: "moth-press" }), w.ask(OWNER, "/api/account/export", { shopId: "moth-press" })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429]);
  assert.equal(w.email.list().length, 1);

  // A build killed part-way leaves the lock "making": it holds for a few minutes, then not.
  const w2 = await world();
  await w2.store.update("owner-lock-moth-press", () => ({ id: "owner-lock-moth-press", kind: "owner-lock", asked: "owner", status: "making", at: w2.now().toISOString() }));
  const busy = await w2.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(busy.status, 429);
  assert.match(busy.body.message, /being made right now/);
  w2.tick(16 * 60_000);
  assert.equal((await w2.ask(OWNER, "/api/account/export", { shopId: "moth-press" })).status, 200);
});

test("the refusal's date doesn't end in two dots", async () => {
  const w = await world();
  assert.equal((await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" })).status, 200);
  const again = await w.ask(OWNER, "/api/account/export", { shopId: "moth-press" });
  assert.equal(again.status, 429);
  assert.doesNotMatch(again.body.message, /\.\.$/);
});

test("an app a plan change closed stays in the export while its 90 days to download last", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const closedApps = { stockroom: { closedAt: "2026-10-01T00:00:00Z", downloadUntil: "2026-12-30T00:00:00Z" } };
  assert.deepEqual(exportApps({ plan: "shop", closedApps }, now), { shop: true, stockroom: true });
  assert.deepEqual(exportApps({ plan: "shop", closedApps: { stockroom: { downloadUntil: "2026-11-01T00:00:00Z" } } }, now), { shop: true, stockroom: false }, "not after the 90 days");
  assert.deepEqual(exportApps({ plan: "stockroom" }, now), { shop: false, stockroom: true });
  assert.deepEqual(exportApps({ plan: "both" }, now), { shop: true, stockroom: true });
});

test("the closing emails and the account page name every file the download holds, in the export's own order", async () => {
  const { DOWNLOAD_HOLDS, downloadHolds } = await import("../billing/closedApps.js");
  assert.deepEqual(DOWNLOAD_HOLDS.shop.map(([name]) => name), [...SHOP_COLLECTIONS.map((c) => c.name), SETTINGS.name]);
  assert.deepEqual(DOWNLOAD_HOLDS.stockroom.map(([name]) => name), ["books", ...STOCKROOM_PARTS.map((p) => p.part)]);
  assert.equal(downloadHolds([]), "");
  assert.match(downloadHolds(["stockroom"]), /^a spreadsheet each of the books in your stockroom, the stock ledger, .* and what artists are owed$/);
  assert.match(downloadHolds(["stockroom", "shop"]), /^a spreadsheet each of your books and products, .*your shop's settings, the books in your stockroom, /);
});
