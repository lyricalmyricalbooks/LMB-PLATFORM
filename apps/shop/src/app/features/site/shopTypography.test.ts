import { describe, expect, it } from "vitest";
import { shopTypographyCss, trackingEm } from "./shopTypography";
import { sectionHtmlHeadingCss } from "../../components/sectionRender";

describe("shopTypographyCss (Typography › Line height / Letter spacing)", () => {
  it("emits nothing at the defaults, so the shop looks as before", () => {
    expect(shopTypographyCss({})).toBe("");
    expect(shopTypographyCss({ lineHeight: 1.6, letterSpacing: "normal" })).toBe("");
  });

  it("moves Tailwind's line-height scale with the control", () => {
    const css = shopTypographyCss({ lineHeight: 2.4 });
    expect(css).toContain("[data-fm-store]{line-height:2.4;");
    expect(css).toContain("--text-base--line-height:2.25;"); // 1.5 × 2.4/1.6
    expect(css).toContain("--leading-normal:2.25;");
  });

  it("adds the chosen letter spacing to every tracking step", () => {
    expect(trackingEm("wide")).toBe(0.03);
    const css = shopTypographyCss({ letterSpacing: "ultra" });
    expect(css).toContain("letter-spacing:0.08em;");
    expect(css).toContain("--tracking-widest:0.18em;");
  });
});

describe("sectionHtmlHeadingCss (section › Style › heading controls on rich text)", () => {
  it("is empty when nothing is set", () => {
    expect(sectionHtmlHeadingCss("s1", {})).toBe("");
  });

  it("styles headings typed inside a rich-text field", () => {
    const css = sectionHtmlHeadingCss("s1", { headingColor: "#ff0000", headingSize: 40, headingWeight: "700", textTransform: "uppercase" });
    expect(css).toContain('[data-section-id="s1"]');
    expect(css).toContain("color:#ff0000;font-size:40px;font-weight:700;text-transform:uppercase");
  });

  it("refuses values that could break out of the rule", () => {
    expect(sectionHtmlHeadingCss("s1", { headingColor: "red;}body{display:none" })).toBe("");
  });
});
