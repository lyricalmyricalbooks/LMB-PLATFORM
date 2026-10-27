import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Studio › Style › Product cards & grid (card title/price colour, size, weight, font…) only reaches a
// book card that carries the fm-card-* classes (features/site/cardTypography.ts). A card without them
// ignores the controls — in the Studio preview AND on the live site — which reads to the merchant as
// "my change doesn't show up". This renders every section type with sample books and fails when a
// book title is shown outside an `fm-card-title` element.


const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../../CurrencyContext");
const { CartProvider } = await import("../../CartContext");
const Sections: Record<string, any> = await import("../../components/SectionComponents");
const { SECTION_REGISTRY } = await import("../../admin/ThemeEditorExtensions");

const BOOKS = [
  { id: "b1", slug: "zqx-one", title: "Zqx Card One", retailPrice: 30, salePrice: 20, isOnSale: true, stockLevel: 5, status: "published", isFeatured: true, featured: true, categories: ["Publications"], photos: [{ url: "https://example.com/1.jpg" }] },
  { id: "b2", slug: "zqx-two", title: "Zqx Card Two", retailPrice: 25, stockLevel: 3, status: "published", isFeatured: true, featured: true, categories: ["Zines"], photos: [{ url: "https://example.com/2.jpg" }] },
];

/**
 * Sections that show a book title but are not product cards. Keep this tiny, with a reason each.
 * - FeaturedProductSection: a single-book hero; its title is a section heading with its own controls.
 * - StaffNotesTableSection: a table of staff notes; the title cell follows the section's heading style.
 */
const NOT_CARDS = new Set(["FeaturedProductSection", "StaffNotesTableSection"]);

function render(type: string, defaults: any) {
  const Comp = Sections[type];
  return renderToStaticMarkup(
    h(StaticRouter, { location: "/" },
      h(CurrencyProvider, null,
        h(CartProvider, null,
          h(Comp, { settings: { ...defaults, productSource: "all", __sectionId: "s1" }, books: BOOKS, enableAnimations: false })))),
  );
}

/** Opening tags whose direct text is a sample book title, and whether they carry fm-card-title. */
function titleElements(html: string) {
  const found: { tag: string; ok: boolean }[] = [];
  for (const { title } of BOOKS) {
    let at = html.indexOf(`>${title}<`);
    while (at !== -1) {
      const open = html.lastIndexOf("<", at);
      const tag = html.slice(open, at + 1);
      found.push({ tag, ok: /class="[^"]*\bfm-card-title\b/.test(tag) });
      at = html.indexOf(`>${title}<`, at + 1);
    }
  }
  return found;
}

describe("every book card opts into the Studio card controls", () => {
  it("renders at least the product-grid sections with sample books", () => {
    const shown = ["ProductGridHeaderSection", "ProductShowcaseGridSection"].map((t) =>
      titleElements(render(t, SECTION_REGISTRY.find((m: any) => m.type === t)?.defaults || {})).length);
    expect(shown.every((n) => n > 0)).toBe(true);
  });

  it("puts fm-card-title on every book title a section renders", () => {
    const missing: string[] = [], failed: string[] = [];
    for (const meta of SECTION_REGISTRY as any[]) {
      if (NOT_CARDS.has(meta.type) || !Sections[meta.type]) continue;
      let html = "";
      try { html = render(meta.type, meta.defaults || {}); } catch (e: any) { failed.push(`${meta.type}: ${e?.message}`); continue; }
      for (const el of titleElements(html)) if (!el.ok) missing.push(`${meta.type}: ${el.tag}`);
    }
    expect(missing).toEqual([]);
    // A section that cannot render here would escape this check — keep the list empty.
    expect(failed).toEqual([]);
  });

  it("marks the price of each product-grid card", () => {
    for (const t of ["ProductGridHeaderSection", "ProductShowcaseGridSection"]) {
      const html = render(t, SECTION_REGISTRY.find((m: any) => m.type === t)?.defaults || {});
      expect(html, t).toContain("fm-card-price-wrap");
      expect(html, t).toContain("fm-card-price");
    }
  });

  it("covers the storefront rows outside sections (related books, recently viewed)", () => {
    const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
    expect(src("RecentlyViewedRow.tsx")).toMatch(/fm-card-title/);
    const detail = src("BookDetail.tsx");
    expect(detail).toMatch(/fm-card-title[^"]*"[^>]*>\s*\{rel\.title\}/);
    expect(detail).toMatch(/fm-card-price-wrap/);
  });
});
