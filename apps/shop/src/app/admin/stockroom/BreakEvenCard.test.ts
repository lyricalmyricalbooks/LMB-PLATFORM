import { describe, expect, it } from "vitest";
import { calculateBreakEven } from "../../../../../stockroom/src/lib/breakeven.js";
import { breakEvenOf } from "./BreakEvenCard";

const item = { revenue: 600, sold: 30, onHand: 10, currency: "CAD" };

describe("break-even per book", () => {
  it("matches the old stockroom's numbers on the same book", () => {
    const book = { productionCost: 1000, listPrice: 25 };
    const ours = breakEvenOf(item, book)!;
    const old = calculateBreakEven({ cost: 1000, recognizedRev: 600, listPrice: 25, sold: 30, stock: 10, currency: "CAD" });
    expect(ours).toMatchObject(old);
    expect(ours.remaining).toBe(400);
    expect(ours.unitsNeededAtList).toBe(16);
    expect(ours.stockDeficit).toBe(6);
  });
  it("shows nothing without a production cost", () => {
    expect(breakEvenOf(item, { listPrice: 25 })).toBeNull();
    expect(breakEvenOf(item, null)).toBeNull();
  });
  it("says done once revenue covers the cost", () => {
    expect(breakEvenOf(item, { productionCost: 500, listPrice: 25 })!.broken).toBe(true);
  });
});
