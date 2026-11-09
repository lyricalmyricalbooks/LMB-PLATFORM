// The Chit Chats app (code plan 26.11): connect with the install code, a paid order becomes a Chit Chats shipment, and
// the tracking number comes back to the shop once Chit Chats has one. Chit Chats itself is pretend here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { platformSettings } from "../settings.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeAppInstallStores, fakeAppStore, fakeChitChatsStores } from "../apps/fakes.js";
import { createAppMakers } from "../apps/makers.js";
import { createAppInstalls } from "../apps/installs.js";
import { alertSignature } from "../apps/alerts.js";
import { appInstallRoutes, appMakerRoutes } from "../apps/routes.js";
import { createChitChatsApp, parcelOf, shipmentFor, USUAL_PARCEL } from "./app.js";
import { chitChatsPublicRoutes, chitChatsRoutes } from "./routes.js";

const OWNER = { uid: "uid-ada", email: "ada@moth.example", email_verified: true };
const STAFF = { uid: "uid-sam", email: "sam@moth.example", email_verified: true };
const TEAM = { uid: "uid-team", email: "team@platform.example", email_verified: true };
const ADMIN = { ...TEAM, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const BACK = "https://platform.example/account/chitchats.html";
const ORDER = {
  id: "o1", orderNumber: "1001", currency: "CAD", fulfillmentStatus: "unfulfilled", fulfillmentMethod: "shipping",
  items: [{ productId: "b1", title: "Moth Songs", sku: "MS-1", quantity: 2, price: 24 }],
  totals: { subtotal: 48 }, shipTo: { name: "Bea Reader", line1: "1 Main St", city: "Toronto", region: "ON", postalCode: "M6G 1A1", country: "CA" },
};

/** Pretend Chit Chats: one account (client 12345, token tok-good-123), shipments by id. */
function chitChats() {
  const shipments = new Map();
  const calls = [];
  let n = 0;
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    calls.push({ method: init.method, path: pathname, body: init.body ? JSON.parse(init.body) : null });
    const reply = (status, body) => new Response(body ? JSON.stringify(body) : "", { status, headers: { "content-type": "application/json" } });
    if (!pathname.startsWith("/api/v1/clients/12345/")) return reply(404, { error: { message: "Not found" } });
    if (init.headers?.Authorization !== "tok-good-123") return reply(401, { error: { message: "Unauthorized" } });
    if (init.method === "GET" && pathname.endsWith("/shipments") && searchParams.get("limit") === "1") return reply(200, []);
    if (init.method === "POST" && pathname.endsWith("/shipments")) {
      const id = `R4Q286T8${(n += 1)}`;
      shipments.set(id, { id, status: "unpaid", carrier_tracking_code: null, ...JSON.parse(init.body) });
      return reply(201, { shipment: shipments.get(id) });
    }
    const one = /\/shipments\/([A-Z0-9]+)$/.exec(pathname);
    if (init.method === "GET" && one) return shipments.has(one[1]) ? reply(200, { shipment: shipments.get(one[1]) }) : reply(404, null);
    return reply(400, { error: { message: "Unexpected" } });
  };
  return { fetch, shipments, calls };
}

