// Product web addresses follow what the shop sells (plan 12.18): /books/<slug> in a books shop, /products/<slug> in
// any other, and both addresses open a product page in every shop.
import { afterEach, describe, expect, it } from "vitest";
import { productBase, SELLS, sellsBooks } from "../../shared/shopSells";
import { isProductPath, productHref, productSegment, productSlugOf, setProductSells } from "./productHref";
import { canonicalUrl } from "./canonicalUrl";
import { locationForPath } from "./studioLocation";
import { resolveSurfaceDesign } from "../features/site/surfaceDesign";
import { sitemapArtifacts } from "../../../scripts/sitemapData.mjs";
import { llmsTxt } from "../../../scripts/llmsTxt.mjs";
import { publicRoutes, routeOutputPath } from "../../../scripts/prerenderHtml.mjs";
import { merchantFeedItems } from "../features/site/merchantFeed.mjs";
import { checkOldLinks } from "../admin/oldLinks";

afterEach(() => setProductSells(null));

const SITE = "https://yourpress.example";
const book = { id: "b1", title: "Tee", slug: "tee", status: "published", retailPrice: 30, stockLevel: 2, photos: [{ url: `${SITE}/tee.jpg` }] };

describe("productBase", () => {
  it("is books for every books answer, an empty one and an unknown one", () => {
    for (const answer of [null, undefined, "", "books", "zines", "comics", "mix", "something-new"]) expect(productBase(answer)).toBe("books");
  });
  it("is products for every other answer", () => {
    for (const answer of SELLS.filter((s) => !sellsBooks(s))) expect(productBase(answer)).toBe("products");
  });
});

describe("productHref", () => {
  it("leaves a books shop's links exactly as they were, and before the answer is known", () => {
    expect(productHref("salt")).toBe("/books/salt");
    setProductSells("books");
    expect(productHref("salt")).toBe("/books/salt");
    expect(productSegment()).toBe("books");
  });
  it("uses /products/ for a shop that doesn't sell books, and follows a later change", () => {
    setProductSells("clothing");
    expect(productHref("tee")).toBe("/products/tee");
    expect(productSegment()).toBe("products");
    setProductSells("zines");
    expect(productHref("tee")).toBe("/books/tee");
  });
  it("reads both addresses as product pages", () => {
    expect(productSlugOf("/books/salt?x=1")).toBe("salt");
    expect(productSlugOf("/products/tee#top")).toBe("tee");
    expect(productSlugOf("/page/about")).toBeNull();
    expect(isProductPath("/products/tee")).toBe(true);
    expect(isProductPath("/productsx/tee")).toBe(false);
  });
});

describe("pages at either address", () => {
  it("gets the product page design, the slash-less canonical and the Studio location", () => {
    const design = { productPage: { accent: "#123" } };
    expect(resolveSurfaceDesign(design, "/products/tee")).toEqual(resolveSurfaceDesign(design, "/books/tee"));
    expect(resolveSurfaceDesign(design, "/products/tee")).not.toBe(design);
    expect(canonicalUrl(`${SITE}/products/tee/?utm=x`)).toBe(`${SITE}/products/tee`);
    expect(locationForPath("/products/tee")).toEqual({ templateId: "productPage", productSlug: "tee" });
  });
  it("prerenders /products/<slug> as its own file", () => {
    expect(routeOutputPath("/products/tee")).toBe("products/tee.html");
    expect(publicRoutes(`<urlset><url><loc>${SITE}/products/tee</loc></url></urlset>`, SITE, () => {})).toEqual(["/products/tee"]);
  });
  it("counts an old /products/<slug> link that names a product as working", () => {
    const [link] = checkOldLinks(["/products/tee"], { books: [book], pages: [], settings: {}, redirects: [] } as any);
    expect(link).toEqual({ path: "/products/tee", state: "works" });
  });
});

describe("files search engines and other sites read", () => {
  it("keep /books/ by default", () => {
    expect(sitemapArtifacts(SITE, [book], [], []).xml).toContain(`${SITE}/books/tee`);
    expect(merchantFeedItems(SITE, [book]).items[0].link).toBe(`${SITE}/books/tee`);
    expect(llmsTxt(SITE, [book], [], {})).toContain("## Books");
  });
  it("use /products/ for a shop that doesn't sell books", () => {
    const sitemap = sitemapArtifacts(SITE, [book], [], [], {}, { productBase: "products" }).xml;
    expect(sitemap).toContain(`${SITE}/products/tee`);
    expect(sitemap).not.toContain("/books/");
    expect(merchantFeedItems(SITE, [book], { productBase: "products" }).items[0].link).toBe(`${SITE}/products/tee`);
    const llms = llmsTxt(SITE, [book], [], {}, { productBase: "products" });
    expect(llms).toContain("## Products");
    expect(llms).toContain(`(${SITE}/products/tee)`);
  });
});
