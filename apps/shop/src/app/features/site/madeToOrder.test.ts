import { describe, expect, test } from "vitest";
import { madeToOrderTime, MADE_TO_ORDER_MAX } from "./madeToOrder";
import { bagShipsOnSchedule } from "./bagShipBy";

describe("madeToOrderTime", () => {
  test("is empty for a product with none", () => {
    expect(madeToOrderTime(null)).toBe("");
    expect(madeToOrderTime({})).toBe("");
    expect(madeToOrderTime({ madeToOrderTime: "   " })).toBe("");
  });
  test("tidies the owner's words and caps their length", () => {
    expect(madeToOrderTime({ madeToOrderTime: "  2 to   3 weeks " })).toBe("2 to 3 weeks");
    expect(madeToOrderTime({ madeToOrderTime: "x".repeat(200) })).toHaveLength(MADE_TO_ORDER_MAX);
  });
  test("a made-to-order line keeps the bag's quick 'ships by' line off", () => {
    const line = { id: "tee", price: 30, quantity: 1 };
    const tee = (extra: object) => new Map<string, any>([["tee", { id: "tee", title: "Tee", format: "Apparel", physical: true, trackInventory: true, stockLevel: 5, ...extra }]]);
    const on = bagShipsOnSchedule([line] as any, tee({}));
    const off = bagShipsOnSchedule([line] as any, tee({ madeToOrderTime: "2 to 3 weeks" }));
    expect(on).toBe(true);
    expect(off).toBe(false);
  });
});
