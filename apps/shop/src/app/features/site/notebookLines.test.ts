import { describe, expect, it } from "vitest";
import { descriptionTextCss } from "./productPageStyle";

describe("notebook lines (pdpRuledEveryLine)", () => {
  it("draws nothing extra when the switch is off", () => {
    expect(descriptionTextCss({})).not.toContain("fm-pdp-desc-ruled");
  });
  it("rules every line at exactly the line height, in px", () => {
    const css = descriptionTextCss({ pdpRuledEveryLine: true });
    expect(css).toContain("font-size:15px;line-height:30px;");
    expect(css).toContain("transparent 29px,rgba(var(--border-rgb), 0.45) 29px,rgba(var(--border-rgb), 0.45) 30px");
    expect(css).toMatch(/fm-pdp-desc-ruled\{border-top:1px solid/);
  });
  it("follows the Description size, phone size and an airy line height", () => {
    const css = descriptionTextCss({ pdpRuledEveryLine: true, pdpDescSize: 16, pdpDescSizeMobile: 14, pdpDescLineHeight: 2.2 });
    expect(css).toContain("font-size:16px;line-height:35px;");
    expect(css).toMatch(/@media \(max-width:767px\)\{[^}]*font-size:14px;line-height:31px;/);
  });
  it("keeps headings, lists and dividers on the line grid and wins over paragraph rules", () => {
    const css = descriptionTextCss({ pdpRuledEveryLine: true, pdpRuledText: true });
    expect(css).not.toContain("padding-top:12px;margin-top:12px");
    expect(css).toContain(".fm-pdp-desc-rule{margin:0;height:30px;border:0;}");
    expect(css.lastIndexOf("margin:0;padding-top:0")).toBeGreaterThan(css.indexOf(".fm-pdp-desc-heading{font-family"));
  });
});
