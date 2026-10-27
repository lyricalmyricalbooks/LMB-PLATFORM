import { describe, expect, it } from "vitest";
import { daysLeft, soldInWindow } from "./overviewDaysLeft";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const order = (daysAgo: number, items: any[]) => ({ createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(), items });

describe("Running low as days left", () => {
  const paid = [
    order(2, [{ id: "b1", quantity: 2 }, { id: "b2", variantId: "signed", quantity: 1 }]),
    order(10, [{ id: "b1", quantity: 1 }, { id: "b2", variantId: "plain", quantity: 4 }]),
    order(45, [{ id: "b1", quantity: 9 }]),
  ];

  it("counts copies of the row's book and edition in the last 30 days only", () => {
    expect(soldInWindow(paid, { bookId: "b1", variantId: null }, NOW)).toBe(3);
    expect(soldInWindow(paid, { bookId: "b2", variantId: "signed" }, NOW)).toBe(1);
    expect(soldInWindow(paid, { bookId: "b2", variantId: "plain" }, NOW)).toBe(4);
    expect(soldInWindow(paid, { bookId: "b2", variantId: null }, NOW)).toBe(0);
  });

  it("turns stock and pace into days", () => {
    expect(daysLeft(3, 3)).toBe(30);
    expect(daysLeft(5, 30)).toBe(5);
    expect(daysLeft(0, 4)).toBe(0);
    expect(daysLeft(-1, 0)).toBe(0);
    expect(daysLeft(4, 0)).toBeNull();
  });
});
