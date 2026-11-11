// The app connection (code plan 26.3): an installed app reads its one shop with its key, only what its permissions allow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { PER_MINUTE, createAppConnection, order } from "./connection.js";

const BOOKS = {
  b1: { title: "Moth Songs", retailPrice: 24, costPrice: 9, stockLevel: 7, sku: "MS-1", photos: [{ url: "https://img.example/1.jpg" }], status: "published" },
  b2: { title: "Tote", kind: "merch", retailPrice: 18, stockLevel: 3, variants: [{ id: "v1", sku: "T-S", price: 18, stockLevel: 1 }, { id: "v2", sku: "T-L", price: 18, stockLevel: 2 }] },
};
const ORDERS = {
  o1: { orderId: "1001", createdAt: "2026-11-01T10:00:00Z", paymentStatus: "paid", status: "processing", currency: "CAD", total: 30, items: [{ bookId: "b1", title: "Moth Songs", quantity: 1, price: 24 }], customer: { name: "Bea Reader", email: "bea@example.com", phone: "555", address: { line1: "1 Main St", city: "Toronto", state: "ON", postalCode: "M6G 1A1", country: "CA" } }, operations: { hold: "secret note" }, stripeSessionId: "cs_test_x" },
  o2: { orderId: "1002", createdAt: "2026-11-03T10:00:00Z", paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "TRK", trackingCarrier: "Canada Post", items: [], customer: { name: "Cal" } },
  o3: { orderId: "1003", createdAt: "2026-11-04T10:00:00Z", paymentStatus: "paid", isTest: true, items: [] },
  o4: { orderId: "1004", createdAt: "2026-11-04T11:00:00Z", paymentStatus: "pending", items: [] },
};

function world(granted) {
  let clock = Date.parse("2026-11-04T12:00:00Z");
  const data = { "moth-press": { books: BOOKS, orders: ORDERS, settings: { website: { currency: "CAD" } } }, "other-press": { books: { x: { title: "Not yours" } }, orders: {} } };
  const shopData = {
    get: async (shopId, path) => { const [c, id] = path.split("/"); return structuredClone(data[shopId]?.[c]?.[id] ?? null); },
    list: async (shopId, c) => Object.entries(data[shopId]?.[c] ?? {}).map(([id, d]) => ({ id, data: structuredClone(d) })),
  };
  const registry = fakeRegistry();
  registry.shops.set("moth-press", { shopId: "moth-press", pressName: "Moth Press", domain: "mothpress.example" });
  const installs = {
    authenticate: async (key) => (key === "cak_good" ? { installId: "moth-press~app_1", shopId: "moth-press", appId: "app_1", granted } : null),
  };
  const handle = createAppConnection({ installs, shopData, registry, now: () => new Date(clock) });
  const call = (path, { key = "cak_good", method = "GET", header = "authorization" } = {}) =>
    handle({ method, path, headers: header === "authorization" ? { authorization: `Bearer ${key}` } : { "x-colophon-access-key": key } });
  return { call, tick: (s) => { clock += s * 1000; } };
}

test("a key reads its shop; a wrong or missing key reads nothing", async () => {
  const { call } = world(["read_shop"]);
  const res = await call("/api/apps/v1/shop");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.shop, { id: "moth-press", name: "Moth Press", webAddress: "https://mothpress.example", currency: "CAD" });
  assert.equal((await call("/api/apps/v1/shop", { header: "x" })).status, 200, "the key also works in its own header");
  assert.equal((await call("/api/apps/v1/shop", { key: "cak_bad" })).status, 401);
  assert.equal((await call("/api/apps/v1/shop", { key: "" })).status, 401);
  assert.equal((await call("/api/apps/v1/shop", { method: "DELETE" })).status, 405);
  assert.equal((await call("/api/apps/v1/nothing")).status, 404);
});

test("each call needs its permission", async () => {
  const { call } = world(["read_shop"]);
  for (const path of ["/api/apps/v1/products", "/api/apps/v1/inventory", "/api/apps/v1/orders", "/api/apps/v1/orders/o1"]) {
    const res = await call(path);
    assert.equal(res.status, 403, path);
    assert.match(res.body.message, /permission/);
  }
});

