import { describe, expect, it } from "vitest";
import { addressIssues, addressKey, packingKey, queueOf, dispatchProblem, buildPickList, fulfillmentMethod, defaultRestockOnRefund } from "./fulfillment";
describe("refund restock default", () => {
 it("restocks by default only while the books are still in the shop", () => {
  for (const status of ["shipped", "out_for_delivery", "delivered", "collected"]) expect(defaultRestockOnRefund({ fulfillmentStatus: status })).toBe(false);
  for (const status of [undefined, "", "processing", "ready_for_pickup", "ready_for_delivery"]) expect(defaultRestockOnRefund({ fulfillmentStatus: status })).toBe(true);
 });
});
const order = () => ({ id: "a", paymentStatus: "paid", status: "open", customer: { address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M6G3H1", country: "Canada" } }, items: [{ id: "book", title: "Book", quantity: 2 }] });
const reviewed = () => { const o: any = order(); o.operations = { addressReviewed: addressKey(o) }; return o; };
const packed = () => { const o = reviewed(); o.operations.packed = packingKey(o); return o; };
describe("publisher fulfillment", () => {
 it("routes unchecked addresses to attention and reviewed orders to packing", () => { expect(queueOf(order())).toBe("Needs attention"); expect(queueOf(reviewed())).toBe("Ready to pack"); expect(queueOf(packed())).toBe("Ready to ship"); });
 it("flags country and province contradictions even if verified", () => { const o = order(); o.customer.address.country = "United States"; expect(addressIssues(o).join(" ")).toContain("country"); });
 it("invalidates review and packing when their source changes", () => { const o = packed(); o.customer.address.zip = "M5V1A1"; expect(queueOf(o)).toBe("Needs attention"); const p = packed(); p.items[0].quantity = 3; expect(queueOf(p)).toBe("Ready to pack"); });
 it("treats address maps with different key order as the same address", () => { const a = order(); const b = order(); b.customer.address = { country: "Canada", zip: "M6G3H1", state: "ON", city: "Toronto", street: "1 Main" }; expect(addressKey(a)).toBe(addressKey(b)); });
 it("never considers unpaid, refunded, held or test orders dispatchable", () => { for (const patch of [{ paymentStatus: "unpaid" }, { paymentStatus: "refund_pending" }, { status: "cancelled" }, { isTest: true }, { operations: { hold: "Contact customer" } }]) expect(dispatchProblem({ ...packed(), ...patch })).toBeTruthy(); });
 it("keeps shipped orders in transit even with legacy completed status", () => { expect(queueOf({ ...packed(), status: "completed", fulfillmentStatus: "shipped" })).toBe("In transit"); expect(queueOf({ ...packed(), fulfillmentStatus: "delivered" })).toBe("Completed"); });
 it("a label does not dispatch a packed order", () => { expect(queueOf({ ...packed(), labelUrl: "https://example.com/label" })).toBe("Ready to ship"); expect(dispatchProblem(packed())).toBe(""); });
 it("aggregates book quantities without conflating editions", () => { expect(buildPickList([order(), { ...order(), items: [{ id: "book", title: "Book", quantity: 1 }, { id: "other", title: "Book", quantity: 1 }] }]).map(i => i.quantity)).toEqual([3, 1]); });
});

it("does not send digital-only orders to a shipping queue", () => { const o = order(); o.items = [{ id: "ebook", title: "Book", quantity: 1, format: "EPUB" } as any]; expect(queueOf(o)).toBe("Completed"); expect(dispatchProblem(o)).toBeTruthy(); });
it("requires actual order items before packing", () => { const o = reviewed(); o.items = []; expect(queueOf(o)).toBe("Needs attention"); });

it("skips address review for pickup but keeps packing as a prerequisite", () => {
 const o: any = order(); o.fulfillmentSelection = { method: "pickup", optionId: "shop" }; o.customer.address = {};
 expect(fulfillmentMethod(o)).toBe("pickup"); expect(queueOf(o)).toBe("Ready to pack");
 o.operations = { packed: packingKey(o) }; expect(queueOf(o)).toBe("Ready for pickup");
});
it("keeps local delivery address review and packing before delivery", () => {
 const o: any = reviewed(); o.fulfillmentSelection = { method: "local_delivery", optionId: "zone" };
 expect(queueOf(o)).toBe("Ready to pack");
 o.operations.packed = packingKey(o); expect(queueOf(o)).toBe("Ready for local delivery");
});
it("routes pickup and delivery to completed only after handoff", () => {
 const o: any = packed(); o.fulfillmentSelection = { method: "pickup", optionId: "shop" }; o.fulfillmentStatus = "ready_for_pickup";
 expect(queueOf(o)).toBe("Ready for pickup"); o.fulfillmentStatus = "collected"; expect(queueOf(o)).toBe("Completed");
 o.fulfillmentSelection = { method: "local_delivery", optionId: "zone" }; o.fulfillmentStatus = "ready_for_delivery";
 expect(queueOf(o)).toBe("Ready for local delivery"); o.fulfillmentStatus = "out_for_delivery"; expect(queueOf(o)).toBe("In transit");
 o.fulfillmentStatus = "delivered"; expect(queueOf(o)).toBe("Completed");
});
it("recognizes server and client digital item markers consistently", () => {
 const o: any = { ...packed(), items: [{ id: "e", quantity: 1, isDigital: true }] }; expect(queueOf(o)).toBe("Completed");
});


import { matchesCustomerService } from "./fulfillment";
describe("customer's checkout service on label rates", () => {
  it("matches with or without the Canada Post prefix, case-insensitively", () => {
    expect(matchesCustomerService("Expedited Parcel", "Canada Post Expedited Parcel")).toBe(true);
    expect(matchesCustomerService("Xpresspost", "canada post XPRESSPOST")).toBe(true);
    expect(matchesCustomerService("Regular Parcel", "Canada Post Expedited Parcel")).toBe(false);
    expect(matchesCustomerService("Regular Parcel", undefined)).toBe(false);
  });
});

import { daysInTransit, isOverdueInTransit } from "./fulfillment";
describe("parcels in transit too long", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const shipped = (shippedAt: string, extra: any = {}) => ({ ...order(), status: "completed", fulfillmentStatus: "shipped", shippedAt, ...extra });
  it("flags shipped parcels at 14 days, not before", () => {
    expect(daysInTransit(shipped("2026-10-10T12:00:00Z"), now)).toBe(10);
    expect(isOverdueInTransit(shipped("2026-10-10T12:00:00Z"), now)).toBe(false);
    expect(isOverdueInTransit(shipped("2026-10-06T12:00:00Z"), now)).toBe(true);
  });
  it("never flags delivered, local or undated orders", () => {
    expect(isOverdueInTransit(shipped("2026-09-01T00:00:00Z", { fulfillmentStatus: "delivered" }), now)).toBe(false);
    expect(isOverdueInTransit(shipped("2026-09-01T00:00:00Z", { fulfillmentSelection: { method: "local_delivery" }, fulfillmentStatus: "out_for_delivery" }), now)).toBe(false);
    expect(isOverdueInTransit(shipped(""), now)).toBe(false);
  });
});

import { packingInfo } from "./fulfillment";
describe("packingInfo", () => {
  it("prefers the edition's photo and shelf, then the book's, then the order line's photo", () => {
    const book = { coverImage: "cover.jpg", shelfLocation: "B2", variants: [{ id: "hc", image: "hc.jpg", shelfLocation: "A1" }] };
    expect(packingInfo({ id: "b", variantId: "hc" }, book)).toEqual({ photo: "hc.jpg", shelf: "A1" });
    expect(packingInfo({ id: "b" }, book)).toEqual({ photo: "cover.jpg", shelf: "B2" });
    expect(packingInfo({ id: "b", photoUrl: "line.jpg" }, null)).toEqual({ photo: "line.jpg", shelf: "" });
  });
});

it("blocks dispatch while a customer return is open", () => { expect(dispatchProblem({ ...packed(), customerRequest: { type: "return", status: "open" } })).toContain("return"); });
