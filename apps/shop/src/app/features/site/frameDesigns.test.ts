import { describe, expect, it } from "vitest";
import { FOOTER_DESIGN_OPTIONS, FOOTER_DESIGNS, footerDesign, footerDesignCss, giantNameSize } from "./footerStyle";
import { HEADER_LAYOUT_OPTIONS, HEADER_LAYOUTS, headerLayout, RAIL_HEADER_CSS } from "./headerLayout";

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