test("products never show cost prices; stock only with the stock permission", async () => {
  let { call } = world(["read_products"]);
  let res = await call("/api/apps/v1/products");
  assert.deepEqual(res.body.products.map((p) => p.id), ["b1", "b2"]);
  assert.equal(res.body.products[0].price, 24);
  assert.deepEqual(res.body.products[0].photos, ["https://img.example/1.jpg"]);
  assert.ok(!JSON.stringify(res.body).includes("costPrice") && !("stock" in res.body.products[0]));
  assert.equal((await call("/api/apps/v1/products/b9")).status, 404);
  assert.equal((await call("/api/apps/v1/products/..%2Fsettings")).status, 404, "an id can't climb out of the products");

  ({ call } = world(["read_products", "read_inventory"]));
  res = await call("/api/apps/v1/products/b2");
  assert.equal(res.body.product.stock, 3);
  assert.deepEqual(res.body.product.variants.map((v) => v.stock), [1, 2]);
  const stock = await call("/api/apps/v1/inventory");
  assert.deepEqual(stock.body.inventory[1], { productId: "b2", sku: null, available: 3, variants: [{ id: "v1", sku: "T-S", available: 1 }, { id: "v2", sku: "T-L", available: 2 }] });
});

test("orders: paid ones only, newest first, where they ship; email and phone only with the customers permission", async () => {
  let { call } = world(["read_orders"]);
  let res = await call("/api/apps/v1/orders");
  assert.deepEqual(res.body.orders.map((o) => o.id), ["o2", "o1"], "no test or unpaid orders");
  const first = res.body.orders[1];
  assert.equal(first.shipTo.city, "Toronto");
  assert.equal(first.shipTo.name, "Bea Reader");
  assert.equal(first.customer, undefined);
  const text = JSON.stringify(res.body);
  for (const hidden of ["bea@example.com", "secret note", "cs_test_x"]) assert.ok(!text.includes(hidden), `${hidden} stays private`);
  assert.deepEqual(res.body.orders[0].tracking, { carrier: "Canada Post", number: "TRK", url: null });
  assert.deepEqual((await call("/api/apps/v1/orders?status=unfulfilled")).body.orders.map((o) => o.id), ["o1"]);
  assert.deepEqual((await call("/api/apps/v1/orders?since=2026-11-02")).body.orders.map((o) => o.id), ["o2"]);
  assert.equal((await call("/api/apps/v1/orders/o3")).status, 404, "a test order is invisible");
  assert.equal((await call("/api/apps/v1/orders/o4")).status, 404, "an unpaid order is invisible");

  ({ call } = world(["read_orders", "read_customers"]));
  res = await call("/api/apps/v1/orders/o1");
  assert.deepEqual(res.body.order.customer, { name: "Bea Reader", email: "bea@example.com", phone: "555" });
});

test("pages follow the cursor", async () => {
  const { call } = world(["read_products"]);
  const one = await call("/api/apps/v1/products?limit=1");
  assert.deepEqual(one.body.products.map((p) => p.id), ["b1"]);
  assert.equal(one.body.next, "b1");
  const two = await call(`/api/apps/v1/products?limit=1&after=${one.body.next}`);
  assert.deepEqual(two.body.products.map((p) => p.id), ["b2"]);
  assert.equal(two.body.next, null);
});

test(`an app gets at most ${PER_MINUTE} calls a minute for a shop`, async () => {
  const { call, tick } = world(["read_shop"]);
  for (let i = 0; i < PER_MINUTE; i += 1) assert.equal((await call("/api/apps/v1/shop")).status, 200);
  const over = await call("/api/apps/v1/shop");
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers["Retry-After"]) > 0);
  tick(60);
  assert.equal((await call("/api/apps/v1/shop")).status, 200, "a new minute, a new allowance");
});

// Changes (26.3b): the platform only writes a request into the shop; the shop's own checks answer it.
function changeWorld(granted, { shopAnswers = true } = {}) {
  const docs = new Map([["moth-press/orders/o1", ORDERS.o1]]);
  const shopData = {
    get: async (shopId, path) => structuredClone(docs.get(`${shopId}/${path}`) ?? null),
    create: async (shopId, path, data) => {
      if (docs.has(`${shopId}/${path}`)) throw new Error(`${path} already exists`);
      docs.set(`${shopId}/${path}`, structuredClone(data));
    },
  };
  let ids = 0;
  const installs = { authenticate: async (key) => ({ cak_a: { installId: "moth-press~app_1", shopId: "moth-press", appId: "app_1", appName: "Parcel Pal", granted }, cak_b: { installId: "moth-press~app_2", shopId: "moth-press", appId: "app_2", granted } })[key] ?? null };
  // Stands in for the shop's trigger: answers a waiting request after the first look.
  const sleep = async () => {
    if (!shopAnswers) return;
    for (const [path, data] of docs) if (path.includes("/appRequests/") && !data.status) docs.set(path, { ...data, status: "done", result: "dispatched", reason: "Marked sent." });
  };
  const handle = createAppConnection({ installs, shopData, registry: fakeRegistry(), sleep, waitMs: 1000, newRequestId: () => `req_${++ids}` });
  const post = (path, body, { key = "cak_a", headers = {} } = {}) => handle({ method: "POST", path, body, headers: { authorization: `Bearer ${key}`, ...headers } });
  const get = (path, key = "cak_a") => handle({ method: "GET", path, headers: { authorization: `Bearer ${key}` } });
  return { docs, post, get };
}

