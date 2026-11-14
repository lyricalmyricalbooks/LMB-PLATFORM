import { describe, expect, it } from "vitest";
import { footerShape, footerStyleCss } from "./footerStyle";

describe("footer shape", () => {
  it("reads only the named shapes", () => {
    expect(footerShape({ footerShape: "bigname" })).toBe("bigname");
    expect(footerShape({ footerShape: "nope" })).toBe("");
  });
  it("draws each shape with its own CSS and nothing extra for the standard footer", () => {
    expect(footerStyleCss({ footerShape: "centered" })).toContain("flex-direction:column");
    expect(footerStyleCss({ footerShape: "compact" })).toContain(".fm-footer-brand{display:none");
    expect(footerStyleCss({ footerShape: "bigname" })).toContain(".fm-footer-bigname");
    expect(footerStyleCss({})).not.toMatch(/fm-footer-bigname|fm-footer-main\{display:flex/);
  });
});
