import { describe, expect, it } from "vitest";
import { backToTopOn, backToTopShown, backToTopSide } from "./backToTop";

describe("back to top button", () => {
  it("is off unless switched on", () => {
    expect(backToTopOn({})).toBe(false);
    expect(backToTopOn(undefined)).toBe(false);
    expect(backToTopOn({ showBackToTop: true })).toBe(true);
  });
  it("sits bottom right unless left is chosen", () => {
    expect(backToTopSide({})).toBe("right");
    expect(backToTopSide({ backToTopPosition: "left" })).toBe("left");
    expect(backToTopSide({ backToTopPosition: "middle" })).toBe("right");
  });
  it("appears only after one and a half screens", () => {
    expect(backToTopShown(0, 800)).toBe(false);
    expect(backToTopShown(1200, 800)).toBe(false);
    expect(backToTopShown(1201, 800)).toBe(true);
    expect(backToTopShown(5000, 0)).toBe(false);
  });
});
