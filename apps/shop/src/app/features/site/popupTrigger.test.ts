import { describe, expect, it } from "vitest";
import { leavingThroughTop, popupScrollPercent, popupTriggerOf, scrolledPast } from "./sectionGroups";

describe("pop-up trigger rules", () => {
  it("defaults to the delay (today's behaviour)", () => {
    expect(popupTriggerOf(undefined)).toBe("delay");
    expect(popupTriggerOf({ popupTrigger: "nonsense" })).toBe("delay");
    expect(popupTriggerOf({ popupTrigger: "exit" })).toBe("exit");
    expect(popupTriggerOf({ popupTrigger: "scroll" })).toBe("scroll");
  });
  it("clamps the scroll percentage", () => {
    expect(popupScrollPercent({})).toBe(50);
    expect(popupScrollPercent({ popupScrollPercent: 3 })).toBe(10);
    expect(popupScrollPercent({ popupScrollPercent: 200 })).toBe(90);
    expect(popupScrollPercent({ popupScrollPercent: "x" })).toBe(50);
  });
  it("measures scrolling against the scrollable room", () => {
    expect(scrolledPast(0, 800, 800, 50)).toBe(true);
    expect(scrolledPast(499, 1000, 2000, 50)).toBe(false);
    expect(scrolledPast(500, 1000, 2000, 50)).toBe(true);
  });
  it("counts only a mouse leaving through the top edge", () => {
    expect(leavingThroughTop({ clientY: 0 })).toBe(true);
    expect(leavingThroughTop({ clientY: -5, relatedTarget: null })).toBe(true);
    expect(leavingThroughTop({ clientY: 5 })).toBe(false);
    expect(leavingThroughTop({ clientY: -5, relatedTarget: {} })).toBe(false);
  });
});
