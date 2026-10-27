import { describe, expect, it } from "vitest";
import { phoneHeaderCss } from "./phoneHeader";
import { storefrontOverridesCss } from "./StorefrontOverrides";

describe("compact phone header", () => {
  it("is on by default and only applies below the phone breakpoint", () => {
    const css = phoneHeaderCss({});
    expect(css.startsWith("@media (max-width:767px)")).toBe(true);
    expect(css).toContain(".fm-announce");
    expect(css).toContain(".fm-hdr-row .fm-logo");
    expect(css).toContain("white-space:nowrap");
    expect(storefrontOverridesCss({})).toContain(".fm-hdr-cart");
  });
  it("puts the card price under the title on phones unless switched off", async () => {
    const { cardTypographyCss } = await import("./cardTypography");
    expect(cardTypographyCss({})).toContain(".fm-card-meta{flex-direction:column");
    expect(cardTypographyCss({ cardPriceStackPhone: false })).not.toContain(".fm-card-meta");
  });
  it("can be switched off in Studio", () => {
    expect(phoneHeaderCss({ phoneCompactHeader: false })).toBe("");
  });
});
