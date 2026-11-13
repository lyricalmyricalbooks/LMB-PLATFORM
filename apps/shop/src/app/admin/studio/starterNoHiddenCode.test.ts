import { describe, expect, it } from "vitest";
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import { sectionShapeCss } from "../../components/sectionShape";
import { sectionStyleFields } from "./sectionStyleSchema";

describe("starter sites keep every look in named designer controls", () => {
  it("no starter section hides its look in custom code", () => {
    const offenders = (HOME_LAYOUT_TEMPLATES as any[]).flatMap((layout: any) =>
      (layout.sections || []).filter((s: any) => s.settings?.customCss || s.settings?.customClass).map((s: any) => `${layout.id}:${s.type}`));
    expect(offenders).toEqual([]);
  });

  it("every shape setting a starter uses is a control in the section panel", () => {
    const keys = new Set(sectionStyleFields().map((f: any) => f.key));
    for (const k of ["bgPattern", "panelFill", "outlineWidth", "outlineColor", "tilt", "outerGap", "boxMaxWidth", "overlapAbove", "headingLineHeight"]) expect(keys.has(k), k).toBe(true);
  });

  it("turns the controls into scoped CSS and ignores unsafe values", () => {
    const css = sectionShapeCss("a1", { bgPattern: "dots", outlineWidth: 4, tilt: "-1", overlapAbove: 96, headingLineHeight: 0.86, outlineColor: "red;}" });
    expect(css).toContain("#section-a1{");
    expect(css).toContain("border:4px solid currentColor");
    expect(css).toContain("rotate(-1deg)");
    expect(css).toContain("margin-top:-96px");
    expect(css).toContain("line-height:0.86");
    expect(sectionShapeCss("a1", {})).toBe("");
  });
});
