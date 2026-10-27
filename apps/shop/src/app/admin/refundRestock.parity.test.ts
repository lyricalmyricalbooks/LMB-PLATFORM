import { expect, test } from "vitest";
import { createRequire } from "node:module";
import { LEFT_THE_SHOP_STATUSES, defaultRestockOnRefund, booksLeftOutAfterRefund } from "./fulfillment";

const require = createRequire(import.meta.url);
const { LEFT_STATES, leftTheShop } = require("../../../functions/refundRestock.js");

test("the refund window's Restock default is the server's rule", () => {
  expect([...LEFT_THE_SHOP_STATUSES].sort()).toEqual([...LEFT_STATES].sort());
  for (const order of [{}, { fulfillmentStatus: "ready_for_pickup" }, { status: "completed" }, ...LEFT_STATES.map((s: string) => ({ fulfillmentStatus: s }))]) {
    expect(defaultRestockOnRefund(order)).toBe(!leftTheShop(order));
  }
});

test("Books not back in stock shows only for a refund that left printed books out", () => {
  const order = { paymentStatus: "refunded", items: [{ id: "a", quantity: 1 }] };
  expect(booksLeftOutAfterRefund(order)).toBe(true);
  expect(booksLeftOutAfterRefund({ ...order, inventoryRestockedAt: "x" })).toBe(false);
  expect(booksLeftOutAfterRefund({ ...order, paymentStatus: "paid" })).toBe(false);
  expect(booksLeftOutAfterRefund({ ...order, sandboxPayment: true })).toBe(false);
  expect(booksLeftOutAfterRefund({ ...order, items: [{ id: "e", quantity: 1, format: "ebook" }] })).toBe(false);
});
