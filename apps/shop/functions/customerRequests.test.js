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

test("shoppers can't ask for a return; closed orders and open requests are refused", () => {
  expect(orderRequestProblem({ paymentStatus: "paid", fulfillmentStatus: "delivered" }, "return")).toBe("invalid");
  expect(orderRequestProblem({ paymentStatus: "paid" }, "return")).toBe("invalid");
  expect(orderRequestProblem({ status: "cancelled" }, "cancel")).toBe("closed");
  expect(orderRequestProblem({ paymentStatus: "paid", customerRequest: { status: "open" } }, "cancel")).toBe("already_open");
  expect(orderRequestProblem({ paymentStatus: "paid" }, "bogus")).toBe("invalid");
});

test("records trim and cap what the shopper typed", () => {
  expect(orderRequestRecord("cancel", " x".repeat(800), "t").message.length).toBe(1000);
  expect(privacyRequestRecord("A@B.CO", "delete", "", "t")).toEqual({ email: "a@b.co", type: "delete", message: "", status: "open", createdAt: "t" });
  expect(privacyRequestRecord("nope", "delete")).toBeNull();
  expect(privacyRequestRecord("a@b.co", "wipe")).toBeNull();
});
