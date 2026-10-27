import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import { DEFAULT_HOLD_LIMITS, holdLimitsFrom, holdWarnings } from "./holdLimits";

const server = createRequire(import.meta.url)("../../../../functions/stockHolds.js");
const books = (list: any[]) => new Map(list.map(b => [b.id, b]));

describe("hold limits (#45)", () => {
  test("defaults are today's numbers and match the server", () => {
    expect(DEFAULT_HOLD_LIMITS).toEqual(server.HOLD_LIMITS.owner);
    for (const saved of [undefined, {}, { stockHolds: { perBook: 40, units: 300, orders: 7 } }, { stockHolds: { perBook: 0, units: "x", orders: 99 } }, { stockHolds: { perBook: 100, units: 5000 } }]) {
      expect(holdLimitsFrom(saved)).toEqual(server.holdLimitsFrom(saved).owner);
    }
  });

  test("a bag over the per-title cap is flagged before Pay", () => {
    const map = books([{ id: "a", title: "Zine", trackInventory: true }]);
    const w = holdWarnings([{ id: "a", quantity: 12 }], map);
    expect(w).toEqual([{ kind: "perBook", id: "a", title: "Zine", count: 12, limit: 10 }]);
    expect(holdWarnings([{ id: "a", quantity: 12 }], map, { perBook: 20, units: 50, orders: 3 })).toEqual([]);
  });

  test("the total-units cap, box-set parts, untracked and backorder books", () => {
    const map = books([
      { id: "a", title: "A", trackInventory: true },
      { id: "b", title: "B", trackInventory: true },
      { id: "set", title: "Set", trackInventory: false, bundleItems: [{ bookId: "a", quantity: 2 }] },
      { id: "e", title: "Ebook", trackInventory: false },
      { id: "bo", title: "Backorder", trackInventory: true, allowBackorder: true },
    ]);
    expect(holdWarnings([{ id: "e", quantity: 99 }, { id: "bo", quantity: 99 }], map)).toEqual([]);
    expect(holdWarnings([{ id: "set", quantity: 6 }], map)).toEqual([{ kind: "perBook", id: "a", title: "A", count: 12, limit: 10 }]);
    const many = holdWarnings([{ id: "a", quantity: 10 }, { id: "b", quantity: 10 }, { id: "a", quantity: 1 }], map, { perBook: 10, units: 15, orders: 3 });
    expect(many.some(w => w.kind === "units" && w.count === 21)).toBe(true);
  });
});
