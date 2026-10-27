import { describe, expect, it } from "vitest";
import { cardRating, starStates } from "./cardRating";

describe("cardRating", () => {
  it("rounds stars to a half and the average to one decimal", () => {
    expect(cardRating({ count: 3, average: 4.26 })).toEqual({ stars: 4.5, average: "4.3", count: 3 });
    expect(cardRating({ count: 1, average: 5 })).toEqual({ stars: 5, average: "5.0", count: 1 });
    expect(cardRating({ count: 7, average: 3.2 })).toEqual({ stars: 3, average: "3.2", count: 7 });
  });
  it("draws nothing without approved reviews or with a broken average", () => {
    expect(cardRating({ count: 0, average: 0 })).toBeNull();
    expect(cardRating({ count: 2, average: 0 })).toBeNull();
    expect(cardRating({ count: 2, average: 6 })).toBeNull();
    expect(cardRating({ count: "x", average: 4 })).toBeNull();
    expect(cardRating(null)).toBeNull();
  });
  it("turns stars into five glyph states", () => {
    expect(starStates(3.5)).toEqual(["full", "full", "full", "half", "empty"]);
    expect(starStates(5)).toEqual(["full", "full", "full", "full", "full"]);
  });
});
