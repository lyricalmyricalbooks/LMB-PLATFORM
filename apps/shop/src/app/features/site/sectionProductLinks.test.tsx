import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Product cards in the home page's product sections are real links (designer agent run, 26 November 2026): a shopper
// can open one in a new tab, and search engines follow them from the home page to each product. Before, they were a
// button or a clickable box with no address.

const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../../CurrencyContext");
const { CartProvider } = await import("../../CartContext");
const Sections: Record<string, any> = await import("../../components/SectionComponents");
const { SECTION_REGISTRY } = await import("../../admin/ThemeEditorExtensions");

const BOOKS = [
  { id: "b1", slug: "zqx-one", title: "Zqx Card One", retailPrice: 30, stockLevel: 5, status: "published", isFeatured: true, featured: true, categories: ["Publications"], photos: [{ url: "https://example.com/1.jpg" }] },
  { id: "b2", slug: "zqx-two", title: "Zqx Card Two", retailPrice: 25, stockLevel: 3, status: "published", isFeatured: true, featured: true, categories: ["Zines"], photos: [{ url: "https://example.com/2.jpg" }] },
];

const render = (type: string) => renderToStaticMarkup(
  h(StaticRouter, { location: "/" },
    h(CurrencyProvider, null,
      h(CartProvider, null,
        h(Sections[type], { settings: { ...(SECTION_REGISTRY.find((m: any) => m.type === type)?.defaults || {}), productSource: "all", __sectionId: "s1" }, books: BOOKS, enableAnimations: false })))),
);

describe("product cards in page sections link to the product", () => {
  for (const type of ["ProductGridHeaderSection", "ProductShowcaseGridSection", "FeaturedCollectionSection"]) {
    it(`${type}: each card is a link to its product page`, () => {
      const html = render(type);
      expect(html).toMatch(/<a[^>]*href="\/books\/zqx-one"/);
      expect(html).toMatch(/<a[^>]*href="\/books\/zqx-two"/);
      // No clickable boxes pretending to be links, and no button inside a link.
      expect(html).not.toContain('role="link"');
      expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*<button/s);
    });
  }
});
