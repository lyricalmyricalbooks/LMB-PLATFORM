// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_IMAGE } from "../features/site/constants";

// A product with no photo used to draw an empty box in every home page section, while the shop grid and the product
// page showed the stand-in picture. Each section that draws a product card must show it too.
const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const { SectionList } = await import("./sectionRender");

const TYPES = ["FeaturedProductSection", "ProductGridHeaderSection", "ProductShowcaseGridSection", "FeaturedCollectionSection", "BookSpotlightSection"];
const BOOK = { id: "b1", title: "No photo yet", price: 12, status: "published", category: "PUBLICATIONS", photos: [] };
const OWN = "https://shop.example/stand-in.jpg";

const render = (type: string, design: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null,
  h(SectionList, { sections: [{ id: "s1", type, settings: {} }], books: [BOOK], design, enableAnimations: false })))));
const attr = (url: string) => url.replace(/&/g, "&amp;");

describe("product cards with no photo", () => {
  for (const type of TYPES) {
    it(`${type} shows the stock picture`, () => {
      expect(render(type, {})).toContain(`src="${attr(DEFAULT_IMAGE)}"`);
    });
    it(`${type} shows the shop's own stand-in picture when Studio sets one`, () => {
      const html = render(type, { placeholderImageUrl: OWN });
      expect(html).toContain(`src="${OWN}"`);
      expect(html).not.toContain(attr(DEFAULT_IMAGE));
    });
  }
});
