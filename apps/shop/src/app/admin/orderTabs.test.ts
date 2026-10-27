import { describe, expect, it } from "vitest";
import { matchesOrderTab } from "./orderTabs";

describe("orderTabs", () => {
  it("To ship = paid and not yet shipped/cancelled", () => {
    expect(matchesOrderTab({ paymentStatus: "paid", status: "open" }, "To ship")).toBe(true);
    expect(matchesOrderTab({ paymentStatus: "paid", fulfillmentStatus: "processing" }, "To ship")).toBe(true);
    expect(matchesOrderTab({ paymentStatus: "paid", fulfillmentStatus: "shipped" }, "To ship")).toBe(false);
    expect(matchesOrderTab({ paymentStatus: "paid", status: "cancelled" }, "To ship")).toBe(false);
    expect(matchesOrderTab({ paymentStatus: "unpaid" }, "To ship")).toBe(false);
  });
  it("Unpaid excludes refunded and cancelled", () => {
    expect(matchesOrderTab({ paymentStatus: "unpaid", status: "open" }, "Unpaid")).toBe(true);
    expect(matchesOrderTab({ paymentStatus: "refunded" }, "Unpaid")).toBe(false);
    expect(matchesOrderTab({ paymentStatus: "unpaid", status: "cancelled" }, "Unpaid")).toBe(false);
  });
});
