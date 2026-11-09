// Payment links and the fair till in a live shop's record: admins only; payment-link orders (paid, waiting, practice left
// out) and the stockroom's `Book Fair` history rows (a checkout of several books is one sale; voided rows don't count),
// plus the fair helpers' inbox; a plan without the shop or the stockroom shows only its own way; read only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSalesChannels, fairTillSummary, paymentLinksSummary, salesChannelsRoutes } from "./salesChannels.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeStockroomData } from "../services/billing/closingFakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const dayAgo = (days) => ago(days).slice(0, 10);
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const SHOP = "moth-press";

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", status: "live", plan: "both" });
  await registry.createShop("shop-only", { shopId: "shop-only", status: "live", plan: "shop" });
  await registry.createShop("new-press", { shopId: "new-press", status: "making", plan: "both" });
  const shopData = fakeShopData();
  const order = (id, data) => shopData.set(SHOP, `orders/${id}`, { source: "payment_link", status: "paid", paymentStatus: "paid", ...data });
  await order("l1", { total: 40, createdAt: ago(50), paidAt: ago(49) });
  await order("l2", { total: 25.5, createdAt: ago(10), paidAt: ago(9) });
  await order("l3", { total: 30, status: "pending_payment", paymentStatus: "unpaid", createdAt: ago(1) });
  await order("l4", { total: 99, isTest: true, createdAt: ago(2), paidAt: ago(2) });
  await shopData.set(SHOP, "orders/web1", { source: "website", total: 500, paymentStatus: "paid", createdAt: ago(3) });
  const stockroomData = fakeStockroomData();
  await stockroomData.set(SHOP, "settings/catalog", { data: JSON.stringify({ b1: { title: "Moths" }, b2: { title: "Wasps" }, _meta: {} }), ts: 1 });
  await stockroomData.set(SHOP, "books/b1/data/hist", { data: JSON.stringify([
    { num: "POS-1", chan: "Book Fair", qty: 2, price: 20, date: dayAgo(40) },
    { num: "POS-2", chan: "Book Fair", qty: 1, price: 20, date: dayAgo(5) },
    { num: "POS-3", chan: "Book Fair", qty: 1, price: 20, date: dayAgo(5), voided: true },
    { num: "W-9", chan: "Website", qty: 1, price: 20, date: dayAgo(5) },
  ]), ts: 1 });
  // The second book was in the same checkout as the first's POS-2: one sale, two copies.
  await stockroomData.set(SHOP, "books/b2/data/hist", { data: JSON.stringify([{ num: "POS-2", chan: "Book Fair", qty: 1, price: 15, date: dayAgo(5) }]), ts: 1 });
  await stockroomData.set(SHOP, "fairSales/h1", { by: "Helper@example.com", at: ago(5), lines: [] });
  await stockroomData.set(SHOP, "fairSales/h2", { by: "helper@example.com", at: ago(4), lines: [] });
  await stockroomData.set(SHOP, "fairSales/h3", { by: "other@example.com", at: ago(3), cancelled: true });
  const desk = createSalesChannels({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, stockroomData, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: salesChannelsRoutes(desk), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/sales-channels", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, stockroomData, shopData };
}

test("only platform admins see a shop's payment links and fair till", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(ADMIN, { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, { shopId: SHOP })).status, 200);
});

test("payment links: paid ones with their total, the one waiting, practice and website orders left out", async () => {
  const { channels } = await (await world()).desk.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual(channels.links, { made: 3, paid: 2, amount: 65.5, waiting: 1, recent: 1, lastPaidAt: ago(9), lastMadeAt: ago(1), unpaid: null });
});

test("fair till: one sale per checkout, voided rows and website rows left out, helpers counted by person", async () => {
  const { channels } = await (await world()).desk.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual(channels.fair, {
    sales: 2, copies: 4, amount: 75, days: 2, recent: 1, lastDay: dayAgo(5),
    helpers: { sales: 2, people: 1, lastAt: ago(4) },
  });
  assert.equal(channels.stockroom, "read");
});

test("a plan without the stockroom, a shop not live, and nothing sold yet", async () => {
  const w = await world();
  const shopOnly = (await w.desk.forShop(ADMIN, { shopId: "shop-only" })).channels;
  assert.deepEqual([shopOnly.hasShop, shopOnly.hasStockroom, shopOnly.links, shopOnly.fair, shopOnly.stockroom], [true, false, null, null, "none"]);
  assert.equal((await w.desk.forShop(ADMIN, { shopId: "new-press" })).channels, null);
  assert.equal(paymentLinksSummary([], NOW), null);
  assert.equal(fairTillSummary({ b1: [{ chan: "Website", qty: 1 }] }, [], NOW), null);
});

test("the shop drawer shows the section, and both web doors serve the route", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/sales-channels"/);
  assert.match(app, /"Payment links and fair till"/);
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /salesChannelsRoutes\(salesChannels\)/, door);
});

