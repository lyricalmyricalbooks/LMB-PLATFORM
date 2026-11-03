// Ship part of an order now and the rest later (code plan 24.5).
import { describe, expect, it } from "vitest";
import { addressKey } from "./fulfillment";
import { canShipPart, newPartShipment, partShipmentProblem, shippableLines } from "./partShipments";

const address = { street: "1 Main St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" };
function order(extra: any = {}) {
  const o: any = {
    id: "o1", paymentStatus: "paid", status: "paid", customer: { email: "c@example.com", address },
    items: [
      { id: "a", title: "Moth Notes", quantity: 2 },
      { id: "b", title: "Screen", format: "EPUB", quantity: 1 },
      { id: "c", title: "Tee", variantName: "Medium", quantity: 1 },
    ],
    operations: {}, ...extra,
  };
  o.operations = { addressReviewed: addressKey(o), ...o.operations };
  return o;
}
const tracking = { trackingCarrier: "Canada Post", trackingNumber: "123", trackingUrl: "" };

describe("shippableLines", () => {
  it("lists physical lines with what's left after earlier parts", () => {
    const o = order({ partShipments: [{ id: "p1", lines: [{ line: 0, title: "Moth Notes", quantity: 1 }] }] });
    expect(shippableLines(o)).toEqual([
      { line: 0, title: "Moth Notes", ordered: 2, sent: 1, left: 1 },
      { line: 2, title: "Tee – Medium", ordered: 1, sent: 0, left: 1 },
    ]);
  });
});

describe("partShipmentProblem", () => {
  it("allows part of a reviewed paid order, before packing and while a pre-order waits", () => {
    expect(partShipmentProblem(order(), { 0: 2 })).toBe("");
    expect(canShipPart(order())).toBe(true);
    const pre = order({ items: [{ id: "a", title: "Moth Notes", quantity: 1 }, { id: "p", title: "Later", quantity: 1, preorder: true, releaseDate: "2099-01-01" }] });
    expect(partShipmentProblem(pre, { 0: 1 })).toBe("");
  });
  it("refuses sending everything left, nothing, too many, digital lines or fractions", () => {
    expect(partShipmentProblem(order(), { 0: 2, 2: 1 })).toMatch(/everything left/);
    expect(partShipmentProblem(order(), {})).toMatch(/at least one/);
    expect(partShipmentProblem(order(), { 0: 3 })).toMatch(/Only 2 of Moth Notes are left/);
    expect(partShipmentProblem(order(), { 1: 1 })).toMatch(/can't be shipped/);
    expect(partShipmentProblem(order(), { 0: 1.5 })).toMatch(/whole numbers/);
  });
  it("refuses what dispatch refuses: unreviewed address, hold, unpaid, test, local, already shipped", () => {
    expect(partShipmentProblem({ ...order(), operations: {} }, { 0: 1 })).toMatch(/address/);
    expect(partShipmentProblem(order({ operations: { hold: "Waiting" } }), { 0: 1 })).toMatch(/hold/);
    expect(partShipmentProblem(order({ paymentStatus: "unpaid" }), { 0: 1 })).toMatch(/paid/);
    expect(partShipmentProblem(order({ isTest: true }), { 0: 1 })).toMatch(/Test/);
    expect(partShipmentProblem(order({ fulfillmentSelection: { method: "pickup" } }), { 0: 1 })).toMatch(/Pickup/);
    expect(partShipmentProblem(order({ fulfillmentStatus: "shipped" }), { 0: 1 })).toMatch(/already been dispatched/);
    expect(canShipPart(order({ items: [{ id: "a", title: "One", quantity: 1 }] }))).toBe(false);
  });
});

describe("newPartShipment", () => {
  it("numbers parts and keeps titles and quantities", () => {
    const o = order({ partShipments: [{ id: "p1", lines: [{ line: 0, title: "Moth Notes", quantity: 1 }] }] });
    expect(newPartShipment(o, { 2: 1, 0: 0 }, tracking, "2026-11-03T12:00:00Z")).toEqual({
      id: "p2", lines: [{ line: 2, title: "Tee – Medium", quantity: 1 }], ...tracking, shippedAt: "2026-11-03T12:00:00Z",
    });
  });
});
