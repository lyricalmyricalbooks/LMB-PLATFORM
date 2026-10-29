import { test, expect } from "vitest";
import { createRequire } from "node:module";
const { orderRequestProblem, orderRequestRecord, privacyRequestRecord } = createRequire(import.meta.url)("./customerRequests");

test("cancel is allowed only before the order ships", () => {
  expect(orderRequestProblem({ paymentStatus: "paid", fulfillmentStatus: "paid" }, "cancel")).toBeNull();
  expect(orderRequestProblem({ paymentStatus: "paid", fulfillmentStatus: "shipped" }, "cancel")).toBe("already_shipped");
  expect(orderRequestProblem({ paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "1Z" }, "cancel")).toBe("already_shipped");
});

// Fault 136: a bought label puts a tracking number on the order while the parcel is still in the shop.
test("a bought but undispatched label does not count as shipped", () => {
  expect(orderRequestProblem({ paymentStatus: "paid", fulfillmentStatus: "processing", labelUrl: "https://label", trackingNumber: "1Z" }, "cancel")).toBeNull();
});

test("with returns off (the default), shoppers can't ask for a return; closed orders and open requests are refused", () => {
  expect(orderRequestProblem({ paymentStatus: "paid", fulfillmentStatus: "delivered" }, "return")).toBe("invalid");
  expect(orderRequestProblem({ paymentStatus: "paid" }, "return")).toBe("invalid");
  expect(orderRequestProblem({ status: "cancelled" }, "cancel")).toBe("closed");
  expect(orderRequestProblem({ paymentStatus: "paid", customerRequest: { status: "open" } }, "cancel")).toBe("already_open");
  expect(orderRequestProblem({ paymentStatus: "paid" }, "bogus")).toBe("invalid");
});

test("with returns on, a paid, shipped order may ask within the window after delivery", () => {
  const returns = { enabled: true, windowDays: 30 };
  const now = Date.parse("2026-11-20T12:00:00Z");
  const delivered = { paymentStatus: "paid", status: "delivered", fulfillmentStatus: "delivered", deliveredAt: "2026-11-01T12:00:00Z", items: [{ id: "tee", quantity: 1, format: "Clothing" }] };
  expect(orderRequestProblem(delivered, "return", { returns, now })).toBeNull();
  expect(orderRequestProblem(delivered, "return", { returns: { enabled: true, windowDays: 7 }, now })).toBe("window_closed");
  expect(orderRequestProblem({ ...delivered, deliveredAt: undefined, shippedAt: "2026-10-01T12:00:00Z" }, "return", { returns, now })).toBe("window_closed");
  expect(orderRequestProblem({ ...delivered, status: "paid", fulfillmentStatus: "processing" }, "return", { returns, now })).toBe("not_shipped");
  expect(orderRequestProblem({ ...delivered, items: [{ id: "e", format: "E-book" }] }, "return", { returns, now })).toBe("invalid");
  expect(orderRequestProblem({ ...delivered, paymentStatus: "unpaid" }, "return", { returns, now })).toBe("invalid");
  expect(orderRequestProblem({ ...delivered, returnProgress: { state: "closed" } }, "return", { returns, now })).toBe("already_returned");
  expect(orderRequestProblem({ ...delivered, paymentStatus: "refunded" }, "return", { returns, now })).toBe("closed");
  expect(orderRequestProblem(delivered, "return", { returns: { enabled: false, windowDays: 30 }, now })).toBe("invalid");
  // A broken setting reads as off.
  expect(orderRequestProblem(delivered, "return", { returns: { enabled: "yes" }, now })).toBe("invalid");
});

test("records trim and cap what the shopper typed", () => {
  expect(orderRequestRecord("cancel", " x".repeat(800), "t").message.length).toBe(1000);
  expect(privacyRequestRecord("A@B.CO", "delete", "", "t")).toEqual({ email: "a@b.co", type: "delete", message: "", status: "open", createdAt: "t" });
  expect(privacyRequestRecord("nope", "delete")).toBeNull();
  expect(privacyRequestRecord("a@b.co", "wipe")).toBeNull();
});
