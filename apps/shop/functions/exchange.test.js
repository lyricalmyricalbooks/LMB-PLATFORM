import { test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { planExchange } = require("./exchanges.js");

// A shirt in three sizes. One M came back and was inspected as resellable.
const shirt = () => ({
  trackInventory: true, retailPrice: 28, stockLevel: 7,
  variants: [
    { id: "s", name: "S", price: 28, stockLevel: 3, stock: 3 },
    { id: "m", name: "M", price: 28, stockLevel: 1, stock: 1 },
    { id: "l", name: "L", price: 28, stockLevel: 0, stock: 0 },
    { id: "xl", name: "XL", price: 30, stockLevel: 5, stock: 5 },
  ],
});
const order = () => ({
  paymentStatus: "paid", customerRequest: { type: "return", status: "open" },
  items: [{ id: "shirt", variantId: "m", quantity: 2 }],
});
const returned = (extra = {}) => ({ state: "inspected", inspection: [{ index: 0, id: "shirt", variantId: "m", ordered: 2, quantity: 1, condition: "resellable", restockQuantity: 1 }], ...extra });
const books = (b = shirt()) => new Map([["shirt", b]]);
const swap = (o = {}) => [{ index: 0, toVariantId: "s", quantity: 1, ...o }];

test("a swap puts the returned size back and takes the new size off, in one write per book", () => {
  const plan = planExchange(order(), returned(), swap(), books());
  expect(plan.updates).toHaveLength(1);
  const data = plan.updates[0].data;
  expect(data.variants.find(v => v.id === "m").stockLevel).toBe(2);
  expect(data.variants.find(v => v.id === "s").stockLevel).toBe(2);
  expect(data.variants.find(v => v.id === "l").stockLevel).toBe(0);
  expect(data.stockLevel).toBe(7);
  expect(plan.lines).toEqual([{ index: 0, id: "shirt", fromVariantId: "m", toVariantId: "s", toName: "S", quantity: 1, restocked: 1 }]);
});

test("a damaged return does not go back on the shelf, but the swap still takes the new size", () => {
  const rtn = returned({ inspection: [{ index: 0, id: "shirt", variantId: "m", ordered: 2, quantity: 1, condition: "damaged", restockQuantity: 0 }] });
  const data = planExchange(order(), rtn, swap(), books()).updates[0].data;
  expect(data.variants.find(v => v.id === "m").stockLevel).toBe(1);
  expect(data.variants.find(v => v.id === "s").stockLevel).toBe(2);
});

test("refused: a version with no stock, a different price, the same version, an unknown version", () => {
  expect(() => planExchange(order(), returned(), swap({ toVariantId: "l" }), books())).toThrow(/only 0 left/);
  expect(() => planExchange(order(), returned(), swap({ toVariantId: "xl" }), books())).toThrow(/different price/);
  expect(() => planExchange(order(), returned(), swap({ toVariantId: "m" }), books())).toThrow(/different version/);
  expect(() => planExchange(order(), returned(), swap({ toVariantId: "nope" }), books())).toThrow(/another version/);
});

test("refused: more than came back, twice for one line, an uninspected return, an unpaid or refunded order", () => {
  expect(() => planExchange(order(), returned(), swap({ quantity: 2 }), books())).toThrow(/up to the number/);
  expect(() => planExchange(order(), returned(), [...swap(), ...swap()], books())).toThrow(/once/);
  expect(() => planExchange(order(), returned({ state: "received" }), swap(), books())).toThrow(/inspect/);
  expect(() => planExchange({ ...order(), refundRequest: { at: "x" } }, returned(), swap(), books())).toThrow(/refund has already/);
  expect(() => planExchange({ ...order(), paymentStatus: "refunded" }, returned(), swap(), books())).toThrow(/paid/);
  expect(() => planExchange({ ...order(), customerRequest: { type: "return", status: "handled" } }, returned(), swap(), books())).toThrow(/open return/);
});

test("a box set is never exchanged", () => {
  const o = order(); o.items[0].components = [{ id: "x", quantity: 1 }];
  expect(() => planExchange(o, returned(), swap(), books())).toThrow(/box set/i);
});

test("a product that doesn't track stock swaps without a stock check", () => {
  const b = shirt(); b.trackInventory = false;
  const plan = planExchange(order(), returned(), swap({ toVariantId: "l" }), books(b));
  expect(plan.lines[0].toVariantId).toBe("l");
  expect(plan.updates).toEqual([]);
});
