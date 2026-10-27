import { describe, expect, it } from "vitest";
import { addSiteRun, healthRoutes, historyTrend, mergeSiteFindings, pageWeight, parseSiteHistory, SITE_HISTORY_MAX, type PageResult, type SiteFinding } from "./siteHealth";
import { previewRoute } from "./studioWorkflow";

const books = [
  { slug: "first", title: "First", status: "published" },
  { slug: "signed", title: "Signed", templateId: "special" },
];
const pages = [{ slug: "about", title: "About", status: "published" }, { slug: "secret", title: "Draft", status: "draft" }];
const design = { alternateTemplates: { productPage: [{ id: "special", name: "Special" }] } };

describe("which pages Check every page visits", () => {
  it("covers Home, the shop, one book per template, published pages, written policies, categories and the rest", () => {
    const { routes, skipped } = healthRoutes({ design, books, pages, policies: { shipping: "We ship", returns: "" }, collections: [{ slug: "poetry", label: "Poetry" }] });
    expect(routes.map(r => r.path)).toEqual([
      "/", "/?catalog=true",
      "/books/first?template=default", "/books/signed?template=special",
      "/page/about", "/page/policy-shipping",
      "/collections/publications", "/collections/poetry",
      "/wishlist", "/account", "/track", "/studio-missing-page",
    ]);
    expect(skipped).toBe(0);
    expect(new Set(routes.map(r => r.id)).size).toBe(routes.length);
  });
  it("maps every page Studio can show to its template", () => {
    const { routes } = healthRoutes({ design, books, pages, collections: [{ slug: "poetry", label: "Poetry" }] });
    const ids = routes.map(r => previewRoute(r.path, "/", { showHero: true })?.templateId);
    expect(ids).toEqual(["heroPage", "storefront", "productPage", "productPage~special", "page:about", "collectionPage", "collectionPage", "wishlistPage", "accountPage", "trackingPage", "page404"]);
  });
  it("opens on the shop when Home is off, and counts what it leaves out", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ slug: `p${i}`, status: "published" }));
    const { routes, skipped } = healthRoutes({ design: { showHero: false }, books: [], pages: many, maxPages: 2, collections: [{ slug: "a", label: "A" }, { slug: "b", label: "B" }], maxCategories: 2 });
    expect(routes[0]).toMatchObject({ id: "catalog", path: "/" });
    expect(routes.filter(r => r.group === "Pages")).toHaveLength(2);
    expect(routes.some(r => r.group === "Books")).toBe(false);
    expect(skipped).toBe(3 + 1);
  });
  it("escapes odd slugs in addresses", () => {
    const { routes } = healthRoutes({ design: {}, books: [{ slug: "a b?c", title: "X" }], pages: [] });
    expect(routes.find(r => r.group === "Books")?.path).toBe("/books/a%20b%3Fc?template=default");
  });
});

const finding = (id: string, severity: "issue" | "tip", count = 1): SiteFinding => ({ id, title: id, detail: "", category: "contrast", severity, count, owner: null });
const page = (id: string, findings: SiteFinding[], extra: Partial<PageResult> = {}): PageResult => ({ route: { id, label: id, group: "Pages", path: `/page/${id}` }, findings, ...extra });

describe("adding up a run", () => {
  it("lists a problem shared by several pages once, worst pages first, and counts it once", () => {
    const report = mergeSiteFindings([
      page("calm", [finding("header", "issue")]),
      page("busy", [finding("header", "issue"), finding("own", "issue", 3), finding("tip", "tip")]),
      page("broken", [], { error: "The page didn't load." }),
    ]);
    expect(report.shared.map(f => [f.id, f.pages])).toEqual([["header", ["calm", "busy"]]]);
    expect(report.pages.map(p => p.route.id)).toEqual(["broken", "busy", "calm"]);
    expect(report.pages.find(p => p.route.id === "busy")!.findings.map(f => f.id)).toEqual(["own", "tip"]);
    // A page whose only problem is shared still says it has one to fix.
    expect(report.pages.find(p => p.route.id === "calm")!.sharedIssues).toBe(1);
    expect(report.totals).toEqual({ pages: 3, checked: 2, failed: 1, issues: 1 + 3, tips: 1 });
  });
  it("estimates pictures and fonts from the browser's resource list", () => {
    expect(pageWeight([
      { name: "https://x.test/a.webp?v=1", initiatorType: "img", encodedBodySize: 2000 },
      { name: "https://x.test/pic", initiatorType: "img", transferSize: 500 },
      { name: "https://fonts.test/f.woff2", initiatorType: "css", encodedBodySize: 3000 },
      { name: "https://x.test/app.js", initiatorType: "script", encodedBodySize: 9000 },
      { name: "https://x.test/b.png", initiatorType: "img" },
    ])).toEqual({ imageBytes: 2500, fontBytes: 3000 });
  });
});

describe("history of past runs", () => {
  const run = (at: number, issues: number, device: "desktop" | "mobile" = "desktop") => ({ at, device, pages: 10, issues, tips: issues * 2, failed: 0 });
  it("keeps the last ten valid runs and drops broken ones", () => {
    let h: ReturnType<typeof parseSiteHistory> = [];
    for (let i = 1; i <= 12; i++) h = addSiteRun(h, run(i, i));
    expect(h).toHaveLength(SITE_HISTORY_MAX);
    expect(parseSiteHistory(JSON.stringify([...h, { at: "x" }, null]))).toEqual(h);
    expect(parseSiteHistory("not json")).toEqual([]);
  });
  it("compares the latest run with the one before it at the same size", () => {
    expect(historyTrend([run(1, 12)])).toBeNull();
    expect(historyTrend([run(1, 12), run(2, 5, "mobile"), run(3, 8)])).toBe("To fix 12 → 8 · suggestions 24 → 16");
  });
});
