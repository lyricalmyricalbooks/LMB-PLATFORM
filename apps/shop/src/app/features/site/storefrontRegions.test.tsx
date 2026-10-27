import { layerDesign } from "./designModel";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGE_TEMPLATES } from "../../admin/ThemeEditorExtensions";
import { STATIC_SURFACES, STYLE_GROUPS, applyGlobalStyle } from "../../admin/studio/styleSchema";
import { storefrontRegionCss, regionProps, REGION_GROUPS } from "./storefrontRegions";

describe("page-by-page designer coverage", () => {
  it("offers every public page in Studio with its own section stack", () => {
    for (const id of ["wishlistPage", "accountPage", "trackingPage", "page404"]) {
      expect(PAGE_TEMPLATES.some(t => t.id === id)).toBe(true);
      expect(STATIC_SURFACES).toContain(id);
    }
  });
  it("preserves unrelated page-local region settings when applying one global field", () => {
    const d = { regions: { wishlistTitleSize: 12 }, wishlistPage: { regions: { wishlistCountVisible: false }, sections: [1] } };
    const next = applyGlobalStyle(d, "regions.wishlistTitleSize", 30, STATIC_SURFACES);
    expect(next.wishlistPage.regions).toEqual({ wishlistCountVisible: false });
    expect(layerDesign(next, next.wishlistPage).regions).toEqual({ wishlistTitleSize: 30, wishlistCountVisible: false });
    expect(next.wishlistPage.sections).toEqual([1]);
    expect(d.wishlistPage.regions).toEqual({ wishlistCountVisible: false });
  });
  it("changes actual DOM regions and retains required commerce controls", () => {
    const d = { regions: { wishlistCountVisible: false, wishlistTitleSize: 32, wishlistTitleColor: "#123456", checkoutFormVisible: false } };
    const html = renderToStaticMarkup(h("h1", regionProps("wishlistTitle"), "Saved"));
    expect(html).toContain('data-store-region="wishlistTitle"');
    expect(html).toContain("style:wishlistLayout");
    const css = storefrontRegionCss(d);
    expect(css).toContain('[data-store-region="wishlistCount"]{display:none !important;}');
    expect(css).toContain("font-size:32px !important;");
    expect(css).toContain("color:#123456 !important;");
    expect(css).not.toContain('[data-store-region="checkoutForm"]{display:none');
    expect(storefrontRegionCss({})).toBe("");
  });
  it("connects every new region control to a rendered public element", () => {
    for (const group of REGION_GROUPS) {
      const sources = group.files.map(f => readFileSync(join(__dirname, "..", "..", f), "utf8")).join("\n");
      const fields = STYLE_GROUPS.find(g => g.id === group.id)!.fields;
      for (const r of group.regions) {
        expect(sources, r.id).toContain(`regionProps("${r.id}")`);
        expect(fields.some(f => f.key === `regions.${r.id}Padding`)).toBe(true);
      }
    }
  });
});
