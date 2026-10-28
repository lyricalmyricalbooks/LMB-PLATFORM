import { describe, expect, it } from "vitest";
import { MARQUEE_CSS, SHELF_CSS, TEMPLATE_STYLE_IDS, templateStyleId, themeStyleCss } from "./templateStyles";
import { RISO_STOREFRONT_CSS } from "./themeTokens";

describe("full storefront templates", () => {
  it.each([["marquee", MARQUEE_CSS], ["shelf", SHELF_CSS]])("%s is scoped to the storefront and token-driven", (_id, css) => {
    expect(css).toContain("[data-fm-store]");
    // No literal colours: every colour comes from a Studio-editable token.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("picks the stylesheet from the design's print style", () => {
    expect(themeStyleCss({ themeStyle: "marquee" })).toContain(MARQUEE_CSS);
    expect(themeStyleCss({ themeStyle: "shelf" })).toContain(SHELF_CSS);
    expect(themeStyleCss({ themeStyle: "riso" })).toContain(RISO_STOREFRONT_CSS);
    expect(themeStyleCss({ themeStyle: "default" })).toBe("");
    expect(themeStyleCss({})).toBe("");
    expect(themeStyleCss(null)).toBe("");
  });

  it("names exactly the templates it draws", () => {
    expect([...TEMPLATE_STYLE_IDS]).toEqual(["marquee", "shelf"]);
    expect(templateStyleId({ themeStyle: "shelf" })).toBe("shelf");
    expect(templateStyleId({ themeStyle: "riso" })).toBe("");
  });
});
