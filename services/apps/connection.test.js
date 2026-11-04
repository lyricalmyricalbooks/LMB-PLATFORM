// The app connection (code plan 26.3): an installed app reads its one shop with its key, only what its permissions allow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { PER_MINUTE, createAppConnection } from "./connection.js";

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
  assert.equal((await call("/api/apps/v1/shop", { method: "POST" })).status, 405);
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
