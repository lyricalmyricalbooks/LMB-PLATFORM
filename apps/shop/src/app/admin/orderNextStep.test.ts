import { describe, expect, it } from "vitest";
import { addressKey, packingKey } from "./fulfillment";
import { orderNextStep } from "./orderNextStep";

const order = (over: any = {}) => ({
  paymentStatus: "paid", status: "open",
  customer: { name: "Reader", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M6G3H1", country: "Canada" } },
  items: [{ id: "a", title: "A", quantity: 2 }, { id: "b", title: "B", quantity: 1 }],
  operations: {} as any,
  ...over,
});

describe("Order detail's next step (v4 mockup 1b)", () => {
  it("asks for the address first, then packing with the copies counted", () => {
    const o = order();
    expect(orderNextStep(o, new Set())).toMatchObject({ text: "Next: Check the address", act: "review", step: "address" });
    o.operations = { addressReviewed: addressKey(o) };
    expect(orderNextStep(o, new Set())).toMatchObject({ text: "Next: Pack 3 items", label: "Mark as packed", act: "pack", blocked: true });
    expect(orderNextStep(o, new Set([0, 1]))).toMatchObject({ act: "pack", blocked: false });
  });

  it("sends a wrong address to its fix, not to Confirm", () => {
    const o = order({ customer: { name: "R", address: { street: "1 Main", city: "Toronto", state: "XX", zip: "1", country: "Canada" } } });
    expect(orderNextStep(o, new Set())).toMatchObject({ act: "correct" });
  });

  it("buys a label, then marks it shipped, then delivered", () => {
    const o = order();
    o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
    expect(orderNextStep(o, new Set())).toMatchObject({ text: "Next: Buy a label", act: "label" });
    o.labelUrl = "https://label.example/1.pdf";
    expect(orderNextStep(o, new Set())).toMatchObject({ act: "dispatch", blocked: false });
    o.operations.labelTest = true;
    expect(orderNextStep(o, new Set())).toMatchObject({ act: "dispatch", blocked: true });
  });

  it("stays quiet for unpaid, test, held, pickup and digital-only orders", () => {
    expect(orderNextStep(order({ paymentStatus: "unpaid" }), new Set())).toBeNull();
    expect(orderNextStep(order({ isTest: true }), new Set())).toBeNull();
    expect(orderNextStep(order({ operations: { hold: "Waiting on the customer" } }), new Set())).toBeNull();
    expect(orderNextStep(order({ fulfillmentSelection: { method: "pickup" } }), new Set())).toBeNull();
    expect(orderNextStep(order({ items: [{ id: "e", title: "E", quantity: 1, format: "ebook", digital: true }] }), new Set())).toBeNull();
  });
});
