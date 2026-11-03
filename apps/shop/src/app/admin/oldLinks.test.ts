// Check your old links (plan 23.8): each old address tried against the new shop's own routes and redirects.
import { describe, expect, it } from "vitest";
import { checkOldLinks, countLinks } from "./oldLinks";

const shop = {
  books: [
    { id: "b1", title: "Moth Songs", slug: "moth-songs", status: "published" },
    { id: "b2", title: "Salt Hours", status: "draft" },
  ],
  pages: [{ slug: "about", title: "About the press", status: "published" }, { slug: "faq", title: "Questions", status: "draft" }],
  settings: { policies: { returns: "Returns within 30 days." }, design: { categories: [{ id: "z", name: "Zines" }] } },
  redirects: [{ from: "/products/moth-songs", to: "/books/moth-songs" }],
};

describe("checking the old shop's links (plan 23.8)", () => {
  it("knows which old addresses the new shop answers, and suggests a home for the rest", () => {
    const links = checkOldLinks([
      "/", "/Products/Moth-Songs/", "/books/moth-songs", "/books/salt-hours", "/page/faq", "/page/policy-returns",
      "/collections/zines", "/cart", "/products/salt-hours", "/pages/about-us", "/policies/refund-policy",
      "/collections/zines/products/moth-songs", "/category/zine", "/shop", "/blog/news/a-new-year", "/products/moth-songs",
    ], shop);
    expect(links).toEqual([
      { path: "/", state: "works" },
      { path: "/products/moth-songs", state: "redirected", to: "/books/moth-songs" },
      { path: "/books/moth-songs", state: "works" },
      { path: "/books/salt-hours", state: "draft", to: "/books/salt-hours" },
      { path: "/page/faq", state: "draft", to: "/page/faq" },
      { path: "/page/policy-returns", state: "works" },
      { path: "/collections/zines", state: "works" },
      { path: "/cart", state: "works" },
      { path: "/products/salt-hours", state: "missing", suggestion: { to: "/books/salt-hours", label: "Salt Hours" } },
      { path: "/pages/about-us", state: "missing", suggestion: { to: "/page/about", label: "About the press" } },
      { path: "/policies/refund-policy", state: "missing", suggestion: { to: "/page/policy-returns", label: "Returns Policy" } },
      { path: "/collections/zines/products/moth-songs", state: "missing", suggestion: { to: "/books/moth-songs", label: "Moth Songs" } },
      { path: "/category/zine", state: "missing", suggestion: { to: "/collections/zines", label: "The zines collection" } },
      { path: "/shop", state: "missing", suggestion: { to: "/collections/all", label: "All your books" } },
      { path: "/blog/news/a-new-year", state: "missing", suggestion: { to: "/", label: "Your home page" } },
    ]);
    expect(countLinks(links)).toEqual({ works: 5, redirected: 1, draft: 2, missing: 7 });
  });

  it("a book address that isn't one of the shop's books goes through the redirects too", () => {
    expect(checkOldLinks(["/books/gone"], { ...shop, redirects: [{ from: "/books/gone", to: "/" }] })).toEqual([{ path: "/books/gone", state: "redirected", to: "/" }]);
    expect(checkOldLinks(["/books/gone"], shop)[0].state).toBe("missing");
  });
});
