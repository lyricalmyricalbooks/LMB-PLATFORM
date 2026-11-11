// Colophon's own apps (code plan 26.11-26.13): they put themselves on the store with no setup step, and each one works
// from end to end through the real app store plumbing: found on the store, added with the owner's permission, connected,
// told about a paid order, answering back through the app connection, and forgetting the shop when it's removed.
// Only the outside company (Chit Chats here) and the shop's own database are pretend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeAppAlertStores, fakeAppInstallStores, fakeAppStore, fakeChitChatsStores } from "./fakes.js";
import { createAppMakers } from "./makers.js";
import { createAppInstalls } from "./installs.js";
import { createAppAlerts } from "./alerts.js";
import { createAppConnection } from "./connection.js";
import { createOwnApps, ownAppId, ownAppSecret } from "./ownApps.js";
import { createChitChatsApp } from "../chitchats/app.js";

const ROOT = "a-link-phrase-of-plenty-length";
const URL_ = "https://platform.example";
const OWNER = { uid: "uid-ada", email: "ada@moth.example", email_verified: true };
const ADMIN = { uid: "uid-team", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };

test("own apps list themselves once, keep their secret, and stay off the store when an admin takes them off", async () => {
  const store = fakeAppStore();
  const own = createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example" });
  const makers = createAppMakers({ store, admins: [ADMIN.email], ensureOwnApps: () => own.ensure() });

  const { apps } = await makers.storeList();
  assert.deepEqual(apps.map((a) => a.name), ["Chit Chats"], "on the store with nothing registered by hand");
  const appId = ownAppId("chitchats");
  assert.equal(apps[0].appId, appId);
  assert.ok(await makers.verifyClient(appId, ownAppSecret(ROOT, "chitchats")), "the secret made from the link phrase is the app's");
  assert.equal(await makers.verifyClient(appId, ownAppSecret("another-phrase-altogether", "chitchats")), null);
  assert.equal(own.appOf("chitchats").appId, appId);
  assert.equal(own.sealKeyOf("chitchats").length, 32);

  // A second process (another server, the next deploy) changes nothing.
  const again = createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example" });
  assert.deepEqual((await again.ensure()).listed, [{ appId, changed: false }]);

  // The team's own choices stand: a logo from the review card, and taking it off the store.
  await makers.setBrand(ADMIN, { appId, brand: "mailchimp" });
  await makers.unlist(ADMIN, { appId, reason: "Paused while Chit Chats changes its address." });
  const later = createOwnApps({ store, root: ROOT, platformUrl: "https://new.platform.example", supportEmail: "support@platform.example" });
  await later.ensure();
  const kept = await store.get(appId);
  assert.equal(kept.onStore, false, "an app taken off the store isn't put back");
  assert.equal(kept.listing.details.brand, "mailchimp", "a logo set by the team stays");
  assert.equal(kept.listing.details.installAddress, "https://new.platform.example/account/chitchats.html", "details follow the platform");

  assert.deepEqual((await createOwnApps({ store, root: "short", platformUrl: URL_, supportEmail: "x@platform.example" }).ensure()).listed, [], "no secret, nothing listed");
});

/** Pretend Chit Chats: client 12345 with token tok-good-123. */
function chitChats() {
  const shipments = new Map();
  let n = 0;
  const reply = (status, body) => new Response(body ? JSON.stringify(body) : "", { status, headers: { "content-type": "application/json" } });
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    if (!pathname.startsWith("/api/v1/clients/12345/") || init.headers?.Authorization !== "tok-good-123") return reply(401, { error: { message: "Unauthorized" } });
    if (init.method === "GET" && searchParams.get("limit") === "1") return reply(200, []);
    if (init.method === "POST") {
      const id = `CC${(n += 1)}`;
      shipments.set(id, { id, status: "unpaid", ...JSON.parse(init.body) });
      return reply(201, { shipment: shipments.get(id) });
    }
    const one = /\/shipments\/([A-Z0-9]+)$/.exec(pathname);
    return one && shipments.has(one[1]) ? reply(200, { shipment: shipments.get(one[1]) }) : reply(404, null);
  };
  return { fetch, shipments };
}

