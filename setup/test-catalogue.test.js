// The two test shops' starter catalogues (test-catalogue.js): the book shop's is unchanged, the general shop's has no
// books, and each links its stocked items to the stockroom so the release check's purchase moves both counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEST_GOODS_IDS, TEST_PRINTED_IDS, stockedIds, testCatalogue, testShopDocs } from "./test-catalogue.js";
import { TEST_SHOPS, testShopKind } from "./testShopPlace.js";
import { itemFor } from "../release-check/checks.js";

test("each test shop's kind follows what it sells; no answer is the book shop", () => {
  assert.deepEqual(TEST_SHOPS.map((shop) => [shop.shopId, testShopKind(shop)]), [["test-press", "books"], ["test-goods", "general"], ["test-press-us", "books"], ["test-studio", "general"]]);
  assert.equal(testShopKind({}), "books");
  assert.equal(testShopKind({ publishes: "zines" }), "books");
  assert.equal(testShopKind({ publishes: "clothing" }), "general");
});

test("the book test shop keeps its catalogue and the release check still buys Test Book One", () => {
  const { shopDocs, links } = testCatalogue({ currency: "CAD", publishes: "books" });
  assert.deepEqual(shopDocs, testShopDocs());
  assert.deepEqual(links.map((l) => l.shopBookId), [...TEST_PRINTED_IDS]);
  assert.equal(itemFor({ publishes: "books" }), "test-book-one");
  assert.equal(itemFor({}), "test-book-one");
});

test("the general test shop has no books: goods with sizes, a download, low and sold-out stock, all linked to the stockroom", () => {
  const { shopDocs, stockroomBooks, links } = testCatalogue({ currency: "CAD", publishes: "other" });
  const products = shopDocs.filter((d) => d.path.startsWith("books/")).map((d) => d.data);
  assert.ok(products.every((p) => p.kind && p.kind !== "book" && !/book/i.test(p.format ?? "")), "no product is a book");
  assert.ok(products.every((p) => /^Test /.test(p.title)), "every name says Test");
  assert.ok(products.some((p) => p.variants?.length === 6), "a T-shirt in three sizes and two colours");
  assert.ok(products.some((p) => p.digital === true), "a download");
  assert.ok(products.some((p) => p.trackInventory && p.stockLevel === 1), "one nearly sold out");
  assert.ok(products.some((p) => p.trackInventory && p.stockLevel === 0), "one sold out");
  assert.deepEqual(stockroomBooks.map((b) => b.id), [...TEST_GOODS_IDS]);
  assert.deepEqual(links.map((l) => l.shopBookId), [...TEST_GOODS_IDS]);
  assert.deepEqual(stockedIds("general"), TEST_GOODS_IDS);
  assert.equal(itemFor({ publishes: "other" }), "test-tote-bag");
  assert.ok(shopDocs.some((d) => d.path === "shipping-profiles/test-canada"));
});

test("the services test shop gets the general catalogue plus services and opening hours the shop's own rules accept", async () => {
  const { testShopServices, testShopWords } = await import("./testShopPlace.js");
  const { testStudioDocs } = await import("./test-studio-data.js");
  const { createRequire } = await import("node:module");
  const { cleanService, cleanBookingSettings } = createRequire(import.meta.url)("../apps/shop/functions/shared/bookingTimes.js");
  const studio = TEST_SHOPS.find((shop) => shop.shopId === "test-studio");
  assert.equal(testShopServices(studio), true);
  assert.equal(testShopWords(studio), "Services test shop");
  assert.deepEqual(TEST_SHOPS.filter((shop) => testShopServices(shop)).map((shop) => shop.shopId), ["test-studio"]);
  const paths = testCatalogue({ ...studio, currency: "CAD" }).shopDocs.map((doc) => doc.path);
  for (const { path, data } of testStudioDocs()) {
    assert.ok(paths.includes(path), `${path} is written with the catalogue`);
    if (path.startsWith("bookingServices/")) assert.deepEqual(cleanService(data, data.id), data, `${path} is a service as the shop keeps one`);
    else assert.deepEqual(cleanBookingSettings(data), data);
  }
  assert.ok(paths.includes("books/test-tote-bag"), "the release check can still buy from it");
  assert.equal(testCatalogue({ ...TEST_SHOPS[1], currency: "CAD" }).shopDocs.some((doc) => doc.path.startsWith("booking")), false, "no other test shop gets bookings");
});
