import { describe, expect, it } from "vitest";
import { fillsScreen, isDesktopWidth, screenForWidth } from "./previewWidth";

describe("desktop preview width", () => {
  it("keeps the screen when the column fits", () => {
    expect(screenForWidth(1200, 1100)).toBe(1200);
    expect(screenForWidth(1440, 900)).toBe(1440); // never narrows by itself
  });
  it("widens to the smallest screen that shows the column", () => {
    expect(screenForWidth(1200, 1300)).toBe(1440);
    expect(screenForWidth(1200, 1600)).toBe(1920);
    expect(screenForWidth(1440, 1800)).toBe(1920);
    expect(screenForWidth(1200, 2200)).toBe(2560);
  });
  it("ignores junk", () => {
    expect(screenForWidth(1200, NaN)).toBe(1200);
    expect(isDesktopWidth(1440)).toBe(true);
    expect(isDesktopWidth("1440")).toBe(false);
  });
  it("says when a column fills the screen", () => {
    expect(fillsScreen(1200, 1200)).toBe(true);
    expect(fillsScreen(1440, 1200)).toBe(false);
  });
});