/** The whole platform side, as server/world.js wires it, with the shop's database in memory. */
function platform() {
  let clock = Date.parse("2026-11-11T12:00:00Z");
  const now = () => new Date(clock);
  const docs = new Map();
  const shopData = {
    get: async (shopId, path) => structuredClone(docs.get(`${shopId}/${path}`) ?? null),
    create: async (shopId, path, data) => {
      if (docs.has(`${shopId}/${path}`)) throw new Error("exists");
      docs.set(`${shopId}/${path}`, structuredClone(data));
    },
    list: async (shopId, collection) => [...docs].filter(([k]) => k.startsWith(`${shopId}/${collection}/`)).map(([k, data]) => ({ id: k.split("/").pop(), data: structuredClone(data) })),
    find: async (shopId, collection, { where }) => {
      const [[field, , value]] = where;
      return (await shopData.list(shopId, collection)).filter((row) => String(row.data[field] ?? "") >= value);
    },
  };
  const roles = { "ada@moth.example moth-press": "owner" };
  const roleIn = async (person, shopId) => roles[`${person.email} ${shopId}`] ?? null;
  const registry = fakeRegistry();
  registry.shops?.set?.("moth-press", { shopId: "moth-press", pressName: "Moth Press" });
  const apps = fakeAppStore();
  const { installs: installStore, codes } = fakeAppInstallStores();
  const alertStores = fakeAppAlertStores();
  const own = createOwnApps({ store: apps, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example", now });
  const makers = createAppMakers({ store: apps, admins: [ADMIN.email], now, ensureOwnApps: () => own.ensure() });
  const courier = chitChats();
  const delivered = [];
  // Alerts leave by the internet; here each address is answered by the app behind it.
  const alertFetch = async (url, init) => {
    const headers = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    delivered.push(JSON.parse(init.body).topic);
    if (url !== `${URL_}/api/chitchats/alerts`) return new Response("", { status: 404 });
    try {
      return new Response(JSON.stringify(await chitchats.alert({ headers, rawBody: init.body })), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ message: error.message }), { status: error.status ?? 500 });
    }
  };
  const alerts = createAppAlerts({ apps, installs: installStore, outbox: alertStores.outbox, state: alertStores.state, shopData, fetch: alertFetch, now });
  const installs = createAppInstalls({ apps, makers, installs: installStore, codes, registry, auditLog: fakeAuditLog(), now, roleIn, onRemoved: (install) => alerts.removed(install) });
  // The shop answers app requests with its own rules (apps/shop/functions/appRequests.js); here it says yes.
  const sleep = async () => {
    for (const [k, data] of docs) if (k.includes("/appRequests/") && !data.status) docs.set(k, { ...data, status: "done", result: "dispatched", reason: "Marked sent." });
  };
  const connection = createAppConnection({ installs, shopData, registry, outbox: alertStores.outbox, now, sleep, waitMs: 1000 });
  const chitchatsSaved = fakeChitChatsStores();
  const keys = own.appOf("chitchats");
  const chitchats = createChitChatsApp({
    appId: keys.appId, appSecret: keys.appSecret, sealKey: own.sealKeyOf("chitchats"), connections: chitchatsSaved.connections, shipments: chitchatsSaved.shipments,
    exchange: (args) => installs.exchange(args), appCall: (request) => connection(request), roleIn, fetch: courier.fetch, base: "https://staging.chitchats.example",
    returnAddress: `${URL_}/account/chitchats.html`, now,
  });
  return { docs, makers, installs, alerts, chitchats, chitchatsSaved, courier, delivered, tick: (m) => { clock += m * 60_000; }, iso: () => now().toISOString() };
}

test("Chit Chats from the store to a sent order and back off the shop, through the real plumbing", async () => {
  const p = platform();
  const listed = (await p.makers.storeList()).apps.find((a) => a.name === "Chit Chats");
  assert.ok(listed, "the shop's store shows Chit Chats");
  const back = listed.installAddress;

  // The permission page, then the connect page with the code it hands back.
  const preview = await p.installs.preview(OWNER, { appId: listed.appId, shopId: "moth-press", returnAddress: back });
  assert.equal(preview.canApprove, true);
  assert.deepEqual(preview.permissions.map((x) => x.scope), ["write_orders"]);
  const { redirect } = await p.installs.approve(OWNER, { appId: listed.appId, shopId: "moth-press", returnAddress: back, state: "s1" });
  const code = new URL(redirect).searchParams.get("code");
  const connected = await p.chitchats.connect(OWNER, { shopId: "moth-press", code, clientId: "12345", accessToken: "tok-good-123" });
  assert.equal(connected.connected, true);

  // An order is paid in the shop: the alert reaches the app and a Chit Chats shipment is made, once.
  p.tick(1);
  p.docs.set("moth-press/orders/o1", {
    orderId: "1001", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", deliveryMethod: "shipping", currency: "CAD", updatedAt: p.iso(),
    items: [{ bookId: "b1", title: "Moth Songs", quantity: 2, price: 24 }], subtotal: 48,
    customer: { name: "Bea Reader", email: "bea@example.com", address: { line1: "1 Main St", city: "Toronto", state: "ON", postalCode: "M6G 1A1", country: "CA" } },
  });
  await p.alerts.sweep();
  assert.deepEqual(p.delivered, ["orders/paid"]);
  assert.equal(p.courier.shipments.size, 1, "the paid order is in Chit Chats");
  const [shipment] = p.courier.shipments.values();
  assert.equal(shipment.postage_type, "unknown", "no postage is bought");
  assert.equal(shipment.line_items[0].quantity, 2);
  await p.alerts.sweep();
  assert.equal(p.courier.shipments.size, 1, "a second look makes no second shipment");

  // Chit Chats has a tracking number: the app marks the order sent through the app connection, as any app would.
  shipment.status = "in_transit";
  shipment.carrier = "Canada Post";
  shipment.carrier_tracking_code = "7023210039414604";
  await p.chitchats.sweep();
  const requests = [...p.docs].filter(([k]) => k.startsWith("moth-press/appRequests/")).map(([, d]) => d);
  assert.equal(requests.length, 1, "one request to the shop");
  assert.equal(requests[0].op, "order.dispatch");
  assert.equal(requests[0].input.orderId, "o1");
  assert.equal(requests[0].input.trackingNumber, "7023210039414604");
  assert.equal(requests[0].appId, listed.appId);

  // The owner removes the app in Settings › Apps: the key stops at once and the goodbye alert makes the app forget.
  await p.installs.removeForShop("moth-press", listed.appId, OWNER.email);
  await p.alerts.sweep();
  assert.ok(p.delivered.includes("app/uninstalled"));
  assert.equal(p.chitchatsSaved.shops.size, 0, "the Chit Chats details are forgotten");
});
