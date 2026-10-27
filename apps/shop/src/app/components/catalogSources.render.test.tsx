import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render equivalence for Studio 2.3: catalog sections saved before "Which books" sources existed
// show the same books in the same order, and the new sources reach the storefront renderers
// (including the shop's categories, which SectionList passes down with the page design).

const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const Sections: Record<string, any> = await import("./SectionComponents");
const { SectionList } = await import("./sectionRender");

const BOOKS = [
  { id: "b1", slug: "zqa", title: "Zqx Alpha", retailPrice: 30, stockLevel: 5, status: "published", isFeatured: true, categories: ["Poetry"], photos: [{ url: "https://example.com/1.jpg" }] },
  { id: "b2", slug: "zqb", title: "Zqx Bravo", retailPrice: 12, salePrice: 8, isOnSale: true, stockLevel: 3, status: "published", categories: ["Zines"], photos: [{ url: "https://example.com/2.jpg" }] },
  { id: "b3", slug: "zqc", title: "Zqx Charlie", retailPrice: 20, stockLevel: 3, status: "published", featured: true, categories: ["Small press"], photos: [{ url: "https://example.com/3.jpg" }] },
];
const wrap = (child: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null, child))));
const titlesIn = (html: string) => [...html.matchAll(/>(Zqx [A-Za-z]+)</g)].map((m) => m[1]).filter((t, i, all) => all.indexOf(t) === i);
const render = (type: string, settings: any) => titlesIn(wrap(h(Sections[type], { settings: { __sectionId: "s1", ...settings }, books: BOOKS, enableAnimations: false })));

const legacy = (settings: any) => {
  const manual = String(settings.manualSlugs || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const source = settings.productSource || "all";
  return BOOKS.filter((b: any) => source === "featured" ? (b.isFeatured ?? b.featured) === true : source === "manual" ? manual.includes(b.slug) : true).map((b) => b.title);
};

const SAVED = [{}, { productSource: "all" }, { productSource: "featured" }, { productSource: "manual", manualSlugs: "zqc, zqa" }, { productSource: "manual", manualSlugs: "" }];

describe("saved catalog sections render the same books", () => {
  for (const type of ["ProductGridHeaderSection", "ProductShowcaseGridSection"]) {
    it.each(SAVED.map((s) => [JSON.stringify(s), s]))(`${type} %s`, (_n, settings) => {
      expect(render(type, settings)).toEqual(legacy(settings));
    });
  }
  it("respects each section's own limit as before", () => {
    expect(render("ProductGridHeaderSection", { productLimit: 2 })).toEqual(["Zqx Alpha", "Zqx Bravo"]);
    expect(render("ProductShowcaseGridSection", { productLimit: 1, productSource: "featured" })).toEqual(["Zqx Alpha"]);
  });
  it("featured product shows the chosen book", () => {
    expect(render("FeaturedProductSection", { productSlug: "zqb" })).toEqual(["Zqx Bravo"]);
    expect(render("FeaturedProductSection", {})).toEqual(["Zqx Alpha"]);
  });
});

describe("new sources reach the storefront", () => {
  it("sorts picked books in the picked order when asked", () => {
    expect(render("ProductShowcaseGridSection", { productSource: "manual", manualSlugs: "zqc, zqa", productSort: "picked" })).toEqual(["Zqx Charlie", "Zqx Alpha"]);
  });
  it("on sale and price order", () => {
    expect(render("ProductGridHeaderSection", { productSource: "onSale" })).toEqual(["Zqx Bravo"]);
    expect(render("ProductGridHeaderSection", { productSort: "priceHigh" })).toEqual(["Zqx Alpha", "Zqx Charlie", "Zqx Bravo"]);
  });
  it("a category source uses the page's shop categories, so a parent includes its sub-categories", () => {
    const design = { categories: [{ id: "p", name: "Poetry" }, { id: "s", name: "Small press", parentId: "p" }] };
    const html = wrap(h(SectionList, {
      sections: [{ id: "g", type: "ProductShowcaseGridSection", settings: { productSource: "category", productCategory: "Poetry" } }],
      books: BOOKS, design, enableAnimations: false,
    }));
    expect(titlesIn(html)).toEqual(["Zqx Alpha", "Zqx Charlie"]);
  });
});
