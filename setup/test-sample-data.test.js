// The test shops' sample records (test-sample-data.js), read back with the stockroom's own rules
// (apps/stockroom/src/lib): what the admin's Stock, Stockists, Invoices and author pages would show.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_CODE, SAMPLE_STOCKIST, stockroomParts, testShopDetails, testSampleDocs, testSampleStockroom, writeTestSamples } from "./test-sample-data.js";
import { stockedIds, testStockroomBooks } from "./test-catalogue.js";
import { assembleParts, stitchState } from "../apps/stockroom/src/lib/merge-state.js";
import { reconcileConsignmentChannel, reconcileConsignmentMirrors, reconcileStores } from "../apps/stockroom/src/lib/consignment.js";
import { deduplicateDirectConsignmentSales, deriveOnHand, inventoryBreakdown, recalculateBookStatsFromHistory } from "../apps/stockroom/src/lib/inventory.js";
import { planArtistSettlement } from "../apps/stockroom/src/lib/artist-settlement.js";

const NOW = new Date("2026-11-12T12:00:00Z");
const KINDS = ["books", "general"];

// The steps the stockroom runs on every load (main.js recomputeAfters; the admin's stockroom/stock.ts settle).
function settle(book, saved) {
  const s = structuredClone({ stock: book.maxPrint, authorStock: 0, sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [], artistTransfers: [], invoices: [], ...saved });
  deduplicateDirectConsignmentSales(s);
  reconcileConsignmentMirrors(s);
  recalculateBookStatsFromHistory(s);
  s.stock = deriveOnHand(s, book);
  reconcileConsignmentChannel(s);
  reconcileStores(s);
  return s;
}

/** A shop's catalogue item, as setup step 12 adds it, with the sample's catalogue fields. */
const bookOf = (kind, id) => {
  const shop = { currency: "CAD", publishes: kind === "books" ? "books" : "other" };
  const book = testStockroomBooks(shop).find((b) => b.id === id);
  return { ...book, ...testSampleStockroom(kind, NOW).catalog[id] };
};

for (const kind of KINDS) {
  test(`${kind}: the stockroom reads the sample records as written, and the release check's item is left alone`, () => {
    const [first, second, third] = stockedIds(kind);
    const { states, catalog } = testSampleStockroom(kind, NOW);
    assert.deepEqual(Object.keys(states).sort(), [second, third].sort());
    assert.equal(catalog[first], undefined);

    // Stored as parts and read back the way the admin reads them: nothing lost.
    const parts = Object.fromEntries(Object.entries(stockroomParts(states[second], 1)).map(([name, doc]) => [name, doc.data]));
    const back = stitchState(assembleParts(parts).parts);
    assert.deepEqual(back.ledger, states[second].ledger);
    assert.equal(back.invoiceSeq, 1);

    // Second item: 2 sold at the fair, 2 sent to the stockist and 1 of them sold. One left on the shelf.
    const two = settle(bookOf(kind, second), back);
    assert.equal(two.stock, 1);
    assert.equal(two.sold, 3);
    assert.equal(two.hist.filter((h) => h.consignmentLink).length, 1, "the stockist's sale has one mirror, not two");
    assert.deepEqual(two.stores.map((s) => [s.name, s.sent, s.sold, s.outstanding]), [[SAMPLE_STOCKIST, 2, 1, 1]]);
    const counted = inventoryBreakdown(two, bookOf(kind, second));
    assert.equal(counted.unaccounted, 0, "every printed copy is accounted for");
    assert.equal(two.invoices[0].status, "sent");
    assert.ok(two.invoices[0].dueDate > NOW.toISOString().slice(0, 10), "the sample invoice is not overdue yet");
    assert.equal(two.stores[0].email, undefined, "no reminder can be emailed to the sample stockist");

    // Third item: one sold, one review copy given away. Three left.
    const three = settle(bookOf(kind, third), states[third]);
    assert.deepEqual([three.stock, three.sold], [3, 1]);
  });
}

test("author royalties are a book-shop feature: the book shop's items carry them, the general shop's don't", () => {
  const [, second] = stockedIds("books");
  const book = bookOf("books", second);
  const plan = planArtistSettlement(book, settle(book, testSampleStockroom("books", NOW).states[second]));
  assert.ok(plan, "the author page has something to show");
  assert.ok(plan.balance.amount > 0);
  assert.deepEqual(Object.values(testSampleStockroom("general", NOW).catalog), [{}, {}]);
});

