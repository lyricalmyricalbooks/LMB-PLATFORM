import { describe, expect, it } from "vitest";
import { placeCounts } from "@stockroom/stock-places.js";
import { closePlace, moveCopies } from "./stockPlaces";

const book = { id: "b1", maxPrint: 100 };
const state = () => ({ hist: [{ qty: 10, price: 20, date: "2026-01-02", chan: "Shop" }], places: {} as Record<string, number> });

describe("stock places", () => {
  it("moves copies to a new place and back, same as the old app", () => {
    const s = moveCopies(book, { from: "Main", to: "Market stall", qty: 4, note: "Saturday" }, 1)(state());
    expect(s.places).toEqual({ "Market stall": 4 });
    expect((s as any).placeMoves[0]).toMatchObject({ from: "Main", to: "Market stall", qty: 4, note: "Saturday" });
    const closed = closePlace(book, "market stall")(s);
    expect(closed.places).toEqual({});
    expect(placeCounts(closed, book)[0].name).toBe("Main");
  });
  it("refuses more copies than a place holds", () => {
    const s = moveCopies(book, { from: "Main", to: "Studio", qty: 2 }, 1)(state());
    expect(() => moveCopies(book, { from: "Studio", to: "Main", qty: 3 })(s)).toThrow("Studio has 2 copies.");
  });
});
