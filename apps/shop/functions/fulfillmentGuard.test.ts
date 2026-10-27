import { describe, expect, it } from "vitest";
import * as client from "../src/app/admin/fulfillment";
const { labelProblem, addressKey, packingKey } = require("./fulfillmentGuard");
const o: any = { paymentStatus: "paid", status: "open", customer: { address: { zip: "M6G3H1", street: "A", city: "Toronto", state: "ON", country: "Canada" } }, items: [{ id: "b", quantity: 1 }] };
// What the admin actually saves when reviewing/packing (client helpers).
const operations = { addressReviewed: client.addressKey(o), packed: client.packingKey(o) };
describe("label purchase guard", () => {
 it("requires active paid orders and completed preparation", () => { expect(labelProblem(o, operations)).toBe(""); expect(labelProblem({ ...o, paymentStatus: "unpaid" }, operations)).toBeTruthy(); expect(labelProblem(o, {})).toBeTruthy(); expect(labelProblem(o, { ...operations, hold: "Stock issue" })).toBeTruthy(); });
 it("rejects duplicate labels and dispatched orders", () => { expect(labelProblem({ ...o, labelUrl: "existing" }, operations)).toBeTruthy(); expect(labelProblem({ ...o, fulfillmentStatus: "shipped" }, operations)).toBeTruthy(); expect(labelProblem(o, { ...operations, labelPurchasePending: true })).toBeTruthy(); });
 it("invalidates preparation after order changes", () => { expect(labelProblem({ ...o, items: [{ id: "b", quantity: 2 }] }, operations)).toBeTruthy(); });
 it("uses exactly the keys the admin saves", () => { expect(addressKey(o)).toBe(client.addressKey(o)); expect(packingKey(o)).toBe(client.packingKey(o)); });
 it("rejects carrier labels for validated pickup and local delivery", () => { for (const method of ['pickup', 'local_delivery']) expect(labelProblem({ ...o, fulfillment: { method } }, operations)).toBeTruthy(); });
});

it("requires address review again when apartment changes and preserves legacy address keys", () => {
 const changed = { ...o, customer: { address: { ...o.customer.address, unit: "12" } } };
 expect(client.addressKey(changed)).not.toBe(operations.addressReviewed);
 expect(addressKey(changed)).toBe(client.addressKey(changed));
 expect(labelProblem(changed, operations)).toContain("Review the address");
 expect(client.addressKey({ ...o, customer: { address: { ...o.customer.address, unit: "" } } })).toBe(operations.addressReviewed);
});

it("blocks money-spending labels for an open return", () => { expect(labelProblem({ ...o, customerRequest: { type: "return", status: "open" } }, operations)).toContain("return"); });
