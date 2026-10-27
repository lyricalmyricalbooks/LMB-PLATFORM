// A refund that left its books out of stock can put them back once, later, with the same record a
// restocking refund writes — so the inventory app link sees the copies come back (net 0).
import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { leftTheShop, restockRefundedProblem, restockRefundedOrder, LEFT_STATES } = require("./refundRestock.js");
const { orderFootprint } = require("./inventoryLink.js");

function fakeDb(docs) {
  const ref = (name, id) => ({ name, id });
  const read = r => { const data = docs[r.name]?.[r.id]; return { exists: !!data, data: () => data }; };
  return {
    docs,
    collection: name => ({ doc: id => ref(name, id) }),
    async runTransaction(fn) {
      return fn({ get: async r => read(r), update: (r, data) => { docs[r.name][r.id] = { ...docs[r.name][r.id], ...data }; } });
    },
  };
}

const refunded = (over = {}) => ({
  paymentStatus: "refunded", status: "cancelled", fulfillmentStatus: "ready_for_pickup",
  items: [{ id: "injured", quantity: 1, price: 20 }], activity: [], ...over,
});

describe("leftTheShop", () => {
  test("sent, delivered, collected or completed orders left the shop; waiting ones didn't", () => {
    for (const s of LEFT_STATES) expect(leftTheShop({ fulfillmentStatus: s })).toBe(true);
    expect(leftTheShop({ status: "completed" })).toBe(true);
    for (const s of [undefined, "", "processing", "ready_for_pickup", "ready_for_delivery"]) expect(leftTheShop({ fulfillmentStatus: s })).toBe(false);
  });
});

describe("restockRefundedProblem", () => {
  test("only a refunded order with printed books still out", () => {
    expect(restockRefundedProblem(refunded())).toBe("");
    expect(restockRefundedProblem(refunded({ paymentStatus: "refund_pending" }))).toBe("");
    expect(restockRefundedProblem(refunded({ paymentStatus: "paid" }))).toMatch(/Only a refunded order/);
    expect(restockRefundedProblem(refunded({ inventoryRestockedAt: "2026-10-11" }))).toMatch(/already back/);
    expect(restockRefundedProblem(refunded({ sandboxPayment: true }))).toMatch(/test payment/);
    expect(restockRefundedProblem(refunded({ items: [{ id: "e", quantity: 1, format: "ebook" }] }))).toMatch(/no printed books/);
    expect(restockRefundedProblem(null)).toMatch(/not found/);
  });
});

describe("restockRefundedOrder", () => {
  test("puts the copy back once and records it like a restocking refund", async () => {
    const db = fakeDb({ orders: { o1: refunded() }, books: { injured: { trackInventory: true, stockLevel: 14 } }, systemStatus: {} });
    const result = await restockRefundedOrder(db, "o1", { actor: "owner", now: "2026-10-11T15:00:00.000Z" });
    expect(result.restocked).toBe(1);
    expect(db.docs.books.injured.stockLevel).toBe(15);
    const order = db.docs.orders.o1;
    expect(order.inventoryRestockedAt).toBe("2026-10-11T15:00:00.000Z");
    expect(order.restockedItems).toEqual([{ id: "injured", variantId: null, quantity: 1 }]);
    expect(order.activity.at(-1).message).toMatch(/put back in stock/);
    await expect(restockRefundedOrder(db, "o1")).rejects.toMatchObject({ status: 409 });
    expect(db.docs.books.injured.stockLevel).toBe(15);
  });

  test("the inventory app link then counts the order as nothing gone", async () => {
    const db = fakeDb({ orders: { o1: refunded() }, books: { injured: { trackInventory: true, stockLevel: 14 } }, systemStatus: {} });
    const links = { injured: { _: "injured" } };
    const before = orderFootprint({ id: "o1", ...db.docs.orders.o1 }, links);
    await restockRefundedOrder(db, "o1");
    const after = orderFootprint({ id: "o1", ...db.docs.orders.o1 }, links);
    expect(before.net).toEqual({ injured: 1 });
    expect(after.net).toEqual({ injured: 0 });
  });

  test("refuses a paid order and a missing one", async () => {
    const db = fakeDb({ orders: { o1: refunded({ paymentStatus: "paid" }) }, books: {}, systemStatus: {} });
    await expect(restockRefundedOrder(db, "o1")).rejects.toMatchObject({ status: 409 });
    await expect(restockRefundedOrder(db, "nope")).rejects.toMatchObject({ status: 404 });
  });
});
