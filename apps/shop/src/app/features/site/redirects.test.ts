import { describe, expect, it } from "vitest";
import { cleanRedirects, findRedirect, MAX_REDIRECTS, normalizePath, normalizeTarget, parseRedirectLines, redirectProblem, redirectsFromStore, redirectsToPages } from "./redirects";

describe("redirects", () => {
  it("normalises old addresses", () => {
    expect(normalizePath("/Books/Old-Title/?x=1#y")).toBe("/books/old-title");
    expect(normalizePath("books/a")).toBe("/books/a");
    expect(normalizePath("https://x.com/a")).toBe("");
    expect(normalizePath("//evil.com")).toBe("");
  });
  it("accepts only on-site paths and https targets", () => {
    expect(normalizeTarget("books/new")).toBe("/books/new");
    expect(normalizeTarget("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeTarget("javascript:alert(1)")).toBe("");
    expect(normalizeTarget("http://example.com")).toBe("");
    expect(normalizeTarget("//evil.com")).toBe("");
  });
  it("refuses home, shop routes, duplicates, self and loops", () => {
    const list = [{ from: "/a", to: "/b" }];
    expect(redirectProblem({ from: "/", to: "/x" }, [])).toMatch(/home/);
    expect(redirectProblem({ from: "/checkout", to: "/x" }, [])).toMatch(/shop itself/);
    expect(redirectProblem({ from: "/a", to: "/c" }, list)).toMatch(/already/);
    expect(redirectProblem({ from: "/z", to: "/Z/" }, [])).toMatch(/same/);
    expect(redirectProblem({ from: "/b", to: "/a" }, list)).toMatch(/loop/);
    expect(redirectProblem({ from: "/c", to: "/a" }, list)).toBe("");
  });
  it("cleans a stored list", () => {
    expect(cleanRedirects([{ from: "/A", to: "/b" }, { from: "/a", to: "/c" }, { from: "/b", to: "/a" }, null, { from: "x", to: "javascript:1" }]))
      .toEqual([{ from: "/a", to: "/b" }]);
  });
  it("finds a redirect ignoring case, slash and home", () => {
    const list = [{ from: "/books/old", to: "/books/new" }];
    expect(findRedirect(list, "/Books/Old/")).toBe("/books/new");
    expect(findRedirect(list, "/books/other")).toBeNull();
    expect(findRedirect(list, "/")).toBeNull();
    expect(findRedirect(null, "/books/old")).toBeNull();
  });
  it("splits a list into pages of 500 and reads pages or the old single document back (plan 5.6)", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => ({ from: `/old/${i}`, to: `/books/${i}` }));
    for (const [n, sizes] of [[0, []], [499, [499]], [500, [500]], [501, [500, 1]], [5000, Array(10).fill(500)], [5001, Array(10).fill(500)]] as const) {
      const pages = redirectsToPages(list(n));
      expect(pages.map(p => p.items.length), String(n)).toEqual(sizes);
      expect(pages.map(p => p.id)).toEqual(sizes.map((_, i) => String(i + 1)));
      expect(redirectsFromStore({ pages: [...pages].reverse() })).toEqual(list(Math.min(n, MAX_REDIRECTS)));
    }
    const legacy = { items: list(2) };
    expect(redirectsFromStore({ legacy })).toEqual(list(2));
    expect(redirectsFromStore({ legacy: { ...legacy, paged: true } })).toEqual([]);
    expect(redirectsFromStore({ legacy, pages: [{ id: "1", items: list(1) }] })).toEqual(list(1));
    expect(redirectsFromStore({ pages: [{ id: "11", items: list(1) }, { id: "1", items: "nope" }] })).toEqual([]);
  });
  it("checks a full list of 5,000 quickly, and a loop through it is still caught", () => {
    const chain = Array.from({ length: MAX_REDIRECTS }, (_, i) => ({ from: `/c/${i}`, to: `/c/${i + 1}` }));
    const started = performance.now();
    expect(cleanRedirects(chain)).toHaveLength(MAX_REDIRECTS);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(redirectProblem({ from: "/c/5000", to: "/c/4996" }, chain)).toMatch(/loop/);
    expect(redirectProblem({ from: "/c/5000", to: "/c/0" }, chain)).toBe("");
  });
  it("parses pasted lines", () => {
    const r = parseRedirectLines("from,to\n/a, /b\n/c\t/d\nnonsense\n/b, /a", []);
    expect(r.added).toEqual([{ from: "/a", to: "/b" }, { from: "/c", to: "/d" }]);
    expect(r.skipped.map(s => s.line)).toEqual(["nonsense", "/b, /a"]);
  });
});
