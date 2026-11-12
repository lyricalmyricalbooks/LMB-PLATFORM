import { test } from "node:test";
import assert from "node:assert/strict";
import { realtimeRecords, sharedStores, shopPlaces, shopStores } from "./shared.js";
import { FIRESTORE } from "./firestore.js";

// Records every call and answers each with an empty document (Firestore) or a bare null (the Realtime Database).
function recorder() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined });
    return new Response(String(url).endsWith(".json") ? "null" : JSON.stringify({ name: "x", fields: {} }), { status: 200 });
  };
  return { fetch, calls };
}
const token = async () => "t";
const DOCS = (database) => `${FIRESTORE}/projects/lmb-test-shop/databases/${database}/documents`;

test("each store reaches only its own place in the shared project", async () => {
  const { fetch, calls } = recorder();
  const shared = sharedStores({ fetch, token, projectId: "lmb-test-shop", databaseUrl: "https://lmb-test-shop-default-rtdb.firebaseio.com" });
  await shared.records.get("press-a");
  await shared.stockroomRecords.get("press-a");
  await shared.shopDb("press-a").get("settings/website");
  await shared.stockroomDb("press-a").get("books/b1");
  await shared.addresses.get("press-a.shops.example");
  assert.deepEqual(calls.map((c) => c.url.split("?")[0]), [
    `${DOCS("(default)")}/shops/press-a`,
    `${DOCS("stockroom")}/shops/press-a`,
    `${DOCS("(default)")}/shops/press-a/settings/website`,
    `${DOCS("stockroom")}/shops/press-a/books/b1`,
    `${DOCS("(default)")}/addresses/press-a.shops.example`,
  ]);
});

test("the live copy of the record is the shop's own record in the Realtime Database, and nothing there reads as none", async () => {
  const { fetch, calls } = recorder();
  const live = realtimeRecords({ fetch, token, databaseUrl: "https://lmb-test-shop-default-rtdb.firebaseio.com/" });
  assert.equal(await live.get("press-a"), null);
  await live.set("press-a", { tenant: "press-a-abc123", ownerEmail: "owner@example.com" });
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ["GET", "https://lmb-test-shop-default-rtdb.firebaseio.com/shops/press-a/record.json"],
    ["PUT", "https://lmb-test-shop-default-rtdb.firebaseio.com/shops/press-a/record.json"],
  ]);
  assert.deepEqual(calls[1].body, { tenant: "press-a-abc123", ownerEmail: "owner@example.com" });
  assert.throws(() => realtimeRecords({ fetch, token, databaseUrl: "http://plain.example" }), /https address/);
});

