import { describe, expect, it } from "vitest";
import { copyPlaceholders } from "./StudioCopyField";
import { pillRadius } from "../../features/site/headerNav";

describe("Text & labels fill-in words", () => {
  it("lists the {words} a default uses unless the hint already explains them", () => {
    expect(copyPlaceholders({ key: "a", label: "A", default: "Added {count} to your bag; {skipped} couldn't be added" }))
      .toEqual(["{count}", "{skipped}"]);
    expect(copyPlaceholders({ key: "b", label: "B", default: "Hi {design}", hint: "{design} is the design's name." })).toEqual([]);
    expect(copyPlaceholders({ key: "c", label: "C", default: "Plain words" })).toEqual([]);
  });
});

describe("sticker pill corners", () => {
  it("reads bare numbers as pixels and keeps CSS as typed", () => {
    expect(pillRadius(undefined)).toBe("14px 4px 14px 4px");
    expect(pillRadius("12")).toBe("12px");
    expect(pillRadius("14 4")).toBe("14px 4px");
    expect(pillRadius("50%")).toBe("50%");
    expect(pillRadius("14px 4px 14px 4px")).toBe("14px 4px 14px 4px");
  });
});