test("a payment link still unpaid after three days is flagged in the record", async () => {
  assert.equal(paymentLinksSummary([{ status: "pending_payment", paymentStatus: "unpaid", total: 30, createdAt: ago(1) }], NOW).unpaid, null, "a day old: still fine");
  assert.deepEqual(paymentLinksSummary([
    { status: "pending_payment", paymentStatus: "unpaid", total: 30, createdAt: ago(4) },
    { status: "pending_payment", paymentStatus: "unpaid", total: 12.5, createdAt: ago(9) },
    { status: "pending_payment", paymentStatus: "unpaid", total: 99, createdAt: ago(1) },
  ], NOW).unpaid, { count: 2, amount: 42.5, oldestDays: 9, expired: 0, reminded: 0 });
});

test("fair till by month across presses: only live stockroom presses, month by month, presses counted once", async () => {
  const { fairTillMonths } = await import("./salesChannels.js");
  const w = await world();
  await w.stockroomData.set("shop-only", "settings/catalog", { data: JSON.stringify({ x: {} }), ts: 1 });
  await w.stockroomData.set("shop-only", "books/x/data/hist", { data: JSON.stringify([{ num: "P", chan: "Book Fair", qty: 9, price: 9, date: dayAgo(1) }]), ts: 1 });
  const { months, presses, unread } = await w.desk.fairMonths(ADMIN);
  assert.equal(months.length, 12);
  assert.equal(months.at(-1).month, "2026-11");
  assert.equal(presses, 1, "the shop-only plan has no stockroom to read");
  assert.deepEqual(unread, []);
  const total = months.reduce((n, m) => ({ sales: n.sales + m.sales, copies: n.copies + m.copies, amount: n.amount + m.amount }), { sales: 0, copies: 0, amount: 0 });
  assert.deepEqual(total, { sales: 2, copies: 4, amount: 75 });
  assert.deepEqual(months.find((m) => m.month === dayAgo(40).slice(0, 7)), { month: dayAgo(40).slice(0, 7), sales: 1, copies: 2, amount: 40, presses: 1 });
  const two = fairTillMonths([{ shopId: "a", hist: { b: [{ num: "1", chan: "Book Fair", qty: 1, price: 5, date: "2026-11-01" }] } }, { shopId: "b", hist: { b: [{ num: "1", chan: "Book Fair", qty: 1, price: 5, date: "2026-11-02" }] } }], NOW);
  assert.deepEqual(two.at(-1), { month: "2026-11", sales: 2, copies: 2, amount: 10, presses: 2 }, "the same sale number at two presses is two sales");
  assert.equal((await w.ask(PRESS, {})).status, 403);
});

test("fair till by month ends on Toronto's month: the last evening of October is still October", async () => {
  const { fairTillMonths } = await import("./salesChannels.js");
  const halloween = Date.parse("2026-11-01T01:00:00Z"); // 31 October, 21:00 in Toronto
  const months = fairTillMonths([{ shopId: "a", hist: { b: [{ num: "1", chan: "Book Fair", qty: 1, price: 5, date: "2026-10-31" }, { num: "2", chan: "Book Fair", qty: 1, price: 5, date: "2025-11-15" }] } }], halloween);
  assert.equal(months.at(-1).month, "2026-10");
  assert.equal(months[0].month, "2025-11", "twelve months, this one included");
  assert.equal(months.reduce((n, m) => n + m.sales, 0), 2);
});

test("the business side shows fair till by month, and the Shops list filters by risk", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/fair-months"/);
  assert.match(app, /function riskMatches/);
  assert.match(app, /"Drift watch"/);
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="fair-months"/);
  assert.match(html, /id="shop-risk"/);
});

test("an unpaid link says whether the shop reminded the customer and whether it has closed", async () => {
  assert.deepEqual(paymentLinksSummary([
    { status: "pending_payment", paymentStatus: "unpaid", total: 10, createdAt: ago(9), paymentLink: { expiresAt: ago(1) }, reminderSentAt: ago(3) },
    { status: "pending_payment", paymentStatus: "unpaid", total: 10, createdAt: ago(4), paymentLink: { expiresAt: ago(-3) } },
  ], NOW).unpaid, { count: 2, amount: 20, oldestDays: 9, expired: 1, reminded: 1 });
  // In the record, the link record's reminderSentAt is read for each link still waiting.
  const w = await world();
  await w.shopData.set(SHOP, "orders/l3", { source: "payment_link", status: "pending_payment", paymentStatus: "unpaid", total: 30, createdAt: ago(5) });
  await w.shopData.set(SHOP, "paymentLinks/l3", { reminderSentAt: ago(1) });
  const { channels } = await w.desk.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual([channels.links.unpaid.count, channels.links.unpaid.reminded], [1, 1]);
});
