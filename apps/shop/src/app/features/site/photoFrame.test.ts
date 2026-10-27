import { describe, it, expect } from "vitest";
import { aspectNumber, frameAspect, frameMode, photoRatio } from "./photoFrame";

describe("adaptive product photo frames", () => {
  it("keeps today's single shape unless the owner turns adapting on", () => {
    expect(frameMode(undefined)).toBe("fixed");
    expect(frameAspect("fixed", 1.5, "3 / 4", "16:9")).toBe("3 / 4");
  });
  it("gives wide photos the landscape shape and upright photos the regular one", () => {
    expect(frameAspect("orientation", 1.5, "3 / 4", "16:9")).toBe("16 / 9");
    expect(frameAspect("orientation", 1.5, "3 / 4", undefined)).toBe("3 / 2");
    expect(frameAspect("orientation", 0.7, "3 / 4", "16:9")).toBe("3 / 4");
    expect(frameAspect("orientation", 1.02, "3 / 4", "16:9")).toBe("1 / 1");
  });
  it("matches each photo exactly, within sane limits", () => {
    expect(frameAspect("exact", 1.5, "3 / 4", "")).toBe("1500 / 1000");
    expect(frameAspect("exact", 20, "3 / 4", "")).toBe("4000 / 1000");
  });
  it("uses the regular shape until a photo is measured", () => {
    expect(frameAspect("exact", undefined, "4 / 5", "")).toBe("4 / 5");
    expect(photoRatio(0, 10)).toBeUndefined();
    expect(photoRatio(300, 200)).toBe(1.5);
  });
});

describe("aspectNumber", () => {
  it("reads a frame shape as width ÷ height", () => {
    expect(aspectNumber("3 / 4")).toBe(0.75);
    expect(aspectNumber("1250 / 1000")).toBe(1.25);
    expect(aspectNumber("auto")).toBeUndefined();
    expect(aspectNumber("0 / 4")).toBeUndefined();
  });
});
