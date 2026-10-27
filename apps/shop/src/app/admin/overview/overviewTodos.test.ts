import { describe, expect, it } from "vitest";
import { newestSales, orderStatusWords, orderTodos } from "./overviewInsights";

const NOW2 = Date.parse("2026-10-01T12:00:00Z");

describe("run sheet and newest orders", () => {
  it("counts open requests, missing gift cards and leaves out test orders", () => {
    const t = orderTodos([
      { paymentStatus: "paid", customerRequest: { status: "open" } },
      { paymentStatus: "paid", isTest: true, customerRequest: { status: "open" } },
      { paymentStatus: "paid", paidAt: "2026-10-01T10:00:00Z", items: [{ giftCard: true }] },
      { paymentStatus: "paid", paidAt: "2026-10-01T11:55:00Z", items: [{ giftCard: true }] },
    ], NOW2);
    expect(t.requests).toHaveLength(1);
    expect(t.giftCardsMissing).toHaveLength(1);
  });
  it("newest orders are real sales only, newest first", () => {
    const rows = newestSales([
      { id: "u", paymentStatus: "unpaid", createdAt: "2026-10-01" },
      { id: "a", paymentStatus: "paid", createdAt: "2026-09-01" },
      { id: "b", paymentStatus: "refunded", createdAt: "2026-09-20" },
      { id: "t", paymentStatus: "paid", isTest: true, createdAt: "2026-09-30" },
    ]);
    expect(rows.map((o) => o.id)).toEqual(["b", "a"]);
    expect(orderStatusWords(rows[0])).toBe("Refunded");
  });
});
