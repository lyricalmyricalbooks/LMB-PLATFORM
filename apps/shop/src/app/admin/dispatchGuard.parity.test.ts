import { describe, it, expect } from "vitest";
import { dispatchProblem, addressKey, packingKey } from "./fulfillment";
// @ts-ignore - CommonJS server module
import * as server from "../../../functions/fulfillmentGuard.js";
const srv: any = (server as any).default ?? server;

// A label bought in the inventory app is dispatched by the server (functions/inventoryLinkJobs.js) with
// externalDispatchProblem. It must refuse exactly what Orders › Dispatch refuses, once the website's own
// address-review and packing steps are done (the owner packed this parcel in the inventory app).
const address = { street: "1 Main St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" };
const base = () => ({
  paymentStatus: "paid", status: "open", fulfillmentStatus: "paid",
  customer: { name: "Ana", email: "a@x.com", address },
  items: [{ id: "b1", quantity: 1, price: 40, format: "Paperback" }],
});
const cases: Array<[string, any, any?]> = [
  ["ready", {}],
  ["test order", { isTest: true }],
  ["unpaid", { paymentStatus: "unpaid" }],
  ["refunded", { paymentStatus: "refunded" }],
  ["refund pending", { paymentStatus: "refund_pending" }],
  ["cancelled", { status: "cancelled" }],
  ["pickup", { fulfillmentSelection: { method: "pickup" } }],
  ["local delivery", { fulfillmentSelection: { method: "local_delivery" } }],
  ["shipped", { fulfillmentStatus: "shipped" }],
  ["delivered", { fulfillmentStatus: "delivered" }],
  ["completed", { status: "completed" }],
  ["open return", { customerRequest: { type: "return", status: "open" } }],
  ["handled return", { customerRequest: { type: "return", status: "handled" } }],
  ["dispute open", { disputeStatus: "needs_response" }],
  ["dispute won", { disputeStatus: "won" }],
  ["refund failed", { refund: { status: "failed" } }],
  ["on hold", {}, { hold: "Customer asked to wait" }],
  ["pre-order waiting", { items: [{ id: "b1", quantity: 1, preorder: true, releaseDate: "2099-01-01" }] }],
  ["pre-order released early", { preorderReleasedAt: "2026-10-01T00:00:00Z", items: [{ id: "b1", quantity: 1, preorder: true, releaseDate: "2099-01-01" }] }],
  ["pre-order date passed", { items: [{ id: "b1", quantity: 1, preorder: true, releaseDate: "2020-01-01" }] }],
];

describe("inventory-app dispatch refuses what Orders › Dispatch refuses", () => {
  for (const [name, patch, operations = {}] of cases) {
    it(name, () => {
      const order: any = { ...base(), ...patch };
      const ops = { addressReviewed: addressKey(order), packed: packingKey(order), ...operations };
      const admin = dispatchProblem({ ...order, operations: ops });
      const fromApp = srv.externalDispatchProblem(order, ops);
      expect(fromApp).toBe(admin);
    });
  }
  it("stricter: an open cancel request stops it (the owner can't see it from the inventory app)", () => {
    const order: any = { ...base(), customerRequest: { type: "cancel", status: "open" } };
    expect(srv.externalDispatchProblem(order, {})).toMatch(/asked to cancel/);
  });
  it("stricter: a website label purchase in progress stops it (no second paid label)", () => {
    const order: any = base();
    const ops = { addressReviewed: addressKey(order), packed: packingKey(order), labelPurchasePending: true };
    expect(dispatchProblem({ ...order, operations: ops })).toBe("");
    expect(srv.externalDispatchProblem(order, ops)).toMatch(/two labels/);
  });
  it("the server also refuses orders with nothing to post", () => {
    expect(srv.externalDispatchProblem({ ...base(), items: [{ id: "e", quantity: 1, format: "Ebook" }] }, {})).toMatch(/no physical books/);
  });
});
