import { describe, expect, it } from "vitest";
import { FOOTER_DESIGN_OPTIONS, FOOTER_DESIGNS, footerDesign, footerDesignCss, giantNameSize } from "./footerStyle";
import { HEADER_LAYOUT_OPTIONS, HEADER_LAYOUTS, headerLayout, RAIL_HEADER_CSS } from "./headerLayout";
import { PDP_LAYOUT_OPTIONS, PDP_LAYOUTS, productPageLayout, productPageLayoutCss } from "./productPageStyle";
import { CARD_DESIGN_OPTIONS, CARD_DESIGNS, cardDesign, cardDesignCss, SHOP_PAGE_LAYOUT_OPTIONS, SHOP_PAGE_LAYOUTS, shopPageLayout, shopPageLayoutCss } from "./cardTypography";

describe("frame designs: header and footer", () => {
  it("leaves every existing shop as it was", () => {
    expect(footerDesign({})).toBe("");
    expect(footerDesignCss({})).toBe("");
    expect(footerDesign({ footerDesign: "made-up" })).toBe("");
    expect(headerLayout({ catalogLayoutStyle: "modern" })).toBe("modern");
  });
  it("offers every footer design and the side menu in Studio", () => {
    expect(FOOTER_DESIGN_OPTIONS.map(o => o.value)).toEqual([...FOOTER_DESIGNS]);
    expect(HEADER_LAYOUT_OPTIONS.map(o => o.value)).toContain("rail");
    expect(HEADER_LAYOUTS).toContain("rail");
    expect(headerLayout({ headerLayout: "rail" })).toBe("rail");
  });
  it("gives every footer design its own rules", () => {
    const css = FOOTER_DESIGNS.filter(Boolean).map(d => footerDesignCss({ footerDesign: d }));
    css.forEach(c => expect(c.length).toBeGreaterThan(40));
    expect(new Set(css).size).toBe(css.length);
  });
  it("sizes the big name to fit, short or long", () => {
    expect(giantNameSize("Ink")).toContain("37.50vw");
    expect(giantNameSize("A very long shop name indeed")).toContain("5.36vw");
  });
  it("keeps the side menu to computers", () => {
    expect(RAIL_HEADER_CSS.startsWith("@media (min-width:1024px)")).toBe(true);
  });
});

describe("frame designs: product page, cards, shop page and bag", () => {
  it("leaves every existing shop as it was", () => {
    expect(productPageLayout({})).toBe("");
    expect(productPageLayoutCss({})).toBe("");
    expect(cardDesign({})).toBe("");
    expect(cardDesignCss({})).toBe("");
    expect(shopPageLayout({})).toBe("");
    expect(shopPageLayoutCss({})).toBe("");
    expect(productPageLayout({ pdpLayout: "made-up" })).toBe("");
  });
  it("offers every design in Studio", () => {
    expect(PDP_LAYOUT_OPTIONS.map(o => o.value)).toEqual([...PDP_LAYOUTS]);
    expect(CARD_DESIGN_OPTIONS.map(o => o.value)).toEqual([...CARD_DESIGNS]);
    expect(SHOP_PAGE_LAYOUT_OPTIONS.map(o => o.value)).toEqual([...SHOP_PAGE_LAYOUTS]);
  });
  it("gives every design its own rules", () => {
    const sets: [readonly string[], (v: string) => string][] = [
      [PDP_LAYOUTS, v => productPageLayoutCss({ pdpLayout: v })],
      [CARD_DESIGNS, v => cardDesignCss({ cardDesign: v })],
      [SHOP_PAGE_LAYOUTS, v => shopPageLayoutCss({ shopPageLayout: v })],
    ];
    for (const [values, css] of sets) {
      const out = values.filter(Boolean).map(css);
      out.forEach(c => expect(c.length).toBeGreaterThan(40));
      expect(new Set(out).size).toBe(out.length);
    }
  });
  it("numbers cards from 01 in each grid", () => {
    expect(cardDesignCss({ cardDesign: "numbered" })).toContain("counter-reset");
  });
});
