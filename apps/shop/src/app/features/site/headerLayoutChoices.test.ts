import { describe, expect, it } from "vitest";
import { headerLayout, HEADER_LAYOUT_OPTIONS } from "./headerLayout";
import { usesReferenceHeader } from "./navItems";

describe("header layout choices", () => {
  it("offers centred and minimal headers that draw the one-bar header, not the masthead", () => {
    for (const l of ["centered", "minimal"]) {
      expect(HEADER_LAYOUT_OPTIONS.some(o => o.value === l)).toBe(true);
      expect(headerLayout({ headerLayout: l })).toBe(l);
      expect(usesReferenceHeader({ headerLayout: l })).toBe(false);
    }
  });
  it("still falls back to the shop page layout for an unknown value", () => {
    expect(headerLayout({ headerLayout: "nope", catalogLayoutStyle: "modern" })).toBe("modern");
    expect(headerLayout({})).toBe("classic");
  });
});
