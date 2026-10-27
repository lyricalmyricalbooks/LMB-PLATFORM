import { describe, it, expect } from "vitest";
import { nextCartQuantity } from "./CartContext";

describe("nextCartQuantity", () => {
  it("adds the requested quantity to the existing line", () => {
    expect(nextCartQuantity(2, 3)).toBe(5);
  });

  it("starts a new line at the requested quantity", () => {
    expect(nextCartQuantity(0, 4)).toBe(4);
  });

  it("clamps to the stock limit", () => {
    expect(nextCartQuantity(2, 5, 4)).toBe(4);
    expect(nextCartQuantity(0, 10, 3)).toBe(3);
  });

  it("treats 999 as untracked stock, capped at the 99 copies the server charges", () => {
    expect(nextCartQuantity(50, 30, 999)).toBe(80);
    expect(nextCartQuantity(500, 600, 999)).toBe(99);
    expect(nextCartQuantity(90, 20)).toBe(99);
  });

  it("floors and never adds less than 1", () => {
    expect(nextCartQuantity(1, 0)).toBe(2);
    expect(nextCartQuantity(1, -5)).toBe(2);
    expect(nextCartQuantity(1, 2.9)).toBe(3);
    expect(nextCartQuantity(1, NaN as any)).toBe(2);
  });
});