test("an app asks to mark an order sent; the shop's answer comes back", async () => {
  const w = changeWorld(["write_orders"]);
  const res = await w.post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "Canada Post", trackingNumber: "1234" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.request, { id: "req_1", op: "order.dispatch", status: "done", result: "dispatched", reason: "Marked sent.", createdAt: res.body.request.createdAt, answeredAt: null });
  const written = w.docs.get("moth-press/appRequests/req_1");
  assert.deepEqual(written.input, { orderId: "o1", trackingCarrier: "Canada Post", trackingNumber: "1234", trackingUrl: "", shipped: true });
  assert.equal(written.appName, "Parcel Pal");
  assert.equal((await w.get("/api/apps/v1/requests/req_1")).body.request.status, "done");
  assert.equal((await w.get("/api/apps/v1/requests/req_1", "cak_b")).status, 404, "another app can't read it");
});

test("no answer yet: 202 with the request to look up later", async () => {
  const w = changeWorld(["write_orders"], { shopAnswers: false });
  const res = await w.post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "UPS", trackingNumber: "1Z" });
  assert.equal(res.status, 202);
  assert.equal(res.body.request.status, "waiting");
});

test("a retried call with the same Idempotency-Key makes one request", async () => {
  const w = changeWorld(["write_orders"], { shopAnswers: false });
  const body = { trackingCarrier: "UPS", trackingNumber: "1Z", shipped: false };
  const headers = { "Idempotency-Key": "ship-o1" };
  const first = await w.post("/api/apps/v1/orders/o1/fulfillment", body, { headers });
  const second = await w.post("/api/apps/v1/orders/o1/fulfillment", body, { headers });
  assert.equal(first.body.request.id, second.body.request.id);
  assert.equal([...w.docs.keys()].filter((k) => k.includes("appRequests")).length, 1);
});

test("a reused Idempotency-Key for a different order is refused, not answered with the first order's result", async () => {
  const w = changeWorld(["write_orders"], { shopAnswers: false });
  const headers = { "Idempotency-Key": "batch-1" };
  assert.equal((await w.post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "UPS", trackingNumber: "1Z" }, { headers })).status, 202);
  const other = await w.post("/api/apps/v1/orders/o2/fulfillment", { trackingCarrier: "UPS", trackingNumber: "1Z" }, { headers });
  assert.equal(other.status, 409);
  assert.match(other.body.message ?? other.body.error ?? JSON.stringify(other.body), /already used for a different request/);
});

test("an app sees how many copies are still to send after some went ahead or were refunded", () => {
  const view = order("o1", {
    paymentStatus: "paid", items: [{ id: "b1", title: "A", quantity: 3 }, { id: "b2", title: "B", quantity: 1 }],
    partShipments: [{ lines: [{ line: 0, quantity: 1 }] }], partialRestockedItems: [{ index: 0, quantity: 1 }],
  }, []);
  assert.deepEqual(view.items.map((i) => [i.quantity, i.quantityToSend]), [[3, 1], [1, 1]]);
});

test("changes need write_orders and good input", async () => {
  assert.equal((await changeWorld(["read_orders"]).post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "UPS", trackingNumber: "1" })).status, 403);
  const w = changeWorld(["write_orders"]);
  assert.equal((await w.post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "UPS" })).status, 400);
  assert.equal((await w.post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "UPS", trackingNumber: "1", trackingUrl: "http://x.example" })).status, 400);
  assert.equal((await w.post("/api/apps/v1/orders/o1/refund", {})).status, 404);
  assert.equal((await w.post("/api/apps/v1/orders/o1/fulfillment", { trackingCarrier: "UPS", trackingNumber: "1" }, { key: "cak_bad" })).status, 401);
  assert.equal([...w.docs.keys()].filter((k) => k.includes("appRequests")).length, 0);
});

test("an app adds or takes copies, with write_inventory only", async () => {
  const w = changeWorld(["write_inventory"]);
  const res = await w.post("/api/apps/v1/inventory/b1", { change: -1, expected: 7, variantId: "" });
  assert.equal(res.status, 200);
  assert.deepEqual(w.docs.get("moth-press/appRequests/req_1").input, { productId: "b1", variantId: "", change: -1, expected: 7 });
  assert.equal(w.docs.get("moth-press/appRequests/req_1").op, "inventory.adjust");
  assert.equal((await w.post("/api/apps/v1/inventory/b1", { change: 0 })).status, 400);
  assert.equal((await w.post("/api/apps/v1/inventory/b1", { change: 2.5 })).status, 400);
  assert.equal((await w.post("/api/apps/v1/inventory/b1", { change: 1, expected: -1 })).status, 400);
  assert.equal((await changeWorld(["read_inventory"]).post("/api/apps/v1/inventory/b1", { change: 1 })).status, 403);
});

