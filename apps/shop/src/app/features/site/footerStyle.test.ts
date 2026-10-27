import { describe, it, expect } from "vitest";
import { footerBrandAlign, footerLinksAlign, footerStyleCss } from "./footerStyle";

describe("footer style controls", () => {
  it("uses the footer's own spacing when nothing is set and no colour overrides", () => {
    const css = footerStyleCss({ showFooterAccentLine: false, footerGroupHeadingsAccent: false, showFooterBrandDivider: false, footerSocialBoxes: false });
    expect(css).toContain(".fm-footer-main{padding-top:32px;padding-bottom:32px;}");
    expect(css).toContain(".fm-footer-groups{column-gap:64px;}");
    expect(css).toContain(".fm-footer-list>*+*{margin-top:8px;}");
    expect(css).toContain(".fm-footer-brand>[data-empty]{display:none !important;}");
    expect(css).toContain(".fm-footer-bar{padding-top:12px;padding-bottom:12px;}");
    expect(css).not.toContain("color:");
    expect(css).not.toContain("border-top-width:0");
  });

  it("applies spacing, colours and divider choices, clamped and sanitised", () => {
    const css = footerStyleCss({ footerPaddingY: 999, footerPaddingYMobile: 20, footerColumnGap: 80, footerLinkGap: 8, footerTextSize: 14,
      footerTextColor: "#eeeeee", footerHeadingColor: "#999999", footerLinkHoverColor: "#ff0", footerDividerColor: "red;}x{", showFooterDividers: false });
    expect(css).toContain("padding-top:160px");
    expect(css).toContain("padding-top:20px");
    expect(css).toContain("column-gap:80px");
    expect(css).toContain("margin-top:8px");
    expect(css).toContain("font-size:14px");
    expect(css).toContain("color:#eeeeee !important");
    expect(css).toContain(".fm-footer-heading{color:#999999 !important;}");
    expect(css).toContain("a:hover");
    expect(css).not.toContain("red;}x{");
    expect(css).toContain("border-top-width:0");
  });

  it("defaults the link groups to the right", () => {
    expect(footerLinksAlign({})).toBe("end");
    expect(footerLinksAlign({ footerLinksAlign: "spread" })).toBe("spread");
    expect(footerLinksAlign({ footerLinksAlign: "bogus" })).toBe("end");
  });

  it("defaults to the E3 look and lets every piece be switched off or recoloured", () => {
    const css = footerStyleCss({});
    expect(css).toContain("border-top:3px solid var(--accent, currentColor)");
    expect(css).toContain(".fm-footer-groups .fm-footer-heading{color:var(--accent, currentColor)");
    expect(css).toContain(".fm-footer-brand{max-width:none");
    expect(css).toContain("border-right:1px solid");
    expect(css).toContain(".fm-footer-icon-box{");
    const off = footerStyleCss({ showFooterAccentLine: false, footerGroupHeadingsAccent: false, footerBrandAlign: "start", showFooterBrandDivider: false, footerSocialBoxes: false });
    expect(off).not.toContain("border-top:3px");
    expect(off).not.toContain(".fm-footer-brand{max-width");
    expect(off).not.toContain("border-right:1px");
    expect(off).not.toContain(".fm-footer-icon-box");
    const custom = footerStyleCss({ footerAccentColor: "#ff6fae", footerAccentLineWidth: 6, footerHeadingColor: "#999" });
    expect(custom).toContain("border-top:6px solid #ff6fae");
    expect(custom).not.toContain(".fm-footer-groups .fm-footer-heading");
    expect(footerBrandAlign({ footerBrandAlign: "bogus" })).toBe("center");
  });

  it("centres the logo on phones, lines it up top on request and colours the square buttons on hover", () => {
    const css = footerStyleCss({});
    expect(css).not.toContain("@media (min-width:768px){[data-fm-footer] .fm-footer-brand{max-width:none");
    expect(css).toContain(".fm-footer-brand{max-width:none");
    expect(css).toContain("justify-content:center;text-align:center");
    expect(css).toContain(".fm-footer-icon-box:hover,[data-fm-footer] .fm-footer-icon-box:focus-visible{border-color:var(--accent, currentColor)");
    const top = footerStyleCss({ footerBrandVAlign: "top", footerBrandCenterMobile: false, footerSocialHoverColor: "#ff6fae" });
    expect(top).toContain("justify-content:flex-start");
    expect(top).toContain("@media (min-width:768px){[data-fm-footer] .fm-footer-brand{max-width:none");
    expect(top).toContain("border-color:#ff6fae !important");
  });
  it("gives phone footer links a 42px tap area without moving them, and keeps a larger Studio link gap", () => {
    const css = footerStyleCss({});
    const phone = css.slice(css.indexOf("@media(max-width:767px){[data-fm-footer] .fm-footer-main a"));
    expect(phone).toContain("::after{content:\"\";position:absolute");
    expect(phone).toContain("width:max(100%,42px);height:max(100%,42px)");
    expect(phone).toContain(".fm-footer-list>*+*{margin-top:22px;}");
    expect(phone).toContain(".fm-footer-legal{row-gap:22px;}");
    const wide = footerStyleCss({ footerLinkGap: 30 });
    expect(wide.slice(wide.indexOf("@media(max-width:767px){[data-fm-footer] .fm-footer-main a"))).toContain(".fm-footer-list>*+*{margin-top:30px;}");
    // Outside the phone query the Studio gap is untouched.
    expect(css).toContain("[data-fm-footer] .fm-footer-list>*+*{margin-top:8px;}");
  });
  it("leaves the payment icons as drawn until their strength or colour is changed", () => {
    const css = footerStyleCss({});
    expect(css).not.toContain("fm-footer-pay-icon");
    const faint = footerStyleCss({ footerPaymentIconOpacity: 80 });
    expect(faint).toContain("[data-fm-footer] .fm-footer-pay-icon{opacity:0.8 !important;}");
    expect(faint).toContain("[data-fm-footer] .fm-footer-pay-icon:hover{opacity:1 !important;}");
    expect(footerStyleCss({ footerPaymentIconColor: "#ff6fae" })).toContain(".fm-footer-pay-icons{color:#ff6fae !important;}");
    // A footer that follows a colour scheme takes the scheme's colours instead.
    expect(footerStyleCss({ footerPaymentIconColor: "#ff6fae", colorSchemes: [{ id: "s", v: 2, background: "#000" }], elementSchemes: { footer: "s" } })).not.toContain("#ff6fae");
  });
});
