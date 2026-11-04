// Alerts to apps (code plan 26.4): changes found by looking, queued once, signed, retried for a day, then given up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fakeFirestore } from "../../clients/fake-firestore.js";
import { token } from "../../clients/fake-fetch.js";
import { firestoreClient } from "../../clients/firestore.js";
import { firestoreAppAlertState, firestoreAppAlerts } from "../../clients/stores.js";
import { RETRY_MINUTES, alertSignature, createAppAlerts, publicAlertAddress } from "./alerts.js";
import { fakeAppAlertStores, fakeAppInstallStores } from "./fakes.js";

const SECRET = "cs_secret_1";
const FINGERPRINT = createHash("sha256").update(SECRET).digest("hex");
const DETAILS = { name: "Parcel Pal", alertsAddress: "https://tools.example/alerts", alertTopics: ["orders/paid", "orders/shipped", "inventory/changed"], scopes: ["write_orders", "read_inventory"] };

function world({ stores = fakeAppAlertStores(), answer = () => ({ status: 200 }) } = {}) {
  let clock = Date.parse("2026-11-04T12:00:00Z");
  const now = () => new Date(clock);
  const shop = { orders: {}, books: {} };
  const shopData = {
    find: async (shopId, collection, { where }) => {
      const [[field, , value]] = where;
      return shopId === "moth-press" ? Object.entries(shop[collection]).filter(([, d]) => String(d[field] ?? "") >= value).map(([id, d]) => ({ id, data: structuredClone(d) })) : [];
    },
  };
  const app = { appId: "app_1", secretHash: FINGERPRINT, draft: DETAILS, listing: { details: DETAILS } };
  const apps = { get: async (id) => (id === "app_1" ? structuredClone(app) : null) };
  const { installs } = fakeAppInstallStores();
  installs.rows.set("moth-press~app_1", { installId: "moth-press~app_1", appId: "app_1", shopId: "moth-press", scopes: ["write_orders", "read_inventory"], status: "active", installedAt: "2026-11-04T11:00:00Z" });
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, ...init, json: JSON.parse(init.body) });
    const reply = answer(sent.length);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const alerts = createAppAlerts({ apps, installs, outbox: stores.outbox, state: stores.state, shopData, fetch, now });
  return { alerts, shop, sent, app, installs, stores, tick: (minutes) => { clock += minutes * 60_000; }, iso: () => now().toISOString() };
}

test("a paid order is alerted once, signed with the fingerprint of the app's secret", async () => {
  const w = world();
  w.shop.orders.o1 = { orderId: "1001", paymentStatus: "paid", updatedAt: "2026-11-04T11:59:00Z", items: [], customer: { email: "bea@example.com", address: { city: "Toronto" } } };
  w.shop.orders.t1 = { paymentStatus: "paid", isTest: true, updatedAt: "2026-11-04T11:59:00Z" };
  const first = await w.alerts.sweep();
  assert.equal(first.queued, 1);
  assert.equal(w.sent.length, 1);
  const message = w.sent[0];
  assert.equal(message.url, "https://tools.example/alerts");
  assert.equal(message.headers["X-Colophon-Topic"], "orders/paid");
  assert.equal(message.json.data.order.id, "o1");
  assert.equal(message.json.data.order.customer, undefined, "no email without the customers permission");
  assert.equal(message.headers["X-Colophon-Signature"], alertSignature(FINGERPRINT, message.body));
  assert.equal(message.redirect, "manual");

  w.tick(1);
  w.shop.orders.o1.updatedAt = w.iso();
  await w.alerts.sweep();
  assert.equal(w.sent.length, 1, "the same paid order isn't alerted twice");

  w.tick(1);
  Object.assign(w.shop.orders.o1, { fulfillmentStatus: "shipped", updatedAt: w.iso() });
  await w.alerts.sweep();
  assert.deepEqual(w.sent.map((m) => m.headers["X-Colophon-Topic"]), ["orders/paid", "orders/shipped"]);
});