test("an app catches up on its own alerts, oldest first", async () => {
  const rows = [
    { id: "a2", installId: "moth-press~app_1", topic: "orders/shipped", createdAt: "2026-11-04T11:00:00Z", data: { order: { id: "o2" } }, status: "failed" },
    { id: "a1", installId: "moth-press~app_1", topic: "orders/paid", createdAt: "2026-11-04T10:00:00Z", data: { order: { id: "o1" } }, status: "sent" },
    { id: "a3", installId: "moth-press~app_1", topic: "orders/paid", createdAt: "2026-11-04T11:30:00Z", data: {}, status: "dropped" },
    { id: "b1", installId: "moth-press~app_2", topic: "orders/paid", createdAt: "2026-11-04T10:00:00Z", data: {}, status: "sent" },
  ];
  const outbox = { listByInstall: async (installId) => rows.filter((r) => r.installId === installId) };
  const installs = { authenticate: async () => ({ installId: "moth-press~app_1", shopId: "moth-press", appId: "app_1", granted: [] }) };
  const handle = createAppConnection({ installs, shopData: {}, registry: fakeRegistry(), outbox });
  const res = await handle({ method: "GET", path: "/api/apps/v1/alerts", headers: { authorization: "Bearer cak_a" } });
  assert.deepEqual(res.body.alerts.map((a) => [a.id, a.delivered]), [["a1", true], ["a2", false]]);
  const later = await handle({ method: "GET", path: "/api/apps/v1/alerts", query: { since: "2026-11-04T10:30:00Z" }, headers: { authorization: "Bearer cak_a" } });
  assert.deepEqual(later.body.alerts.map((a) => a.id), ["a2"]);
});

test("newsletter readers: only confirmed and not unsubscribed, with the customers permission; opt-outs as fingerprints", async () => {
  const { createHash } = await import("node:crypto");
  const fp = (email) => createHash("sha256").update(email).digest("hex");
  const data = {
    newsletter: {
      "bea@example.com": { email: "bea@example.com", status: "confirmed", subscribedAt: "2026-11-02T10:00:00Z", source: "website" },
      "old@example.com": { email: "old@example.com", subscribedAt: "2026-10-01T10:00:00Z" },
      "new@example.com": { email: "new@example.com", status: "pending", subscribedAt: "2026-11-03T10:00:00Z" },
      "gone@example.com": { email: "gone@example.com", status: "confirmed", subscribedAt: "2026-11-01T10:00:00Z" },
    },
    "marketing-optout": { [fp("gone@example.com")]: { at: "2026-11-03T12:00:00Z", source: "email-link" } },
  };
  const shopData = {
    list: async (_shop, c) => Object.entries(data[c] ?? {}).map(([id, d]) => ({ id, data: structuredClone(d) })),
    find: async (_shop, c, { where: [[field, , value]] }) => Object.entries(data[c] ?? {}).filter(([, d]) => String(d[field] ?? "") >= value).map(([id, d]) => ({ id, data: structuredClone(d) })),
  };
  const make = (granted) => createAppConnection({ installs: { authenticate: async () => ({ installId: "moth-press~app_1", shopId: "moth-press", appId: "app_1", granted }) }, shopData, registry: fakeRegistry() });
  const get = (granted, path) => make(granted)({ method: "GET", path, headers: { authorization: "Bearer cak_x" } });

  assert.equal((await get(["read_orders"], "/api/apps/v1/subscribers")).status, 403);
  const all = await get(["read_customers"], "/api/apps/v1/subscribers");
  assert.deepEqual(all.body.subscribers.map((s) => s.email), ["old@example.com", "bea@example.com"], "oldest first; pending and unsubscribed left out");
  const since = await get(["read_customers"], "/api/apps/v1/subscribers?since=2026-11-01T00:00:00Z");
  assert.deepEqual(since.body.subscribers.map((s) => s.email), ["bea@example.com"]);
  const out = await get(["read_customers"], "/api/apps/v1/unsubscribes?since=2026-11-03T00:00:00Z");
  assert.deepEqual(out.body.unsubscribes, [{ id: fp("gone@example.com"), at: "2026-11-03T12:00:00Z" }]);
});