async function world() {
  const roles = { "ada@moth.example moth-press": "owner", "sam@moth.example moth-press": "staff" };
  const roleIn = async (person, shopId) => roles[`${person.email} ${shopId}`] ?? null;
  const stores = { apps: fakeAppStore(), ...fakeAppInstallStores() };
  const makers = createAppMakers({ store: stores.apps, admins: ["team@platform.example"] });
  const installs = createAppInstalls({ apps: stores.apps, makers, installs: stores.installs, codes: stores.codes, registry: fakeRegistry(), auditLog: fakeAuditLog(), roleIn });
  const appCalls = [];
  let appAnswer = { status: 202, body: { ok: true, request: { id: "req_1", status: "waiting" } } };
  const courier = chitChats();
  const saved = fakeChitChatsStores();
  let chitchats;
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}),
    routes: { ...appMakerRoutes(makers), ...appInstallRoutes(installs), ...chitChatsRoutes({ connect: (...a) => chitchats.connect(...a), status: (...a) => chitchats.status(...a), disconnect: (...a) => chitchats.disconnect(...a), setEmails: (...a) => chitchats.setEmails(...a) }) },
    publicRoutes: chitChatsPublicRoutes({ alert: (r) => chitchats.alert(r) }),
  });
  const ask = async (claims, method, path, body, headers = {}) => api({ method, path, body, rawBody: typeof body === "string" ? body : undefined, headers: { ...(claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {}), ...headers } });

  // The platform team registers Chit Chats like any maker, and approves it.
  const { app, secret } = (await ask(TEAM, "POST", "/api/apps/maker/create", {
    name: "Chit Chats", tagline: "Cheap Canadian postage for your orders", category: "orders-shipping", supportEmail: "apps@platform.example",
    returnAddresses: [BACK], scopes: ["read_orders", "write_orders"], alertsAddress: "https://platform.example/api/chitchats/alerts", alertTopics: ["orders/paid"],
  })).body;
  await ask(TEAM, "POST", "/api/apps/maker/submit", { appId: app.appId });
  await ask(ADMIN, "POST", "/api/control/apps/approve", { appId: app.appId });

  chitchats = createChitChatsApp({
    appId: app.appId, appSecret: secret, connections: saved.connections, shipments: saved.shipments, sealKey: randomBytes(32),
    exchange: (args) => installs.exchange(args), appCall: async (request) => { appCalls.push(request); return appAnswer; }, roleIn,
    fetch: courier.fetch, base: "https://staging.chitchats.example", returnAddress: BACK,
  });
  const codeFor = async () => {
    const { redirect } = (await ask(OWNER, "POST", "/api/apps/install/approve", { appId: app.appId, shopId: "moth-press", returnAddress: BACK })).body;
    return new URL(redirect).searchParams.get("code");
  };
  const sendAlert = (topic, data, { key = secret } = {}) => {
    const body = JSON.stringify({ id: `alert_${topic}`, topic, shopId: "moth-press", createdAt: "2026-11-04T12:00:00Z", data });
    const fingerprint = createHash("sha256").update(key, "utf8").digest("hex");
    return ask(null, "POST", "/api/chitchats/alerts", body, { "x-colophon-signature": alertSignature(fingerprint, body) });
  };
  return { ask, codeFor, sendAlert, courier, saved, appCalls, installs, setAnswer: (a) => { appAnswer = a; }, chitchats };
}

const DETAILS = { shopId: "moth-press", clientId: "12345", accessToken: "tok-good-123", parcel: { weightGrams: 400 } };

test("the owner connects with the install code; the details are checked and kept sealed", async () => {
  const w = await world();
  const wrong = await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor(), accessToken: "tok-wrong-999" });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /didn't accept/);
  assert.equal(w.saved.shops.size, 0, "nothing is kept when Chit Chats says no");

  assert.equal((await w.ask(STAFF, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() })).status, 403, "only the owner connects");

  const ok = await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.parcel, { ...USUAL_PARCEL, weightGrams: 400 });
  const row = w.saved.shops.get("moth-press");
  assert.ok(!JSON.stringify(row).includes("tok-good-123") && !JSON.stringify(row).includes("cak_"), "the token and the app's key are sealed");

  const status = await w.ask(OWNER, "POST", "/api/chitchats/status", { shopId: "moth-press" });
  assert.equal(status.body.connected, true);
  assert.equal(status.body.clientId, "12345");

  // Changing the parcel later needs no new code.
  const again = await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, parcel: { weightGrams: 900, lengthCm: 30 } });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.parcel.weightGrams, 900);
});

test("the owner turns the morning email about waiting orders off and on, and changing details keeps the choice", async () => {
  const w = await world();
  assert.equal((await w.ask(OWNER, "POST", "/api/chitchats/emails", { shopId: "moth-press", on: false })).status, 409, "connect first");
  await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() });
  assert.equal((await w.ask(OWNER, "POST", "/api/chitchats/status", { shopId: "moth-press" })).body.emails, true, "on by default");
  assert.equal((await w.ask(STAFF, "POST", "/api/chitchats/emails", { shopId: "moth-press", on: false })).status, 403, "only the owner");
  assert.equal((await w.ask(OWNER, "POST", "/api/chitchats/emails", { shopId: "moth-press", on: "no" })).status, 400);
  assert.equal((await w.ask(OWNER, "POST", "/api/chitchats/emails", { shopId: "moth-press", on: false })).body.emails, false);
  assert.equal(w.saved.shops.get("moth-press").emailsOff, true);
  await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, parcel: { weightGrams: 900 } });
  assert.equal((await w.ask(OWNER, "POST", "/api/chitchats/status", { shopId: "moth-press" })).body.emails, false, "kept through a change of details");
  await w.ask(OWNER, "POST", "/api/chitchats/emails", { shopId: "moth-press", on: true });
  assert.equal("emailsOff" in w.saved.shops.get("moth-press"), false);
});

