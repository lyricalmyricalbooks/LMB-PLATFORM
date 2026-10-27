import { describe, expect, it } from "vitest";
import { magnifierLevel, magnifierOn, magnifierOrigin, MAGNIFIER_DEFAULT_LEVEL } from "./photoMagnifier";

describe("photo magnifier rules", () => {
  it("is off unless switched on", () => {
    expect(magnifierOn(undefined)).toBe(false);
    expect(magnifierOn({})).toBe(false);
    expect(magnifierOn({ showPdpMagnifier: "true" })).toBe(false);
    expect(magnifierOn({ showPdpMagnifier: true })).toBe(true);
  });

  it("keeps the strength between 1.5 and 4", () => {
    expect(magnifierLevel({})).toBe(MAGNIFIER_DEFAULT_LEVEL);
    expect(magnifierLevel({ pdpMagnifierLevel: "abc" })).toBe(MAGNIFIER_DEFAULT_LEVEL);
    expect(magnifierLevel({ pdpMagnifierLevel: 0 })).toBe(MAGNIFIER_DEFAULT_LEVEL);
    expect(magnifierLevel({ pdpMagnifierLevel: 1 })).toBe(1.5);
    expect(magnifierLevel({ pdpMagnifierLevel: 3 })).toBe(3);
    expect(magnifierLevel({ pdpMagnifierLevel: 9 })).toBe(4);
  });

  it("grows from the point under the mouse, clamped to the frame", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(magnifierOrigin(300, 150, rect)).toEqual({ x: 50, y: 50 });
    expect(magnifierOrigin(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(magnifierOrigin(0, 999, rect)).toEqual({ x: 0, y: 100 });
    expect(magnifierOrigin(200, 100, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 50, y: 50 });
  });
});
