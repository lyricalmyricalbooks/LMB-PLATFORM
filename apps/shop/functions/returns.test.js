import { expect, test } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { returnTransition, publicReturn, returnRestockItems } = require("./returns");
const order = { customerRequest: { type: "return", status: "open" }, paymentStatus: "paid", items: [{ id: "a", quantity: 2, format: "Paperback" }, { id: "b", variantId: "ed", quantity: 1, format: "Paperback" }, { id: "pdf", quantity: 1, isDigital: true }] };
const advance = (current, state, input = {}) => returnTransition(order, current, state, input, "now", "admin");
test("requires approval instructions and sequential receipt/inspection", () => { expect(() => advance(null, "received")).toThrow("out of order"); expect(() => advance(null, "approved")).toThrow("instructions"); const approved = advance(null, "approved", { instructions: "Send to confirmed address" }); expect(advance(approved, "approved")).toBe(approved); const received = advance(approved, "received"); expect(() => advance(received, "inspected", { inspection: [{ index: 0, quantity: 1, condition: "resellable" }] })).toThrow(); });
test("selective restock includes resellable physical copies only", () => { const received = advance(advance(null, "approved", { instructions: "Return" }), "received"); const inspected = advance(received, "inspected", { inspection: [{ index: 0, quantity: 2, condition: "resellable" }, { index: 1, quantity: 1, condition: "damaged" }] }); expect(returnRestockItems({ ...order, returnProgress: { state: "inspected" } }, inspected)).toEqual([{ id: "a", variantId: null, quantity: 2 }]); expect(publicReturn(inspected)).not.toHaveProperty("inspection"); expect(publicReturn(inspected)).not.toHaveProperty("actor"); });
test("no restock before inspection or for an unapproved return request", () => { expect(returnRestockItems({ ...order, fulfillmentStatus: "delivered" }, null)).toEqual([]); expect(returnRestockItems({ ...order, returnProgress: { state: "received" } }, { state: "received" })).toEqual([]); });
test("payment and refund claims prevent return changes", () => { expect(() => returnTransition({ ...order, paymentStatus: "unpaid" }, null, "approved", {}, "now", "admin")).toThrow("paid"); expect(() => returnTransition({ ...order, refundRequest: {} }, null, "approved", {}, "now", "admin")).toThrow("refund"); });

test("mixed-condition lines restock only the confirmed resellable count", () => {
  const received = advance(advance(null, "approved", { instructions: "Return" }), "received");
  const inspection = [{ index: 0, quantity: 2, condition: "mixed", restockQuantity: 1 }, { index: 1, quantity: 1, condition: "damaged" }];
  const next = advance(received, "inspected", { inspection });
  expect(returnRestockItems({ ...order, returnProgress: { state: "inspected" } }, next)).toEqual([{ id: "a", variantId: null, quantity: 1 }]);
  for (const count of [-1, 3, 0.5, null]) expect(() => advance(received, "inspected", { inspection: [{ ...inspection[0], restockQuantity: count }, inspection[1]] })).toThrow("resold");
});

test("books that never left the shop follow the admin's restock choice", () => {
  expect(returnRestockItems(order, null)).toEqual(order.items);
  expect(returnRestockItems({ ...order, fulfillmentStatus: "shipped", trackingNumber: "TRACK1" }, null)).toEqual([]);
  // Fault 136: a label bought but not yet handed over has a tracking number; the books are still on the shelf.
  expect(returnRestockItems({ ...order, trackingNumber: "TRACK1", labelUrl: "https://label" }, null)).toEqual(order.items);
});

// Fault 25: an approved return could never be closed.
test("an approved, received or inspected return can be closed without a refund", () => {
  const approved = advance(null, "approved", { instructions: "Send it back" });
  for (const current of [approved, advance(approved, "received")]) {
    const closed = advance(current, "closed");
    expect(closed.state).toBe("closed");
    expect(closed.closedAt).toBe("now");
    expect(publicReturn(closed)).toMatchObject({ state: "closed", closedAt: "now" });
  }
  expect(() => advance(null, "closed")).toThrow("approved return");
  // Nothing is refunded or restocked by closing, and the admin's own restock choice covers a later refund.
  expect(returnRestockItems({ ...order, returnProgress: { state: "closed" } }, { state: "closed" })).toEqual(order.items);
});

test("a closed request is never reopened, but repeating the closing step is harmless", () => {
  const handled = { ...order, customerRequest: { type: "return", status: "handled" } };
  expect(() => returnTransition(handled, null, "approved", { instructions: "Return" }, "now", "admin")).toThrow("closed");
  const rejected = { state: "rejected", instructions: "No" };
  expect(returnTransition(handled, rejected, "rejected", { instructions: "No" }, "now", "admin")).toBe(rejected);
});

test("audiobooks, EPUBs and digital editions are not physical return lines", () => {
  const audio = { ...order, items: [{ id: "x", quantity: 1, format: "Audiobook" }, { id: "y", quantity: 1, variantName: "EPUB" }, { id: "z", quantity: 1, format: "E-book (PDF)" }] };
  expect(() => returnTransition(audio, null, "approved", { instructions: "Return" }, "now", "admin")).toThrow("no physical books");
});
