import { test, expect } from "vitest";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { POOLS, poolsFromLinks, poolMembers, readStockPools } = require_("./stockPools");
const { stockChanges, readBooks } = require_("./inventory");
const { reserveStock, StockHoldError } = require_("./stockHolds");

// The Hound: Signed and Unsigned hardcovers are the same copies in the inventory app.
const links = { hound: { signed: "inv-hound", unsigned: "inv-hound" }, alt: { pb: "inv-alt" }, z: { _: "inv-z" } };
const hound = () => ({ title: "The Hound", trackInventory: true, stockLevel: 6, variants: [{ id: "signed", name: "Signed", stock: 3, stockLevel: 3 }, { id: "unsigned", name: "Unsigned", stock: 3, stockLevel: 3 }] });

test("only editions sharing an inventory book form a pile", () => {
  expect(poolsFromLinks(links)).toEqual({ hound: { signed: "inv-hound", unsigned: "inv-hound" } });
  const pools = poolsFromLinks(links);
  expect(poolMembers(pools, "hound", "signed").sort()).toEqual(["signed", "unsigned"]);
  expect(poolMembers(pools, "alt", "pb")).toEqual(["pb"]);
  expect(poolMembers(pools, "hound", "_")).toEqual(["_"]);
  expect(poolsFromLinks(null)).toEqual({});
});

test("a sale of one edition takes the copy off both; a refund puts it back on both", () => {
  const books = { hound: hound(), [POOLS]: poolsFromLinks(links) };
  const sale = stockChanges([{ id: "hound", variantId: "signed", quantity: 1 }], books, -1);
  expect(sale.updates[0].data.variants.map(v => v.stock)).toEqual([2, 2]);
  expect(sale.oversold).toBe(false);
  const both = stockChanges([{ id: "hound", variantId: "signed", quantity: 1 }, { id: "hound", variantId: "unsigned", quantity: 2 }], books, -1);
  expect(both.updates[0].data.variants.map(v => v.stock)).toEqual([0, 0]);
  const tooMany = stockChanges([{ id: "hound", variantId: "signed", quantity: 2 }, { id: "hound", variantId: "unsigned", quantity: 2 }], books, -1);
  expect(tooMany.oversold).toBe(true);
  const refund = stockChanges([{ id: "hound", variantId: "unsigned", quantity: 1 }], books, 1);
  expect(refund.updates[0].data.variants.map(v => v.stock)).toEqual([4, 4]);
});

test("without the shared link each edition keeps its own count", () => {
  const sale = stockChanges([{ id: "hound", variantId: "signed", quantity: 1 }], { hound: hound() }, -1);
  expect(sale.updates[0].data.variants.map(v => v.stock)).toEqual([2, 3]);
});

function fakeDb(docs) {
  const ref = (col, id) => ({ path: `${col}/${id}` });
  return {
    docs,
    collection: col => ({ doc: id => ref(col, id) }),
    runTransaction: async fn => fn({
      get: async r => ({ exists: r.path in docs, data: () => docs[r.path] }),
      set: (r, data) => { docs[r.path] = data; },
    }),
  };
}

test("readBooks carries the piles from the link", async () => {
  const db = fakeDb({ "books/hound": hound(), "systemStatus/inventoryLink": { links } });
  const books = await db.runTransaction(tx => readBooks(tx, db, [{ id: "hound", variantId: "signed", quantity: 1 }]));
  expect(books[POOLS]).toEqual({ hound: { signed: "inv-hound", unsigned: "inv-hound" } });
  expect(await readStockPools({ get: async () => ({ exists: false }) }, db)).toEqual({});
});

test("checkout holds count both editions against the one pile", async () => {
  const db = fakeDb({ "books/hound": { ...hound(), variants: hound().variants.map(v => ({ ...v, stock: 2, stockLevel: 2 })) }, "systemStatus/inventoryLink": { links } });
  // One shopper can't take 1 signed + 2 unsigned from 2 copies.
  await expect(reserveStock(db, "o1", [{ id: "hound", variantId: "signed", quantity: 1 }, { id: "hound", variantId: "unsigned", quantity: 2 }], 1000)).rejects.toBeInstanceOf(StockHoldError);
  // Another shopper's signed copy leaves one unsigned.
  await reserveStock(db, "o2", [{ id: "hound", variantId: "signed", quantity: 1 }], 1000);
  await reserveStock(db, "o3", [{ id: "hound", variantId: "unsigned", quantity: 1 }], 1001);
  await expect(reserveStock(db, "o4", [{ id: "hound", variantId: "unsigned", quantity: 1 }], 1002)).rejects.toBeInstanceOf(StockHoldError);
});
