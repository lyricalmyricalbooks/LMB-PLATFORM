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

describe("bringing the old shop's own pages over (plan 23.6)", () => {
  it("makes a draft page and a redirect for each, and never two pages at one address", async () => {
    const { pagesToSave } = await import("./oldLinks");
    const out = pagesToSave([
      { path: "/pages/about-us", slug: "about-us", title: "About us", body: "<p>Hi</p>", images: 2 },
      { path: "/faq", slug: "faq", title: "FAQ", body: "<p>Q</p>", images: 0 },
      { path: "/policy-returns", slug: "policy-returns", title: "Returns", body: "<p>R</p>", images: 1 },
      { path: "/pages/about", slug: "about", title: "About", body: "<p>Dup</p>", images: 0 },
    ], [{ slug: "about", order: 3 }]);
    expect(out.create).toEqual([
      { title: "About us", slug: "about-us", body: "<p>Hi</p>", status: "draft", showInNav: false, order: 4 },
      { title: "FAQ", slug: "faq", body: "<p>Q</p>", status: "draft", showInNav: false, order: 5 },
      { title: "Returns", slug: "old-policy-returns", body: "<p>R</p>", status: "draft", showInNav: false, order: 6 },
    ]);
    expect(out.redirects).toEqual([
      { from: "/pages/about-us", to: "/page/about-us" }, { from: "/faq", to: "/page/faq" }, { from: "/policy-returns", to: "/page/old-policy-returns" },
    ]);
    expect(out.skipped).toEqual([{ path: "/pages/about", reason: "is already here as /page/about" }]);
    expect(out.photos).toBe(3);
  });
});
