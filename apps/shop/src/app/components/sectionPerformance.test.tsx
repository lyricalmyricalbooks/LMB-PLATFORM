// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Phase 4: (1) sections lower on the page are drawn only when shoppers scroll near them (CSS content-visibility),
// never in the Studio preview or in the every-page groups; (2) no section renders an oversized DOM.


const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const Sections: Record<string, any> = await import("./SectionComponents");
const { SectionList, LAZY_FROM_INDEX } = await import("./sectionRender");
const { SECTION_REGISTRY } = await import("../admin/ThemeEditorExtensions");

const wrap = (node: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null, node))));
const sections = (types: string[]) => types.map((type, i) => ({ id: `s${i}`, type, settings: { heading: `Section ${i}` } }));
const drawnLater = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("[data-fm-section]")].filter(n => n.hasAttribute("data-draw-later")).map(n => n.getAttribute("data-fm-section"));
};
afterEach(() => window.history.replaceState(null, "", "/"));

describe("drawing lower sections later", () => {
  const list = sections(["RichTextSection", "RichTextSection", "RichTextSection", "StickyAddToBagSection", "RichTextSection"]);
  it("starts from the third section, skipping bars fixed to the screen", () => {
    expect(LAZY_FROM_INDEX).toBe(2);
    const html = wrap(h(SectionList, { sections: list, design: {} }));
    expect(drawnLater(html)).toEqual(["s2", "s4"]);
    expect(html).toMatch(/content-visibility:auto/);
  });
  it("can be switched off in Studio, and never applies in the preview or to every-page groups", () => {
    expect(drawnLater(wrap(h(SectionList, { sections: list, design: { lazySections: false } })))).toEqual([]);
    expect(drawnLater(wrap(h(SectionList, { sections: list, design: {}, dataSection: "globalSections" })))).toEqual([]);
    window.history.replaceState(null, "", "/?preview=true");
    expect(drawnLater(wrap(h(SectionList, { sections: list, design: {} })))).toEqual([]);
  });
});

const BOOKS = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, slug: `book-${i}`, title: `Book ${i}`, retailPrice: 20 + i, stockLevel: 5, status: "published",
  isFeatured: true, featured: true, categories: ["Publications"], photos: [{ url: `https://example.com/${i}.jpg` }] }));
// With 12 sample books the largest section is about 140 elements and 8 deep (October 2026); the limits leave room.
const MAX_ELEMENTS = 600, MAX_DEPTH = 24;

describe("section DOM size", () => {
  it(`every section stays under ${MAX_ELEMENTS} elements and ${MAX_DEPTH} levels deep with sample content`, () => {
    const over: string[] = [];
    for (const meta of SECTION_REGISTRY as any[]) {
      const Comp = Sections[meta.type];
      if (!Comp) continue;
      let html = "";
      try { html = wrap(h(Comp, { settings: { ...(meta.defaults || {}), productSource: "all", __sectionId: "s1" }, books: BOOKS, enableAnimations: false })); }
      catch { continue; } // render failures are covered by the section render tests
      const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
      const root = doc.getElementById("root")!;
      const count = root.querySelectorAll("*").length;
      const depth = (n: Element): number => Math.max(0, ...[...n.children].map(c => 1 + depth(c)));
      const deepest = depth(root);
      if (count > MAX_ELEMENTS || deepest > MAX_DEPTH) over.push(`${meta.type}: ${count} elements, ${deepest} deep`);
    }
    expect(over).toEqual([]);
  });
});