test("a paid order becomes one Chit Chats shipment, and its tracking number marks the order sent", async () => {
  const w = await world();
  await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() });

  const first = await w.sendAlert("orders/paid", { order: ORDER });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal((await w.sendAlert("orders/paid", { order: ORDER })).body.skipped, "already in Chit Chats", "a repeated alert makes no second shipment");
  const made = [...w.courier.shipments.values()];
  assert.equal(made.length, 1);
  assert.equal(made[0].postage_type, "unknown", "no postage is bought for the press");
  assert.equal(made[0].order_id, "1001");
  assert.equal(made[0].weight, 400);
  assert.equal(made[0].country_code, "CA");
  assert.deepEqual(made[0].line_items.map((l) => [l.quantity, l.sku_code]), [[2, "MS-1"]]);

  // Nothing goes back until Chit Chats has a tracking number.
  assert.equal((await w.chitchats.sweep()).sent, 0);
  assert.equal(w.appCalls.length, 0);

  Object.assign(made[0], { status: "in_transit", carrier: "Canada Post", carrier_tracking_code: "7023210039414604", tracking_url: "https://chitchats.com/tracking/x" });
  const swept = await w.chitchats.sweep();
  assert.equal(swept.sent, 1);
  assert.equal(w.appCalls.length, 1);
  const [call] = w.appCalls;
  assert.equal(call.path, "/api/apps/v1/orders/o1/fulfillment");
  assert.match(call.headers.authorization, /^Bearer cak_/);
  assert.deepEqual(call.body, { trackingCarrier: "Canada Post", trackingNumber: "7023210039414604", trackingUrl: "https://chitchats.com/tracking/x", shipped: true });
  assert.equal((await w.chitchats.sweep()).checked, 0, "a sent order isn't looked at again");
});

test("alerts must be signed with the app's secret; other alerts and orders are left alone", async () => {
  const w = await world();
  await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() });
  assert.equal((await w.sendAlert("orders/paid", { order: ORDER }, { key: "not-the-secret" })).status, 401);
  assert.equal((await w.sendAlert("orders/paid", { order: { ...ORDER, id: "o2", fulfillmentMethod: "pickup" } })).body.skipped, "not shipped");
  assert.equal((await w.sendAlert("orders/paid", { order: { ...ORDER, id: "o3", shipTo: null } })).body.skipped, "no address");
  assert.equal((await w.sendAlert("products/changed", {})).body.ignored, "products/changed");
  assert.equal(w.courier.shipments.size, 0);
  assert.equal(w.saved.sent.get("moth-press~o3").status, "problem", "an order with no address is noted for the press");
});

test("removing the app forgets the press's Chit Chats details", async () => {
  const w = await world();
  await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() });
  assert.equal((await w.sendAlert("app/uninstalled", {})).body.removed, true);
  assert.equal(w.saved.shops.size, 0);
  assert.equal((await w.sendAlert("orders/paid", { order: ORDER })).body.ignored, "not connected");

  await w.ask(OWNER, "POST", "/api/chitchats/connect", { ...DETAILS, code: await w.codeFor() });
  await w.sendAlert("orders/paid", { order: ORDER });
  const [made] = [...w.courier.shipments.values()];
  Object.assign(made, { status: "in_transit", carrier_tracking_code: "TRK1" });
  w.setAnswer({ status: 401, body: { ok: false, message: "That key isn't valid." } });
  await w.chitchats.sweep();
  assert.equal(w.saved.shops.size, 0, "a key that no longer works means the app was removed");
});

test("the shipment and parcel are checked before anything reaches Chit Chats", () => {
  assert.throws(() => parcelOf({ weightGrams: 0 }), /grams/);
  assert.throws(() => parcelOf({ lengthCm: 500 }), /centimetres/);
  assert.deepEqual(parcelOf({}), USUAL_PARCEL);
  const usd = shipmentFor({ ...ORDER, currency: "USD", shipTo: { ...ORDER.shipTo, country: "us" } }, USUAL_PARCEL);
  assert.equal(usd.value_currency, "usd");
  assert.equal(usd.country_code, "US");
  assert.equal(usd.value, "48.00");
});