test("stock changes are alerted; a product change without new stock isn't (the app didn't ask for products)", async () => {
  const w = world();
  w.shop.books.b1 = { title: "Moth Songs", stockLevel: 5, updatedAt: "2026-11-04T11:59:00Z" };
  await w.alerts.sweep();
  assert.equal(w.sent.length, 0, "the first look only learns the stock");
  w.tick(1);
  Object.assign(w.shop.books.b1, { title: "Moth Songs (2nd)", updatedAt: w.iso() });
  await w.alerts.sweep();
  assert.equal(w.sent.length, 0);
  w.tick(1);
  Object.assign(w.shop.books.b1, { stockLevel: 4, updatedAt: w.iso() });
  await w.alerts.sweep();
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].headers["X-Colophon-Topic"], "inventory/changed");
  assert.equal(w.sent[0].json.data.inventory.available, 4);
});

test("a failing address is tried again later, then given up after a day", async () => {
  const w = world({ answer: () => ({ status: 500 }) });
  w.shop.orders.o1 = { paymentStatus: "paid", updatedAt: "2026-11-04T11:59:00Z", items: [] };
  await w.alerts.sweep();
  const [alert] = [...w.stores.outbox.rows.values()];
  assert.equal(alert.status, "waiting");
  assert.equal(alert.lastError, "answered 500");
  for (const minutes of RETRY_MINUTES) {
    await w.alerts.deliver();
    w.tick(minutes);
    await w.alerts.deliver();
  }
  const done = w.stores.outbox.rows.get(alert.id);
  assert.equal(done.status, "failed");
  assert.equal(done.tries, RETRY_MINUTES.length + 1);
  assert.equal(w.sent.length, RETRY_MINUTES.length + 1, "no try before its time");
});

test("an address that can't be reached counts as a failed try", async () => {
  const w = world({ answer: (n) => (n === 1 ? new Error("connection refused") : { status: 204 }) });
  w.shop.orders.o1 = { paymentStatus: "paid", updatedAt: "2026-11-04T11:59:00Z", items: [] };
  await w.alerts.sweep();
  w.tick(RETRY_MINUTES[0]);
  const second = await w.alerts.deliver();
  assert.equal(second.sent, 1);
});

test("a removed app gets only its goodbye; alerts queued before are dropped", async () => {
  const w = world();
  w.shop.orders.o1 = { paymentStatus: "paid", updatedAt: "2026-11-04T11:59:00Z", items: [] };
  await w.alerts.scan();
  const install = { ...w.installs.rows.get("moth-press~app_1"), status: "removed", removedAt: "2026-11-04T12:00:30Z" };
  w.installs.rows.set(install.installId, install);
  await w.alerts.removed(install);
  const counts = await w.alerts.deliver();
  assert.deepEqual(w.sent.map((m) => m.headers["X-Colophon-Topic"]), ["app/uninstalled"]);
  assert.equal(counts.dropped, 1);
});

test("alerts only go to public https addresses", () => {
  assert.ok(publicAlertAddress("https://tools.example/alerts"));
  for (const bad of ["http://tools.example/a", "https://169.254.169.254/x", "https://10.0.0.1/", "https://[::1]/", "https://localhost/", "https://metadata.google.internal/", "https://printer.local/", "https://intranet/", "https://u:p@tools.example/", "nope"]) {
    assert.ok(!publicAlertAddress(bad), bad);
  }
});

test("the Firestore stores keep the outbox and each shop's last look", async () => {
  const fs = fakeFirestore();
  const db = firestoreClient({ fetch: fs.fetch, token, projectId: "lmb-platform-prod" });
  const w = world({ stores: { outbox: firestoreAppAlerts(db), state: firestoreAppAlertState(db) } });
  w.shop.orders.o1 = { paymentStatus: "paid", updatedAt: "2026-11-04T11:59:00Z", items: [] };
  const result = await w.alerts.sweep();
  assert.equal(result.sent, 1, JSON.stringify(result));
  assert.ok((await db.get("appAlertState/moth-press")).cursor);
});
