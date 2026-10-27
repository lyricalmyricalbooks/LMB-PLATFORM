import { describe, expect, it } from "vitest";
import { bestFirst } from "./FulfillmentMethodPicker";
describe("shipping option order", () => {
  it("puts cheapest first, then quickest for equal prices", () => {
    const rates = [
      { id: "p", name: "Priority", price: 16.71, deliveryDays: "1" },
      { id: "r", name: "Regular", price: 11.45, deliveryDays: "6" },
      { id: "e", name: "Expedited", price: 11.45, deliveryDays: "3" },
      { id: "n", name: "Unknown", price: 11.45 },
      { id: "x", name: "Xpresspost", price: 11.77, deliveryDays: "2" },
    ];
    expect([...rates].sort(bestFirst).map(r => r.id)).toEqual(["e", "r", "n", "x", "p"]);
  });
});
