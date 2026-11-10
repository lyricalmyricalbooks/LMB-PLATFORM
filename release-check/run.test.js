import { test } from "node:test";
import assert from "node:assert/strict";
import { scriptedFetch, token } from "../clients/fake-fetch.js";
import { shopWhere } from "./run.js";

const profile = { firebase: { projectId: "lmb-test-shop" }, functionsRegion: "northamerica-northeast1", siteUrl: "https://lmb-test-shop.web.app" };
const DOCS = "https://firestore.googleapis.com/v1/projects/lmb-test-shop/databases";

test("a shared test shop is read in its folder, opened at its own address, and its server is told the shop", async () => {
  const row = { shopId: "test-press", shared: true, projectId: "lmb-test-shop", freeAddress: "lmb-test-shop.web.app", testShop: true };
  const fetch = scriptedFetch([
    { method: "GET", url: `${DOCS}/(default)/documents/shops/test-press/orders/o1`, json: { name: "x", fields: { paymentStatus: { stringValue: "paid" } } } },
    { method: "GET", url: `${DOCS}/stockroom/documents/shops/test-press/websiteOrders/o1`, json: { name: "x", fields: { imported: { booleanValue: true } } } },
  ]);
  const where = shopWhere({ row, profile, fetch, token });
  assert.deepEqual(where.urls, { site: "https://lmb-test-shop.web.app", stockroom: "https://lmb-test-shop.web.app/stockroom" });
  assert.equal(where.functionUrl("refundOrder"), "https://northamerica-northeast1-lmb-test-shop.cloudfunctions.net/refundOrder?shop=test-press");
  assert.equal((await where.shopDb.get("orders/o1")).paymentStatus, "paid");
  assert.equal((await where.stockroomDb.get("websiteOrders/o1")).imported, true);
  fetch.done();
});

test("a test shop with a project of its own is read there, as before", () => {
  const row = { shopId: "lmb-test-shop", projectId: "lmb-test-shop", testShop: true };
  const where = shopWhere({ row, profile, fetch: scriptedFetch([]), token });
  assert.deepEqual(where.urls, { site: "https://lmb-test-shop.web.app", stockroom: "https://lmb-test-shop-stockroom.web.app" });
  assert.equal(where.functionUrl("refundOrder"), "https://northamerica-northeast1-lmb-test-shop.cloudfunctions.net/refundOrder");
});