test("the shop's sample records: history-only past orders in the shop's own products, a code and reviews, all made up", () => {
  for (const kind of KINDS) {
    const docs = testSampleDocs(kind, NOW);
    const orders = docs.filter((d) => d.path.startsWith("orders/"));
    assert.equal(orders.length, 8);
    const products = new Set([...stockedIds(kind), ...(kind === "books" ? ["test-e-book", "test-t-shirt"] : ["test-pattern-download", "test-goods-t-shirt"])]);
    for (const { data } of orders) {
      assert.equal(data.source, "import", "history only: no hook moves stock or sends email");
      assert.equal(data.paymentStatus, "paid");
      assert.match(data.customer.email, /@example\.com$/);
      assert.ok(data.items.every((item) => products.has(item.id)));
      assert.ok(Date.parse(data.createdAt) < NOW.getTime());
      assert.equal(data.total, Math.round((data.subtotal + data.shipping + data.tax) * 100) / 100);
    }
    assert.ok(docs.some((d) => d.path === `discounts/${SAMPLE_CODE}` && d.data.isActive));
    assert.equal(docs.filter((d) => d.path.startsWith("reviews/")).length, 2);
  }
});

/** A store as the shop's and stockroom's clients answer: get(shopId, path) / set(shopId, path, data). */
function store(seed = {}) {
  const docs = new Map(Object.entries(seed));
  return { docs, get: async (_shop, path) => structuredClone(docs.get(path) ?? null), set: async (_shop, path, data) => void docs.set(path, structuredClone(data)) };
}

test("writing: only what is missing, unless asked to replace; without a stockroom the shop's part is still written", async () => {
  const shop = { currency: "CAD", publishes: "books" };
  const catalog = Object.fromEntries(testStockroomBooks(shop).map((b) => [b.id, b]));
  const shopDb = store({ "orders/PAST-test-01": { kept: true } });
  const stockroom = store({ "settings/catalog": { data: JSON.stringify(catalog) } });

  const first = await writeTestSamples({ shop: shopDb, stockroom }, "test-press", "books", { now: NOW });
  assert.deepEqual(shopDb.docs.get("orders/PAST-test-01"), { kept: true }, "a record changed while trying the shop stays");
  assert.ok(first.includes("books/test-book-two/data/hist"));
  assert.ok(first.includes("settings/invoiceSettings"));
  assert.equal(stockroom.docs.get("books/test-book-one/data/hist"), undefined);
  assert.deepEqual(await writeTestSamples({ shop: shopDb, stockroom }, "test-press", "books", { now: NOW }), [], "a second run adds nothing");

  shopDb.docs.set("settings/website", { info: { name: "My own name", email: "me@example.net" }, design: { copy: { siteName: "My own name" } }, policies: { shipping: "Mine", returns: "Mine", privacy: "Mine", terms: "Mine", accessibility: "Mine" } });
  const again = await writeTestSamples({ shop: shopDb, stockroom }, "test-press", "books", { now: NOW, replace: true });
  assert.equal(shopDb.docs.get("settings/website").info.name, "My own name", "a reset leaves the shop's own settings alone");
  assert.ok(!again.includes("settings/website"));
  assert.equal(shopDb.docs.get("orders/PAST-test-01").source, "import");
  assert.ok(again.includes("books/test-book-two/data/hist"));

  const alone = store();
  const written = await writeTestSamples({ shop: alone, stockroom: null }, "test-goods", "general", { now: NOW });
  assert.equal(written.length, 12);
  assert.ok(written.includes("settings/website"), "the shop's contact address and policies are filled in");
});

test("the test shop's public details: a made-up contact address and policies, no placeholder Instagram, and the owner's own words stay", async () => {
  const seed = { design: { social: { instagram: "https://www.instagram.com/yourpress", facebook: "" } }, info: { email: "owner@example.com" }, policies: { shipping: "My own shipping words" } };
  const filled = testShopDetails(seed, "Test Press");
  assert.equal(filled.info.email, "hello@test-press.example");
  assert.equal(filled.design.social.instagram, "");
  assert.equal(filled.policies.shipping, "My own shipping words");
  assert.equal(filled.info.name, "Test Press", "the admin's brand is the shop's name, not Your Press");
  assert.equal(filled.design.copy.siteName, "Test Press");
  assert.equal(testShopDetails({ info: { name: "Salt Hymns" }, design: { copy: { siteName: "Salt Hymns" } }, policies: testShopDetails({}, "x").policies, }, "Test Press")?.info?.name ?? "Salt Hymns", "Salt Hymns", "a name the owner typed stays");
  for (const key of ["returns", "privacy", "terms"]) assert.ok(filled.policies[key].length > 40, `${key} has words`);
  assert.equal(testShopDetails(filled, "Test Press"), null, "a second run changes nothing");
  assert.equal(testShopDetails({}, "Test Goods").info.email, "hello@test-goods.example");
  assert.notEqual(testShopDetails(filled, "Test Press", { replace: true }).policies.shipping, "My own shipping words", "the reset writes the sample words again");
});
