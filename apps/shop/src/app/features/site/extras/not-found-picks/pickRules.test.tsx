import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { notFoundPicks, notFoundSearchPath } from "./pickRules";
import { NotFoundPicks } from "./NotFoundPicks";
import { CurrencyProvider } from "../../../../CurrencyContext";

const book = (id: string, extra: any = {}) => ({ id, slug: id, title: `Item ${id}`, status: "published", retailPrice: 20, stockLevel: 5, photos: [{ url: `/p/${id}.jpg` }], ...extra });

// Plan "Starters on par", step 7: a missing page offers a search box and four products.
describe("the missing page's search and products", () => {
  it("offers four products that can be bought now, featured first", () => {
    const books = [book("a"), book("b", { isFeatured: true }), book("c", { stockLevel: 0 }), book("d", { status: "draft" }), book("e"), book("f"), book("g")];
    const picks = notFoundPicks(books);
    expect(picks).toHaveLength(4);
    expect(picks[0].id).toBe("b");
    expect(picks.map((b) => b.id)).not.toContain("c");
    expect(picks.map((b) => b.id)).not.toContain("d");
    expect(notFoundPicks(null)).toEqual([]);
  });
  it("searches the shop page with the shopper's words", () => {
    expect(notFoundSearchPath("  linen bag ")).toBe("/collections/all?q=linen%20bag");
    expect(notFoundSearchPath("")).toBe("/collections/all");
  });
  it("draws nothing until a switch is on, then a labelled search and the product links", () => {
    const draw = (design: any) => renderToStaticMarkup(<CurrencyProvider><MemoryRouter><NotFoundPicks design={design} books={[book("a"), book("b")]} /></MemoryRouter></CurrencyProvider>);
    expect(draw({})).toBe("");
    const html = draw({ showNotFoundSearch: true, showNotFoundProducts: true });
    expect(html).toContain('role="search"');
    expect(html).toMatch(/<label[^>]*>Search the shop<\/label>/);
    expect(html).toContain("Or start with one of these");
    expect(html).toMatch(/href="\/(books|products)\/a"/);
    expect(html).toContain("<img");
  });
});
