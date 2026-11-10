import { test } from "node:test";
import assert from "node:assert/strict";
import { realtimeRecords, sharedStores } from "./shared.js";
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
