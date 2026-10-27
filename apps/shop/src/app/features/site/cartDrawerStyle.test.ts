import { describe, it, expect } from "vitest";
import { cartDrawerCss, cartDrawerFontNames, cartDrawerWidth } from "./cartDrawerStyle";

describe("shopping bag style", () => {
  it("follows the theme tokens when nothing is set", () => {
    const css = cartDrawerCss({});
    expect(css).toContain(".fm-bag{background:var(--bg-color, Canvas)");
    expect(css).toContain("border-left:var(--rp-outline-w, 2px)");
    expect(css).toContain(".fm-bag .fm-bag-fill{height:100%;background:var(--accent)");
    expect(cartDrawerWidth({})).toBe(460);
    expect(cartDrawerFontNames({})).toEqual([]);
  });

  it("uses every Studio control and clamps numbers", () => {
    const css = cartDrawerCss({
      cartDrawerBg: "#111", cartDrawerSide: "left", cartDrawerEdgeWidth: 9, cartDrawerProgressColor: "#f00",
      cartDrawerTitleSize: 40, cartDrawerTitleCase: "none", cartDrawerCheckoutBg: "#0f0", cartDrawerCheckoutShadow: false,
      cartDrawerThumbWidth: 96, cartDrawerThumbOutline: false,
    });
    expect(css).toContain(".fm-bag{background:#111");
    expect(css).toContain("border-right:6px solid");
    expect(css).toContain("background:#f00");
    expect(css).toContain("font-size:40px;line-height:.95;text-transform:none");
    expect(css).toContain("background:#0f0");
    expect(css).toContain("width:96px;aspect-ratio:3/4;flex-shrink:0;overflow:hidden;background:var(--bag-surface);}");
    expect(css).not.toMatch(/\.fm-bag-cta\{[^}]*box-shadow:/);
    expect(cartDrawerWidth({ cartDrawerWidth: 9999 })).toBe(640);
    expect(cartDrawerFontNames({ cartDrawerTitleFont: "Anton", cartDrawerMetaFont: "DM Mono" })).toEqual(["Anton", "DM Mono"]);
  });

  it("strips characters that could break out of the style block", () => {
    expect(cartDrawerCss({ cartDrawerBg: "red;}</style><script>" })).not.toMatch(/<\/?s/);
  });
});
