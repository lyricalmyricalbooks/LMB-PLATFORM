import { describe, it, expect } from "vitest";
import { buildCatalogSearchIndex, orderMatches } from "./orderSearch";
import { batchDispatchFields, deleteRefusal, listDate, orderDate, orderMoney, splitDeletable } from "./orderListHelpers";

const order = {
  id: "doc1", orderId: "FRQZ-047691-K2XP",
  customer: { name: "Jane Doe", email: "jane@example.com", phone: "(416) 555-0100", address: { zip: "M5V 2T6" } },
  items: [{ id: "b1", variantId: "v1", title: "Night Poems", variantName: "Hardcover", sku: "LM-7", quantity: 1 }],
};

describe("orderMatches (desk and table share it)", () => {
  it("matches order number with # and spaces, email, name, phone, postal code", () => {
    for (const q of ["#FRQZ-047691", "frqz 047691", "jane@example", "doe jane", "4165550100", "m5v2t6", "M5V 2T6"]) expect(orderMatches(order, q)).toBe(true);
    expect(orderMatches(order, "nobody")).toBe(false);
  });
  it("matches book title, edition name and SKU on the line, ISBN from the catalog", () => {
    expect(orderMatches(order, "night poems")).toBe(true);
    expect(orderMatches(order, "hardcover")).toBe(true);
    expect(orderMatches(order, "lm-7")).toBe(true);
    expect(orderMatches(order, "978-1-23")).toBe(false);
    const catalog = buildCatalogSearchIndex([{ id: "b1", isbn: "9781234567897", variants: [{ id: "v1", name: "Hardcover", isbn: "9780000000002" }] }]);
    expect(orderMatches(order, "978-1-234", catalog)).toBe(true);
    expect(orderMatches(order, "9780000000002", catalog)).toBe(true);
  });
});

describe("order list helpers", () => {
  it("money shows CA$ and the paid currency when different", () => {
    expect(orderMoney({ total: 12 })).toEqual({ text: "CA$12.00", paid: "" });
    expect(orderMoney({ total: 12, expectedCurrency: "usd", expectedAmountMinor: 900 }).paid).toBe("US$9.00");
  });
  it("dates add the year only outside the current year; paid date wins", () => {
    const now = new Date("2026-10-09T12:00:00");
    expect(listDate("2026-03-04T12:00:00", now)).not.toMatch(/2026/);
    expect(listDate("2025-03-04T12:00:00", now)).toMatch(/2025/);
    expect(orderDate({ createdAt: "a", paidAt: "b" })).toBe("b");
    expect(orderDate({ createdAt: "a" })).toBe("a");
  });
  it("only unpaid, cancelled and test orders can be deleted", () => {
    expect(deleteRefusal({ paymentStatus: "unpaid" })).toBe("");
    expect(deleteRefusal({ paymentStatus: "unpaid", status: "cancelled" })).toBe("");
    expect(deleteRefusal({ paymentStatus: "paid", isTest: true })).toBe("");
    for (const o of [{ paymentStatus: "paid" }, { paymentStatus: "refunded" }, { paymentStatus: "unpaid", partiallyRefunded: true },
      { paymentStatus: "unpaid", fulfillmentStatus: "shipped" }, { paymentStatus: "unpaid", reconciliationPending: { provider: "stripe" } }]) {
      expect(deleteRefusal(o)).not.toBe("");
    }
    const split = splitDeletable([{ id: "a", paymentStatus: "unpaid" }, { id: "b", paymentStatus: "paid" }]);
    expect(split.allowed.map((o) => o.id)).toEqual(["a"]);
    expect(split.refused[0].order.id).toBe("b");
  });
  it("batch ship uses the label's own carrier and never guesses Canada Post", () => {
    expect(batchDispatchFields({ labelUrl: "x", trackingNumber: "1Z", trackingCarrier: "UPS" })).toMatchObject({ trackingCarrier: "UPS" });
    expect(batchDispatchFields({ labelUrl: "x", trackingNumber: "1Z" })).toHaveProperty("problem");
    expect(batchDispatchFields({ trackingNumber: "1Z", trackingCarrier: "UPS" })).toHaveProperty("problem");
  });
});
