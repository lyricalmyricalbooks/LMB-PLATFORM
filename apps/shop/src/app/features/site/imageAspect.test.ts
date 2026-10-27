import { describe, expect, it } from "vitest";
import { aspectRatioValue } from "./imageAspect";

describe("aspectRatioValue", () => {
  it("maps Studio shapes to CSS", () => {
    expect(aspectRatioValue("3:4")).toBe("3 / 4");
    expect(aspectRatioValue("16:9")).toBe("16 / 9");
    expect(aspectRatioValue("4:5")).toBe("4 / 5");
  });
  it("falls back on junk", () => {
    expect(aspectRatioValue(undefined)).toBe("3 / 4");
    expect(aspectRatioValue("0:4")).toBe("3 / 4");
    expect(aspectRatioValue("tall")).toBe("3 / 4");
  });
});