test("a shop id or web address that isn't one never becomes a path", async () => {
  const { fetch, calls } = recorder();
  const shared = sharedStores({ fetch, token, projectId: "lmb-test-shop" });
  assert.equal(shared.liveRecords, undefined, "no Realtime Database address, no live copy");
  for (const id of ["", "Press", "a/b", "../x", "-a", "a".repeat(64)]) {
    assert.throws(() => shared.records.get(id), /isn't a shop id/);
    assert.throws(() => shared.shopDb(id), /isn't a shop id/);
  }
  for (const host of ["", "localhost", "a/b.example", "A.example", "x..example", "-a.example"]) {
    assert.throws(() => shared.addresses.get(host), /isn't a web address/);
  }
  assert.deepEqual(calls, []);
});

test("one setting points every platform reader and writer at the shops' folders in the shared project", async () => {
  const { fetch, calls } = recorder();
  const own = shopStores({ env: {}, fetch, token });
  assert.equal(own.shared, null);
  await own.shopDb("press-a").get("platform/plan");
  await own.stockroomDb("press-a").get("platform/plan");
  const shared = shopStores({ env: { SHARED_SHOPS_PROJECT: "lmb-test-shop" }, fetch, token });
  assert.ok(shared.shared.liveRecords);
  await shared.shopDb("press-a").get("platform/plan");
  await shared.stockroomDb("press-a").get("platform/plan");
  assert.deepEqual(calls.map((c) => c.url.split("?")[0]), [
    `${FIRESTORE}/projects/press-a/databases/(default)/documents/platform/plan`,
    `${FIRESTORE}/projects/press-a/databases/stockroom/documents/platform/plan`,
    `${DOCS("(default)")}/shops/press-a/platform/plan`,
    `${DOCS("stockroom")}/shops/press-a/platform/plan`,
  ]);
});

test("a shop its registry row places in a shared project is reached there, whatever the setting says", async () => {
  // The test shops are folders in the shared test project; the hosted server's setting names the live one, or nothing.
  const rows = {
    "test-press": { shopId: "test-press", shared: true, projectId: "lmb-test-shop" },
    "press-a": { shopId: "press-a", shared: true, projectId: "press-two" },
    "moth-press": { shopId: "moth-press", projectId: "moth-press" },
  };
  let reads = 0;
  const rowOf = async (shopId) => { reads += 1; return rows[shopId] ?? null; };
  const docs = (project, database = "(default)") => `${FIRESTORE}/projects/${project}/databases/${database}/documents`;
  for (const env of [{}, { SHARED_SHOPS_PROJECT: "press-two" }]) {
    const { fetch, calls } = recorder();
    const stores = shopStores({ env, fetch, token, rowOf });
    await stores.shopDb("test-press").get("systemStatus/backup");
    await stores.stockroomDb("test-press").get("settings/catalog");
    await stores.shopDb("test-press").query("clientErrors");
    assert.deepEqual(calls.slice(0, 2).map((c) => c.url.split("?")[0]), [
      `${docs("lmb-test-shop")}/shops/test-press/systemStatus/backup`,
      `${docs("lmb-test-shop", "stockroom")}/shops/test-press/settings/catalog`,
    ]);
    assert.ok(calls.every((c) => c.url.includes("/projects/lmb-test-shop/")), "never a project named after the shop");
  }
  // A shop with no row, or a project of its own, follows the setting as before.
  const { fetch, calls } = recorder();
  const stores = shopStores({ env: {}, fetch, token, rowOf });
  await stores.shopDb("moth-press").get("platform/plan");
  await stores.shopDb("unknown-shop").get("platform/plan");
  assert.deepEqual(calls.map((c) => c.url.split("?")[0]), [`${docs("moth-press")}/platform/plan`, `${docs("unknown-shop")}/platform/plan`]);
  // A shop's place is looked up once; a shop with no row yet is asked about again.
  reads = 0;
  await stores.shopDb("moth-press").get("platform/plan");
  await stores.shopDb("unknown-shop").get("platform/plan");
  assert.equal(reads, 1);
});

test("a shop answers at its own addresses on the front door, and through the shared server with ?shop=", () => {
  const region = "northamerica-northeast1";
  const shared = shopPlaces({ shopId: "press-a", projectId: "lmb-test-shop", shared: true, freeAddress: "press-a.shops.example", region });
  assert.equal(shared.site, "https://press-a.shops.example");
  assert.equal(shared.stockroom, "https://press-a.shops.example/stockroom");
  assert.equal(shared.fn("stripeWebhook"), `https://${region}-lmb-test-shop.cloudfunctions.net/stripeWebhook?shop=press-a`);
  // Its own domain, once main, is its site.
  const domain = shopPlaces({ shopId: "press-a", projectId: "lmb-test-shop", shared: true, freeAddress: "press-a.shops.example", region, mainDomain: "books.example", domains: [{ name: "books.example" }] });
  assert.equal(domain.site, "https://books.example");
  const own = shopPlaces({ shopId: "press-two", projectId: "press-two", region });
  assert.deepEqual([own.site, own.stockroom, own.fn("stripeWebhook")], ["https://press-two.web.app", "https://press-two-stockroom.web.app", `https://${region}-press-two.cloudfunctions.net/stripeWebhook`]);
  assert.equal(shopPlaces({ shopId: "press-two", projectId: "press-two" }).fn, null, "no region, no function address");
  assert.throws(() => shopPlaces({ shopId: "../x" }), /isn't a shop id/);
});
