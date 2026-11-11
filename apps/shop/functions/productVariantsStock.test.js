// Products sold in options (size, colour…; src/shared/productOptions.ts): each combination is a variant with its own
// id, so the server counts and holds stock per combination exactly as it does for a book's editions. These checks pin
// that for a shirt sold in sizes and colours, so the shop's Every combination grid can rely on it (11 November 2026).
import { expect, test } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { stockChanges } = require("./inventory");
const { reserveStock, StockHoldError } = require("./stockHolds");
const { variantsForOptions, usesOptionPicker } = require("./shared/productOptions");

const options = [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }];
const stockBy = { "S / Black": 3, "S / White": 0, "M / Black": 1, "M / White": 5 };
function shirt() {
  let n = 0;
  const { variants } = variantsForOptions(options, [], () => ({ id: `v${++n}`, price: 30 }));
  const withStock = variants.map(v => ({ ...v, stock: stockBy[v.name], stockLevel: stockBy[v.name] }));
  return { title: "Tee", kind: "clothing", trackInventory: true, options, stockLevel: 9, variants: withStock };
}
const idOf = (book, name) => book.variants.find(v => v.name === name).id;

test("a sale takes stock from the chosen combination only, keeping every combination's picks", () => {
  const tee = shirt();
  expect(usesOptionPicker(tee)).toBe(true);
  const { updates, oversold } = stockChanges([{ id: "tee", variantId: idOf(tee, "M / White"), quantity: 2 }], { tee }, -1);
  expect(oversold).toBe(false);
  const after = Object.fromEntries(updates[0].data.variants.map(v => [v.name, v.stockLevel]));
  expect(after).toEqual({ "S / Black": 3, "S / White": 0, "M / Black": 1, "M / White": 3 });
  expect(updates[0].data.variants.map(v => v.options)).toEqual(tee.variants.map(v => v.options));
});

test("a sold-out combination can't be held, while another of the same product can", async () => {
  const tee = shirt();
  const docs = { "books/tee": tee };
  const db = {
    docs,
    collection: col => ({ doc: id => ({ path: `${col}/${id}` }) }),
    runTransaction: async fn => fn({
      get: async r => ({ exists: r.path in docs, data: () => docs[r.path] }),
      set: (r, data) => { docs[r.path] = data; },
    }),
  };
  await expect(reserveStock(db, "o1", [{ id: "tee", variantId: idOf(tee, "S / White"), quantity: 1 }], 1000)).rejects.toBeInstanceOf(StockHoldError);
  await reserveStock(db, "o2", [{ id: "tee", variantId: idOf(tee, "M / Black"), quantity: 1 }], 1000);
  // The last M / Black is now held: a second shopper can't take it.
  await expect(reserveStock(db, "o3", [{ id: "tee", variantId: idOf(tee, "M / Black"), quantity: 1 }], 1001)).rejects.toBeInstanceOf(StockHoldError);
});
